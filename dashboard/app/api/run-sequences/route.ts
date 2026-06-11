/**
 * POST /api/run-sequences
 *
 * Processes all due nurture email steps and returns a summary.
 * Provides the same functionality as scripts/run-sequences.ts
 * but callable from the browser — used by the dashboard UI.
 */

import { NextResponse } from "next/server";
import { processDueSequences } from "@/lib/sequence-runner";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const result  = await processDueSequences(baseUrl);
    // Summarise which step fired per sent sequence for the UI
    const sentSteps = result.details
      .filter((d) => d.status === "sent")
      .map((d) => ({ id: d.id, step: d.step }));
    return NextResponse.json({ ok: true, ...result, sentSteps });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
