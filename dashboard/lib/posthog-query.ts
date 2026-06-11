/**
 * lib/posthog-query.ts
 *
 * Server-side PostHog query helper.
 * Queries the PostHog HogQL API to get a user's event counts, then maps
 * those counts to a decision_action — replacing the local intent + decision
 * engine with PostHog as the source of truth.
 *
 * Required env vars (set in .env.local):
 *   POSTHOG_PERSONAL_API_KEY  — from PostHog → avatar → Personal API Keys
 *   POSTHOG_PROJECT_ID        — from PostHog → Project Settings → Project ID
 *
 * Optional:
 *   POSTHOG_HOST              — defaults to https://us.posthog.com
 *
 * If the env vars are not set every function returns safe defaults so the
 * existing local intent/decision engine continues to work as a fallback.
 */

import type { DecisionAction } from "@/types/queue";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PostHogEventCounts {
  diagram_generated:  number;
  free_limit_reached: number;
  cta_clicked:        number;
  diagram_saved:      number;
}

interface HogQLResult {
  results:  [string, number][];
  columns?: string[];
  error?:   string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isConfigured(): boolean {
  return !!(process.env.POSTHOG_PERSONAL_API_KEY && process.env.POSTHOG_PROJECT_ID);
}

const EMPTY_COUNTS: PostHogEventCounts = {
  diagram_generated:  0,
  free_limit_reached: 0,
  cta_clicked:        0,
  diagram_saved:      0,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns true when POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID are set.
 * Use this to decide whether to use PostHog or the local engine.
 */
export function isPostHogConfigured(): boolean {
  return isConfigured();
}

/**
 * Query PostHog's HogQL API for a user's event counts.
 * Returns zeroed counts on any error so the caller can safely fall back.
 */
export async function getUserEventCounts(
  distinctId: string,
): Promise<PostHogEventCounts> {
  if (!isConfigured() || !distinctId) return { ...EMPTY_COUNTS };

  const apiKey    = process.env.POSTHOG_PERSONAL_API_KEY!;
  const projectId = process.env.POSTHOG_PROJECT_ID!;
  const host      = process.env.POSTHOG_HOST ?? "https://us.posthog.com";

  // Sanitise: prevent injection into the HogQL literal string
  const safeId = distinctId.replace(/'/g, "''").slice(0, 200);

  const hogql = `
    SELECT event, count() AS cnt
    FROM events
    WHERE distinct_id = '${safeId}'
      AND event IN (
        'diagram_generated',
        'free_limit_reached',
        'cta_clicked',
        'diagram_saved'
      )
    GROUP BY event
  `.trim();

  try {
    const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: hogql } }),
    });

    if (!res.ok) {
      console.warn(`[posthog-query] HTTP ${res.status} for user ${distinctId}`);
      return { ...EMPTY_COUNTS };
    }

    const data = (await res.json()) as HogQLResult;

    if (data.error) {
      console.warn("[posthog-query] HogQL error:", data.error);
      return { ...EMPTY_COUNTS };
    }

    const counts = { ...EMPTY_COUNTS };
    for (const [event, count] of (data.results ?? [])) {
      if (event in counts) {
        (counts as Record<string, number>)[event] = Number(count) || 0;
      }
    }

    return counts;
  } catch (err) {
    console.warn("[posthog-query] fetch error:", err);
    return { ...EMPTY_COUNTS };
  }
}

/**
 * Map PostHog event counts → decision_action.
 * Mirrors the priority order of the local decision engine.
 *
 *   free_limit_reached ≥ 1  → free_limit_conversion   (highest urgency)
 *   diagram_saved      ≥ 3  → champion_outreach
 *   diagram_generated  ≥ 5  → high_intent_followup
 *   diagram_generated  ≥ 2  → educational_email
 *   cta_clicked        ≥ 1  → educational_email (clicked but hasn't generated)
 *   otherwise               → educational_email (default — always nurture)
 */
export function eventCountsToDecisionAction(
  counts: PostHogEventCounts,
): DecisionAction {
  if (counts.free_limit_reached >= 1) return "free_limit_conversion";
  if (counts.diagram_saved      >= 3) return "champion_outreach";
  if (counts.diagram_generated  >= 5) return "high_intent_followup";
  return "educational_email";
}

/**
 * Merge PostHog event counts with locally-known counts, taking the max of each.
 *
 * PostHog has a few-second ingestion lag. If the user just generated a diagram,
 * PostHog may return 0 while the local intent profile already has 1+.
 * By taking the max, we always use whichever source has fresher data.
 */
export function mergeEventCounts(
  postHog: PostHogEventCounts,
  local:   Partial<PostHogEventCounts>,
): PostHogEventCounts {
  return {
    diagram_generated:  Math.max(postHog.diagram_generated,  local.diagram_generated  ?? 0),
    free_limit_reached: Math.max(postHog.free_limit_reached, local.free_limit_reached ?? 0),
    cta_clicked:        Math.max(postHog.cta_clicked,        local.cta_clicked        ?? 0),
    diagram_saved:      Math.max(postHog.diagram_saved,      local.diagram_saved      ?? 0),
  };
}

/**
 * Convenience: query PostHog and return the decision_action in one call.
 * Returns "educational_email" on any error so email sequences always fire.
 */
export async function getDecisionFromPostHog(
  distinctId: string,
): Promise<DecisionAction> {
  try {
    const counts = await getUserEventCounts(distinctId);
    return eventCountsToDecisionAction(counts);
  } catch {
    return "educational_email";
  }
}
