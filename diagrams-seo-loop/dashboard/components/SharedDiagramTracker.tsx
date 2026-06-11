"use client";

// SharedDiagramTracker — client-side intent tracking for public shared diagram pages.
//
// This component renders nothing visible. It fires behavioral events to
// /api/events on mount (page view, team collaboration detection) and wraps the
// "Generate your own" CTA to capture cta_clicked events.

import { useEffect, useCallback } from "react";
import Link from "next/link";

const LS_USER_ID_KEY = "diagrams_user_id";

type SharedIntentEvent =
  | "shared_diagram_viewed"
  | "team_collaboration_detected"
  | "cta_clicked";

async function emitIntent(
  userId:    string,
  eventType: SharedIntentEvent,
  metadata:  Record<string, unknown> = {},
): Promise<void> {
  try {
    await fetch("/api/events", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ user_id: userId, event_type: eventType, metadata }),
    });
  } catch {
    // Fire-and-forget — never surface to the visitor
  }
}

function getOrCreateUserId(): string {
  const existing = localStorage.getItem(LS_USER_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(LS_USER_ID_KEY, id);
  return id;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface PageTrackerProps {
  diagramId:       string;
  creatorUserId?:  string;
}

/**
 * Fires shared_diagram_viewed (always) and team_collaboration_detected (when
 * the viewer's anonymous user ID differs from the creator's stored ID).
 * Renders nothing — attach anywhere inside the page.
 */
export function SharedPageTracker({ diagramId, creatorUserId }: PageTrackerProps) {
  useEffect(() => {
    const viewerUserId = getOrCreateUserId();

    void emitIntent(viewerUserId, "shared_diagram_viewed", { diagram_id: diagramId });

    // If the viewer's ID doesn't match the creator's, a different person is
    // looking at this diagram — that's a team collaboration signal.
    if (creatorUserId && viewerUserId !== creatorUserId) {
      void emitIntent(viewerUserId, "team_collaboration_detected", {
        diagram_id:       diagramId,
        creator_user_id:  creatorUserId,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  return null;
}

// ── CTA button with click tracking ───────────────────────────────────────────

interface CtaLinkProps {
  diagramId: string;
  style?:    React.CSSProperties;
}

/**
 * Drop-in replacement for the "Generate your own →" Link that also fires a
 * cta_clicked intent event before navigating.
 */
export function GenerateCtaLink({ diagramId, style }: CtaLinkProps) {
  const handleClick = useCallback(() => {
    const userId = getOrCreateUserId();
    void emitIntent(userId, "cta_clicked", { diagram_id: diagramId, source: "shared_page" });
  }, [diagramId]);

  return (
    <Link
      href="/generate"
      onClick={handleClick}
      style={style}
    >
      ✦ Generate your own →
    </Link>
  );
}
