// lib/decision-engine.ts — AI Decision Engine for Diagrams.so
//
// Transforms intent intelligence into a concrete next-action recommendation.
// Phase 1: deterministic rules engine (always active).
// Phase 2: optional Ollama-powered AI layer (enabled via ENABLE_AI_DECISION_ENGINE=true).
//
// The engine never performs actions — it only decides what should happen next.
// Inspired by Pocus, CommonRoom, UserMotion, and HockeyStack.

import fs   from "fs";
import path from "path";
import type { IntentSegment } from "@/types/queue";
import type { EventType }     from "./events";
import { ollamaGenerate, detectOllamaModel } from "./ollama";

// ── Public types ──────────────────────────────────────────────────────────────

export type DecisionAction =
  | "none"
  | "educational_email"
  | "upgrade_email"
  | "champion_outreach"
  | "team_collaboration_followup"
  | "returning_user_nurture"
  | "free_limit_conversion"
  | "high_intent_followup";

export type DecisionPriority = "low" | "medium" | "high";

export interface DecisionResult {
  action:       DecisionAction;
  reason:       string;
  confidence:   number;
  priority:     DecisionPriority;
  generated_at: string;
}

export interface DecisionInput {
  user_id?:      string;
  intent_score:  number;
  intent_segment: IntentSegment;
  event_counts:  Partial<Record<EventType, number>>;
  user_context?: {
    role:         string;
    company_type: string;
  };
  /** Recent event types in order, newest first — used by AI mode */
  recent_events?: EventType[];
}

// ── Storage ───────────────────────────────────────────────────────────────────

const ROOT_DIR      = path.resolve(process.cwd(), "..");
const DECISIONS_DIR = path.join(ROOT_DIR, "data", "decisions");

interface StoredDecision {
  user_id:   string;
  item_id?:  string;
  decision:  DecisionResult;
}

function ensureDecisionsDir(): void {
  if (!fs.existsSync(DECISIONS_DIR)) {
    fs.mkdirSync(DECISIONS_DIR, { recursive: true });
  }
}

function decisionsFilePath(user_id: string): string {
  const safe = user_id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return path.join(DECISIONS_DIR, `${safe}.json`);
}

/**
 * Persist a decision to data/decisions/<user_id>.json.
 * Appends to the user's decision history — every decision is inspectable.
 */
export function persistDecision(
  user_id:  string,
  decision: DecisionResult,
  item_id?: string,
): void {
  ensureDecisionsDir();
  const filePath = decisionsFilePath(user_id);

  let history: StoredDecision[] = [];
  if (fs.existsSync(filePath)) {
    try {
      history = JSON.parse(fs.readFileSync(filePath, "utf-8")) as StoredDecision[];
    } catch {
      history = [];
    }
  }

  history.push({ user_id, item_id, decision });
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2), "utf-8");
}

/**
 * Read the full decision history for a user.
 * Returns an empty array if no decisions have been recorded.
 */
export function getDecisionHistory(user_id: string): StoredDecision[] {
  ensureDecisionsDir();
  const filePath = decisionsFilePath(user_id);
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as StoredDecision[];
  } catch {
    return [];
  }
}

// ── Phase 1 — Deterministic rules engine ─────────────────────────────────────
//
// Rule priority (first match wins):
//  1. free_limit_reached event → free_limit_conversion  (highest-intent moment)
//  2. champion segment         → champion_outreach
//  3. team_collaboration event → team_collaboration_followup
//  4. returning_user event     → returning_user_nurture
//  5. score > 70               → high_intent_followup
//  6. score 30–70              → educational_email
//  7. default                  → none

export function makeDecision(input: DecisionInput): DecisionResult {
  const { intent_score, intent_segment, event_counts } = input;

  const generated_at = new Date().toISOString();

  // Rule 1 — free limit reached (strongest conversion signal)
  if ((event_counts.free_limit_reached ?? 0) > 0) {
    return {
      action:       "free_limit_conversion",
      reason:       "User has consumed enough free diagrams to feel the gate — this is the highest-conversion moment to present the upgrade path.",
      confidence:   0.95,
      priority:     "high",
      generated_at,
    };
  }

  // Rule 2 — champion segment (power users: sharing, returning, hitting limits)
  if (intent_segment === "champion") {
    return {
      action:       "champion_outreach",
      reason:       `Intent score ${intent_score} with champion classification — this user demonstrates power-user patterns. A personalised outreach will resonate.`,
      confidence:   0.92,
      priority:     "high",
      generated_at,
    };
  }

  // Rule 3 — team collaboration detected (multi-stakeholder evaluation)
  if ((event_counts.team_collaboration_detected ?? 0) > 0) {
    const count = event_counts.team_collaboration_detected ?? 1;
    return {
      action:       "team_collaboration_followup",
      reason:       `A colleague viewed a shared diagram (${count} collaboration event${count > 1 ? "s" : ""} detected), indicating multi-stakeholder evaluation. A team-focused follow-up is warranted.`,
      confidence:   0.88,
      priority:     "high",
      generated_at,
    };
  }

  // Rule 4 — returning user (retention signal)
  if ((event_counts.returning_user ?? 0) > 0) {
    return {
      action:       "returning_user_nurture",
      reason:       "User returned after 7+ days — the tool solved a real problem and they came back. Nurture this retention signal with deeper product value.",
      confidence:   0.80,
      priority:     "medium",
      generated_at,
    };
  }

  // Rule 5 — high score (>70) without champion segment
  if (intent_score > 70) {
    return {
      action:       "high_intent_followup",
      reason:       `Intent score ${intent_score} places this user in strong engagement territory. A timely follow-up will capitalise on their active interest.`,
      confidence:   0.75,
      priority:     "high",
      generated_at,
    };
  }

  // Rule 6 — engaged range (30–70)
  if (intent_score >= 30) {
    return {
      action:       "educational_email",
      reason:       `Intent score ${intent_score} indicates growing engagement. Educational content will build familiarity and move this user toward conversion.`,
      confidence:   0.65,
      priority:     "medium",
      generated_at,
    };
  }

  // Default — too early or too low signal
  return {
    action:       "none",
    reason:       `Intent score ${intent_score} is below the engagement threshold. Sending outreach now risks noise — wait for stronger behavioral signals.`,
    confidence:   0.50,
    priority:     "low",
    generated_at,
  };
}

// ── Phase 2 — Optional AI mode (Ollama) ──────────────────────────────────────
//
// Activated via ENABLE_AI_DECISION_ENGINE=true in .env.local.
// Falls back to the deterministic engine on any Ollama failure.

const VALID_ACTIONS: DecisionAction[] = [
  "none",
  "educational_email",
  "upgrade_email",
  "champion_outreach",
  "team_collaboration_followup",
  "returning_user_nurture",
  "free_limit_conversion",
  "high_intent_followup",
];

const VALID_PRIORITIES: DecisionPriority[] = ["low", "medium", "high"];

export async function generateDecisionWithAI(
  input: DecisionInput,
): Promise<DecisionResult> {
  const generated_at = new Date().toISOString();

  try {
    const model = await detectOllamaModel();

    const recentEventsText = (input.recent_events ?? [])
      .slice(0, 5)
      .join(", ") || "none";

    const prompt = `You are a product-led growth strategist.

Given the user profile and behavioral signals below, choose the best next action.

User profile:
- Role: ${input.user_context?.role ?? "unknown"}
- Company type: ${input.user_context?.company_type ?? "unknown"}
- Intent score: ${input.intent_score}
- Intent segment: ${input.intent_segment}
- Recent events: ${recentEventsText}
- Event counts: ${JSON.stringify(input.event_counts)}

Available actions:
- none
- educational_email
- upgrade_email
- champion_outreach
- team_collaboration_followup
- returning_user_nurture
- free_limit_conversion
- high_intent_followup

Return JSON only, no extra text:
{
  "action": "...",
  "reason": "...",
  "confidence": 0.0-1.0,
  "priority": "low|medium|high"
}`;

    const raw = await ollamaGenerate(prompt, model, 200);

    // Extract the first JSON object from the response
    const match = raw.match(/\{[\s\S]*?\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as {
        action?:     string;
        reason?:     string;
        confidence?: number;
        priority?:   string;
      };

      const action   = VALID_ACTIONS.includes(parsed.action as DecisionAction)
        ? (parsed.action as DecisionAction)
        : null;
      const priority = VALID_PRIORITIES.includes(parsed.priority as DecisionPriority)
        ? (parsed.priority as DecisionPriority)
        : null;
      const confidence = typeof parsed.confidence === "number"
        ? Math.min(1, Math.max(0, parsed.confidence))
        : null;
      const reason = typeof parsed.reason === "string" && parsed.reason.trim().length > 4
        ? parsed.reason.trim()
        : null;

      if (action && priority && confidence !== null && reason) {
        return { action, reason, confidence, priority, generated_at };
      }
    }
  } catch {
    // Fall through to deterministic fallback
  }

  // Fallback: use deterministic engine
  return makeDecision(input);
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Generate a decision for the given user context.
 *
 * Uses the deterministic rules engine by default.
 * If ENABLE_AI_DECISION_ENGINE=true, attempts Ollama AI mode first and
 * falls back to the rules engine on failure.
 *
 * Optionally persists the decision to data/decisions/<user_id>.json.
 */
export async function getDecision(
  input:    DecisionInput,
  item_id?: string,
): Promise<DecisionResult> {
  const aiEnabled = process.env.ENABLE_AI_DECISION_ENGINE === "true";

  const decision = aiEnabled
    ? await generateDecisionWithAI(input)
    : makeDecision(input);

  // Persist to disk if we have a user_id
  if (input.user_id?.trim()) {
    try {
      persistDecision(input.user_id.trim(), decision, item_id);
    } catch {
      // Storage failure must never block the response
    }
  }

  return decision;
}
