// lib/events.ts — Server-side event tracking for the Intent Intelligence Layer
//
// Each user's events are stored as a flat JSON array at data/events/<user_id>.json.
// The file is appended-to on every trackEvent() call and is the source-of-truth
// for the intent scoring engine in lib/intent.ts.

import fs   from "fs";
import path from "path";
import { randomUUID } from "crypto";

const ROOT_DIR   = path.resolve(process.cwd(), "..");
const EVENTS_DIR = path.join(ROOT_DIR, "data", "events");

// ── Types ─────────────────────────────────────────────────────────────────────

export type EventType =
  | "diagram_generated"
  | "multiple_generations_same_session"
  | "shared_diagram_viewed"
  | "team_collaboration_detected"
  | "cta_clicked"
  | "free_limit_reached"
  | "returning_user"
  | "abandoned_after_first_generation";

export interface TrackedEvent {
  id:         string;
  user_id:    string;
  event_type: EventType;
  timestamp:  string;
  metadata:   Record<string, unknown>;
}

// ── Filesystem helpers ────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!fs.existsSync(EVENTS_DIR)) fs.mkdirSync(EVENTS_DIR, { recursive: true });
}

function eventsFilePath(user_id: string): string {
  // Sanitise — user_id is a UUID so this is safe, but guard against path traversal
  const safe = user_id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return path.join(EVENTS_DIR, `${safe}.json`);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Append a single event to the user's event log and return it.
 * Creates the file if it does not exist yet.
 */
export function trackEvent(
  user_id:    string,
  event_type: EventType,
  metadata:   Record<string, unknown> = {},
): TrackedEvent {
  ensureDir();

  const event: TrackedEvent = {
    id:         randomUUID(),
    user_id,
    event_type,
    timestamp:  new Date().toISOString(),
    metadata,
  };

  const filePath = eventsFilePath(user_id);
  let events: TrackedEvent[] = [];

  if (fs.existsSync(filePath)) {
    try {
      events = JSON.parse(fs.readFileSync(filePath, "utf-8")) as TrackedEvent[];
    } catch {
      events = [];
    }
  }

  events.push(event);
  fs.writeFileSync(filePath, JSON.stringify(events, null, 2), "utf-8");

  return event;
}

/**
 * Return all events for a given user_id, oldest first.
 * Returns an empty array if the user has no recorded events.
 */
export function getUserEvents(user_id: string): TrackedEvent[] {
  ensureDir();
  const filePath = eventsFilePath(user_id);
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as TrackedEvent[];
  } catch {
    return [];
  }
}
