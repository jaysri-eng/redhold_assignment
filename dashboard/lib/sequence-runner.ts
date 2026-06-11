/**
 * lib/sequence-runner.ts
 *
 * Local cron-based email nurture sequence runner.
 * Replaces the n8n webhook: writes a 3-step sequence record to
 * data/pending_sequences.json when a diagram is saved, then
 * processes due steps by calling POST /api/notify.
 *
 * DEMO_MODE=true changes inter-step delays to 1 minute each
 * so the full sequence can be tested during a live demo.
 */

import fs   from "fs";
import path from "path";

// Resolve data directory the same way lib/queue.ts does
const ROOT_DIR       = path.resolve(process.cwd(), "..");
const DATA_DIR       = path.join(ROOT_DIR, "data");
const SEQUENCES_FILE = path.join(DATA_DIR, "pending_sequences.json");

const DEMO_MODE = process.env.DEMO_MODE === "true";

// Delay (ms) before each step fires after the sequence is created
// Normal : step 1 = immediate, step 2 = 3 days, step 3 = 7 days
// Demo   : step 1 = immediate, step 2 = 1 min,  step 3 = 2 min
const STEP_DELAYS_MS: [number, number, number] = DEMO_MODE
  ? [0, 60_000, 120_000]
  : [0, 3 * 24 * 60 * 60 * 1_000, 7 * 24 * 60 * 60 * 1_000];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SequenceStep {
  step:         1 | 2 | 3;
  next_send_at: string; // ISO timestamp — when this step becomes due
  sent:         boolean;
}

export interface SequenceRecord {
  id:                       string;
  diagram_id:               string;
  diagram_title:            string;
  user_prompt:              string;
  suggestion_1_title:       string;
  suggestion_1_description: string;
  suggestion_2_title:       string;
  suggestion_2_description: string;
  user_context:             { role: string; company_type: string };
  decision_action:          string;
  steps:                    SequenceStep[];
  status:                   "active" | "complete";
  created_at:               string;
}

export interface AddSequenceParams {
  diagram_id:               string;
  diagram_title:            string;
  user_prompt:              string;
  suggestion_1_title:       string;
  suggestion_1_description: string;
  suggestion_2_title:       string;
  suggestion_2_description: string;
  user_context:             { role: string; company_type: string };
  decision_action:          string;
}

export interface ProcessResult {
  processed: number;
  skipped:   number;
  errors:    number;
  details:   {
    id:      string;
    step:    number;
    status:  "sent" | "skipped" | "error";
    message?: string;
  }[];
}

// ── Filesystem helpers ────────────────────────────────────────────────────────

function readSequences(): SequenceRecord[] {
  try {
    if (!fs.existsSync(SEQUENCES_FILE)) return [];
    const raw = fs.readFileSync(SEQUENCES_FILE, "utf-8");
    return JSON.parse(raw) as SequenceRecord[];
  } catch {
    return [];
  }
}

function writeSequences(sequences: SequenceRecord[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SEQUENCES_FILE, JSON.stringify(sequences, null, 2), "utf-8");
  } catch {
    // Silent fallback — never block the main request
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Write a demo sequence where step 1 is already past-due so it fires
 * on the very first "Send Due Emails" click. Steps 2 and 3 are 1 min / 2 min
 * out regardless of the DEMO_MODE env var — always short for demo use.
 */
export function addDemoSequence(params: AddSequenceParams): void {
  try {
    const now = Date.now();
    const record: SequenceRecord = {
      id:                       `${params.diagram_id}-demo-seq-${now}`,
      diagram_id:               params.diagram_id,
      diagram_title:            params.diagram_title,
      user_prompt:              params.user_prompt,
      suggestion_1_title:       params.suggestion_1_title,
      suggestion_1_description: params.suggestion_1_description,
      suggestion_2_title:       params.suggestion_2_title,
      suggestion_2_description: params.suggestion_2_description,
      user_context:             params.user_context,
      decision_action:          params.decision_action,
      steps: [
        { step: 1, next_send_at: new Date(now - 1_000).toISOString(),  sent: false }, // already due
        { step: 2, next_send_at: new Date(now + 10_000).toISOString(), sent: false }, // 10 sec
        { step: 3, next_send_at: new Date(now + 20_000).toISOString(), sent: false }, // 20 sec
      ],
      status:     "active",
      created_at: new Date(now).toISOString(),
    };

    const sequences = readSequences();
    // Remove any previous demo sequence for the same diagram to avoid duplicates
    const filtered = sequences.filter((s) => !s.id.includes(`${params.diagram_id}-demo-seq-`));
    filtered.push(record);
    writeSequences(filtered);
  } catch {
    // Silent fallback
  }
}

/**
 * Write a new 3-step nurture sequence for a freshly saved diagram.
 * Safe to call fire-and-forget; all errors are swallowed silently.
 */
export function addSequence(params: AddSequenceParams): void {
  try {
    const now = Date.now();
    const record: SequenceRecord = {
      id:                       `${params.diagram_id}-seq-${now}`,
      diagram_id:               params.diagram_id,
      diagram_title:            params.diagram_title,
      user_prompt:              params.user_prompt,
      suggestion_1_title:       params.suggestion_1_title,
      suggestion_1_description: params.suggestion_1_description,
      suggestion_2_title:       params.suggestion_2_title,
      suggestion_2_description: params.suggestion_2_description,
      user_context:             params.user_context,
      decision_action:          params.decision_action,
      steps: [
        { step: 1, next_send_at: new Date(now + STEP_DELAYS_MS[0]).toISOString(), sent: false },
        { step: 2, next_send_at: new Date(now + STEP_DELAYS_MS[1]).toISOString(), sent: false },
        { step: 3, next_send_at: new Date(now + STEP_DELAYS_MS[2]).toISOString(), sent: false },
      ],
      status:     "active",
      created_at: new Date(now).toISOString(),
    };

    const sequences = readSequences();
    sequences.push(record);
    writeSequences(sequences);
  } catch {
    // Silent fallback — sequence creation must never block the save
  }
}

/**
 * Scan pending_sequences.json, fire POST /api/notify for every step that
 * is now due, and update the record (mark sent / complete).
 *
 * @param baseUrl  Base URL of the running Next.js server (default: http://localhost:3000)
 */
export async function processDueSequences(
  baseUrl = "http://localhost:3000",
): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, skipped: 0, errors: 0, details: [] };

  let sequences: SequenceRecord[];
  try {
    sequences = readSequences();
  } catch {
    return result;
  }

  if (sequences.length === 0) return result;

  const now     = Date.now();
  let   changed = false;

  for (const seq of sequences) {
    if (seq.status === "complete") {
      result.skipped++;
      result.details.push({ id: seq.id, step: 0, status: "skipped", message: "already complete" });
      continue;
    }

    // Pick the first unsent step that is currently due
    const dueStep = seq.steps.find(
      (s) => !s.sent && new Date(s.next_send_at).getTime() <= now,
    );

    if (!dueStep) {
      result.skipped++;
      result.details.push({ id: seq.id, step: 0, status: "skipped", message: "no step due yet" });
      continue;
    }

    try {
      const response = await fetch(`${baseUrl}/api/notify`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagram_id:               seq.diagram_id,
          diagram_title:            seq.diagram_title,
          user_prompt:              seq.user_prompt,
          suggestion_1_title:       seq.suggestion_1_title,
          suggestion_1_description: seq.suggestion_1_description,
          suggestion_2_title:       seq.suggestion_2_title,
          suggestion_2_description: seq.suggestion_2_description,
          email_step:               dueStep.step,
          user_context:             seq.user_context,
          decision_action:          seq.decision_action,
        }),
      });

      if (response.ok) {
        dueStep.sent = true;
        changed      = true;

        if (seq.steps.every((s) => s.sent)) {
          seq.status = "complete";
        }

        result.processed++;
        result.details.push({ id: seq.id, step: dueStep.step, status: "sent" });
      } else {
        result.errors++;
        result.details.push({
          id:      seq.id,
          step:    dueStep.step,
          status:  "error",
          message: `HTTP ${response.status}`,
        });
      }
    } catch (err) {
      result.errors++;
      result.details.push({
        id:      seq.id,
        step:    dueStep.step,
        status:  "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (changed) writeSequences(sequences);

  return result;
}
