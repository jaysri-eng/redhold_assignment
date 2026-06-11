// lib/intent.ts — Intent scoring engine for the Intent Intelligence Layer
//
// Reads events produced by lib/events.ts, computes an intent score, derives a
// segment, and persists the profile at data/intent/<user_id>.json.

import fs   from "fs";
import path from "path";
import type { EventType, TrackedEvent } from "./events";
import type { IntentSegment }           from "@/types/queue";

const ROOT_DIR   = path.resolve(process.cwd(), "..");
const INTENT_DIR = path.join(ROOT_DIR, "data", "intent");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IntentProfile {
  user_id:      string;
  intent_score: number;
  segment:      IntentSegment;
  last_updated: string;
  event_counts: Partial<Record<EventType, number>>;
}

// ── Scoring table ─────────────────────────────────────────────────────────────

const SCORE_MAP: Partial<Record<EventType, number>> = {
  diagram_generated:                    5,
  multiple_generations_same_session:   10,
  shared_diagram_viewed:                5,
  team_collaboration_detected:         25,
  cta_clicked:                         20,
  free_limit_reached:                  30,
  returning_user:                      20,
  abandoned_after_first_generation:   -15,
};

// ── Segment thresholds ────────────────────────────────────────────────────────

function scoreToSegment(score: number): IntentSegment {
  if (score >= 81) return "champion";
  if (score >= 51) return "high_intent";
  if (score >= 21) return "engaged";
  return "casual";
}

// ── Filesystem helpers ────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!fs.existsSync(INTENT_DIR)) fs.mkdirSync(INTENT_DIR, { recursive: true });
}

function intentFilePath(user_id: string): string {
  const safe = user_id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return path.join(INTENT_DIR, `${safe}.json`);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Pure function: sum event scores from the given event list.
 * Does not read from disk — pass the result of getUserEvents().
 */
export function calculateIntentScore(events: TrackedEvent[]): number {
  return events.reduce((total, evt) => total + (SCORE_MAP[evt.event_type] ?? 0), 0);
}

/**
 * Read the persisted intent profile for a user.
 * Returns null if the user has no profile yet.
 */
export function getIntentProfile(user_id: string): IntentProfile | null {
  ensureDir();
  const filePath = intentFilePath(user_id);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as IntentProfile;
  } catch {
    return null;
  }
}

/**
 * Recalculate and persist the intent profile from all known events.
 * Call this after every trackEvent() to keep the profile current.
 */
export function updateIntentProfile(
  user_id: string,
  events:  TrackedEvent[],
): IntentProfile {
  ensureDir();

  const score: number = calculateIntentScore(events);

  const event_counts: Partial<Record<EventType, number>> = {};
  for (const evt of events) {
    event_counts[evt.event_type] = (event_counts[evt.event_type] ?? 0) + 1;
  }

  const profile: IntentProfile = {
    user_id,
    intent_score: score,
    segment:      scoreToSegment(score),
    last_updated: new Date().toISOString(),
    event_counts,
  };

  fs.writeFileSync(intentFilePath(user_id), JSON.stringify(profile, null, 2), "utf-8");

  return profile;
}
