// app/api/items/[id]/diagram/route.ts — GET the raw HTML of a diagram

import { NextRequest, NextResponse } from "next/server";
import { getAllItems, getDiagramHtml } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const items = getAllItems();
  const item = items.find((i) => i.id === id);

  if (!item) {
    return new NextResponse("Item not found", { status: 404 });
  }

  const html = getDiagramHtml(item.diagram_html_path);
  if (!html) {
    return new NextResponse("Diagram HTML file not found", { status: 404 });
  }

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
