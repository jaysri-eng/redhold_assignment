// app/api/events/route.ts — Intent event ingestion endpoint
//
// POST /api/events  — record a behavioral event and refresh the intent profile
// GET  /api/events  — read all events + current profile for a user (debug / dashboard use)

import { NextRequest, NextResponse } from "next/server";
import { trackEvent, getUserEvents } from "@/lib/events";
import { updateIntentProfile, getIntentProfile } from "@/lib/intent";
import type { EventType } from "@/lib/events";

export const dynamic = "force-dynamic";

// ── POST — record one event ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      user_id?:    string;
      event_type?: string;
      metadata?:   Record<string, unknown>;
    };

    const { user_id, event_type, metadata } = body;

    if (!user_id?.trim() || !event_type?.trim()) {
      return NextResponse.json(
        { error: "user_id and event_type are required" },
        { status: 400 },
      );
    }

    const event   = trackEvent(user_id, event_type as EventType, metadata ?? {});
    const events  = getUserEvents(user_id);
    const profile = updateIntentProfile(user_id, events);

    return NextResponse.json({ ok: true, event, profile }, { status: 201 });
  } catch (err: unknown) {
    console.error("POST /api/events error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// ── GET — read events + profile for a user ────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get("user_id");

    if (!user_id?.trim()) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }

    const events  = getUserEvents(user_id);
    const profile = getIntentProfile(user_id);

    return NextResponse.json({ events, profile });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
