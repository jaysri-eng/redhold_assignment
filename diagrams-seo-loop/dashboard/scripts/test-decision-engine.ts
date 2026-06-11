/**
 * test-decision-engine.ts
 *
 * Runs two scenarios through the AI Decision Engine to show the
 * deterministic rules engine output under the hood.
 *
 * Run from the dashboard/ directory:
 *   npx tsx scripts/test-decision-engine.ts
 *
 * No servers, no Ollama, no network needed.
 */

// We call makeDecision() directly so we can see Phase 1 rules firing
// without needing the full Next.js stack.

// ── Inline the types so we don't need Next.js module resolution ──────────────

type IntentSegment  = "casual" | "engaged" | "high_intent" | "champion";
type DecisionAction =
  | "none"
  | "educational_email"
  | "upgrade_email"
  | "champion_outreach"
  | "team_collaboration_followup"
  | "returning_user_nurture"
  | "free_limit_conversion"
  | "high_intent_followup";
type DecisionPriority = "low" | "medium" | "high";

type EventType =
  | "diagram_generated"
  | "multiple_generations_same_session"
  | "shared_diagram_viewed"
  | "team_collaboration_detected"
  | "cta_clicked"
  | "free_limit_reached"
  | "returning_user"
  | "abandoned_after_first_generation";

interface DecisionInput {
  user_id?:       string;
  intent_score:   number;
  intent_segment: IntentSegment;
  event_counts:   Partial<Record<EventType, number>>;
  user_context?:  { role: string; company_type: string };
}

interface DecisionResult {
  action:       DecisionAction;
  reason:       string;
  confidence:   number;
  priority:     DecisionPriority;
  generated_at: string;
}

// ── Inline the rules engine (mirrors lib/decision-engine.ts exactly) ─────────

function makeDecision(input: DecisionInput): DecisionResult {
  const { intent_score, intent_segment, event_counts } = input;
  const generated_at = new Date().toISOString();

  if ((event_counts.free_limit_reached ?? 0) > 0) {
    return {
      action:       "free_limit_conversion",
      reason:       "User has consumed enough free diagrams to feel the gate — this is the highest-conversion moment to present the upgrade path.",
      confidence:   0.95,
      priority:     "high",
      generated_at,
    };
  }

  if (intent_segment === "champion") {
    return {
      action:       "champion_outreach",
      reason:       `Intent score ${intent_score} with champion classification — this user demonstrates power-user patterns. A personalised outreach will resonate.`,
      confidence:   0.92,
      priority:     "high",
      generated_at,
    };
  }

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

  if ((event_counts.returning_user ?? 0) > 0) {
    return {
      action:       "returning_user_nurture",
      reason:       "User returned after 7+ days — the tool solved a real problem and they came back. Nurture this retention signal with deeper product value.",
      confidence:   0.80,
      priority:     "medium",
      generated_at,
    };
  }

  if (intent_score > 70) {
    return {
      action:       "high_intent_followup",
      reason:       `Intent score ${intent_score} places this user in strong engagement territory. A timely follow-up will capitalise on their active interest.`,
      confidence:   0.75,
      priority:     "high",
      generated_at,
    };
  }

  if (intent_score >= 30) {
    return {
      action:       "educational_email",
      reason:       `Intent score ${intent_score} indicates growing engagement. Educational content will build familiarity and move this user toward conversion.`,
      confidence:   0.65,
      priority:     "medium",
      generated_at,
    };
  }

  return {
    action:       "none",
    reason:       `Intent score ${intent_score} is below the engagement threshold. Sending outreach now risks noise — wait for stronger behavioral signals.`,
    confidence:   0.50,
    priority:     "low",
    generated_at,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<DecisionPriority, string> = {
  low:    "\x1b[90m",   // gray
  medium: "\x1b[33m",   // yellow
  high:   "\x1b[32m",   // green
};

const ACTION_LABEL: Record<DecisionAction, string> = {
  none:                        "No Action",
  educational_email:           "Educational Email",
  upgrade_email:               "Upgrade Email",
  champion_outreach:           "Champion Outreach",
  team_collaboration_followup: "Team Collaboration Follow-up",
  returning_user_nurture:      "Returning User Nurture",
  free_limit_conversion:       "Free Limit Conversion",
  high_intent_followup:        "High-Intent Follow-up",
};

const RESET = "\x1b[0m";
const BOLD  = "\x1b[1m";
const CYAN  = "\x1b[36m";
const DIM   = "\x1b[2m";

function bar(confidence: number, width = 30): string {
  const filled = Math.round(confidence * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function printDecision(
  label:    string,
  input:    DecisionInput,
  result:   DecisionResult,
): void {
  const pc = PRIORITY_COLOR[result.priority];

  console.log(`\n${BOLD}${CYAN}─── ${label} ${"─".repeat(Math.max(0, 55 - label.length))}${RESET}`);

  console.log(`\n  ${DIM}Intent profile${RESET}`);
  console.log(`    Score     ${BOLD}${input.intent_score}${RESET}  (${input.intent_segment})`);
  console.log(`    Role      ${input.user_context?.role ?? "—"}`);
  console.log(`    Company   ${input.user_context?.company_type ?? "—"}`);
  console.log(`    Events    ${JSON.stringify(input.event_counts)}`);

  console.log(`\n  ${DIM}Decision Engine output${RESET}`);
  console.log(`    Action    ${BOLD}${CYAN}${ACTION_LABEL[result.action]}${RESET}`);
  console.log(`    Priority  ${pc}${BOLD}${result.priority.toUpperCase()}${RESET}`);
  console.log(`    Confidence ${bar(result.confidence)} ${Math.round(result.confidence * 100)}%`);
  console.log(`    Reason    ${DIM}${result.reason}${RESET}`);
}

// ── Scenario 1 ────────────────────────────────────────────────────────────────
// A Platform Engineer at a B2B SaaS company who has:
//   • Generated 5 diagrams
//   • Had 2 teammates view a shared diagram
//   • Never hit the free limit
//
// Expected rule to fire: team_collaboration_followup (Rule 3)

const scenario1: DecisionInput = {
  user_id:        "demo-user-a",
  intent_score:   60,
  intent_segment: "high_intent",
  event_counts: {
    diagram_generated:           5,
    team_collaboration_detected: 2,
    returning_user:              1,
  },
  user_context: {
    role:         "Platform Engineer",
    company_type: "B2B SaaS",
  },
};

// ── Scenario 2 ────────────────────────────────────────────────────────────────
// A DevOps Lead at a Fintech startup who has:
//   • Generated 8 diagrams
//   • Hit the free limit
//   • Has a champion-level intent score
//
// Expected rule to fire: free_limit_conversion (Rule 1 — highest priority)

const scenario2: DecisionInput = {
  user_id:        "demo-user-b",
  intent_score:   88,
  intent_segment: "champion",
  event_counts: {
    diagram_generated:                    8,
    multiple_generations_same_session:    3,
    free_limit_reached:                   1,
    returning_user:                       2,
  },
  user_context: {
    role:         "DevOps Lead",
    company_type: "Fintech startup",
  },
};

// ── Run ───────────────────────────────────────────────────────────────────────

console.log(`\n${BOLD}${CYAN}AI Decision Engine — Test Run${RESET}`);
console.log(`${DIM}Phase 1 rules engine (deterministic, no Ollama needed)${RESET}`);

printDecision("Scenario 1 — Multi-stakeholder evaluation", scenario1, makeDecision(scenario1));
printDecision("Scenario 2 — Champion hits free limit",     scenario2, makeDecision(scenario2));

console.log(`\n${DIM}─────────────────────────────────────────────────────────${RESET}`);
console.log(`${DIM}To use Ollama AI mode: set ENABLE_AI_DECISION_ENGINE=true in .env.local${RESET}\n`);
