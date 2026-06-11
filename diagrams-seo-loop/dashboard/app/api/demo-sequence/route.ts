/**
 * POST /api/demo-sequence
 *
 * Writes a demo nurture sequence record where step 1 is already past-due,
 * step 2 is due in 1 minute, and step 3 in 2 minutes.
 * Called by the Demo Mode card loader so "Send Due Emails" works immediately.
 */

import { NextResponse } from "next/server";
import { addDemoSequence } from "@/lib/sequence-runner";
import type { AddSequenceParams } from "@/lib/sequence-runner";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AddSequenceParams;

    if (!body.diagram_id || !body.diagram_title) {
      return NextResponse.json(
        { ok: false, error: "diagram_id and diagram_title are required" },
        { status: 400 },
      );
    }

    addDemoSequence(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
