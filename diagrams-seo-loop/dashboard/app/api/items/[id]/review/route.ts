// app/api/items/[id]/review/route.ts — POST to approve or reject an item

import { NextRequest, NextResponse } from "next/server";
import { updateItemStatus } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action: string = body.action ?? "";

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { ok: false, error: 'action must be "approve" or "reject"' },
      { status: 400 }
    );
  }

  const newStatus = action === "approve" ? "approved" : "rejected";
  const result = updateItemStatus(id, newStatus);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id, status: newStatus });
}
