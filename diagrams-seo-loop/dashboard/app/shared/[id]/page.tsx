/**
 * /shared/[id]
 *
 * Public-facing diagram landing page. This is what DIAGRAM_LINK points to.
 * Reads the queue item from data/approved/ or data/queue/ by ID and renders
 * the diagram fullscreen with its title, description, and a "Generate your own" CTA.
 *
 * No dashboard controls. No auth. No review buttons.
 * The only CTA is to generate — driving new users into the funnel.
 */

import { notFound }    from "next/navigation";
import Link            from "next/link";
import fs              from "fs";
import path            from "path";
import type { QueueItem } from "@/types/queue";
import { SharedPageTracker, GenerateCtaLink } from "@/components/SharedDiagramTracker";

// ── Data loading ──────────────────────────────────────────────────────────────

const ROOT    = path.resolve(process.cwd(), "..");
const DIRS    = ["approved", "queue", "rejected"].map((d) => path.join(ROOT, "data", d));

function loadItem(id: string): QueueItem | null {
  for (const dir of DIRS) {
    const file = path.join(dir, `${id}.json`);
    if (!fs.existsSync(file)) continue;
    try {
      return JSON.parse(fs.readFileSync(file, "utf-8")) as QueueItem;
    } catch {
      return null;
    }
  }
  return null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SharedDiagramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item   = loadItem(id);
  if (!item) notFound();

  const meta = item.gallery_metadata;
  const tags = meta.tags ?? [];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#e2e8f0",
        fontFamily: "system-ui, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Intent Intelligence Layer — fire-and-forget page-view + collaboration tracking */}
      <SharedPageTracker diagramId={item.id} creatorUserId={item.creator_user_id} />
      {/* ── Top bar ─────────────────────────────────────────── */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 32px",
          background: "rgba(15,23,42,0.95)",
          borderBottom: "1px solid #1e293b",
          flexShrink: 0,
        }}
      >
        <div style={{ fontFamily: "monospace", fontSize: "0.95rem", fontWeight: 700 }}>
          <span style={{ color: "#22d3ee" }}>diagrams</span>
          <span style={{ color: "#64748b" }}>.so</span>
          <span style={{ marginLeft: 10, fontSize: "0.62rem", fontWeight: 500, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Growth Loop
          </span>
        </div>

        <nav style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/"         style={topNavLink()}>Review Queue</Link>
          <Link href="/generate" style={topNavLink()}>✦ Generate</Link>
          <Link href="/shared"   style={topNavLink(true)}>↗ Shared</Link>
        </nav>
      </header>

      {/* ── Diagram (fullscreen) ─────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <iframe
          src={`/api/items/${item.id}/diagram`}
          title={meta.gallery_title}
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          style={{
            flex: 1,
            width: "100%",
            border: "none",
            minHeight: "60vh",
          }}
        />
      </div>

      {/* ── Metadata footer ──────────────────────────────────── */}
      <footer
        style={{
          padding: "28px 32px 40px",
          background: "#0f172a",
          borderTop: "1px solid #1e293b",
        }}
      >
        <div style={{ maxWidth: 860, margin: "0 auto" }}>

          {/* Badges */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.72rem", padding: "3px 10px", background: "rgba(34,211,238,0.08)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.3)", borderRadius: 999, fontFamily: "monospace" }}>
              {meta.provider}
            </span>
            <span style={{ fontSize: "0.72rem", padding: "3px 10px", background: "rgba(100,116,139,0.1)", color: "#94a3b8", border: "1px solid #334155", borderRadius: 999, fontFamily: "monospace" }}>
              {meta.category}
            </span>
            {tags.slice(0, 5).map((tag) => (
              <span key={tag} style={{ fontSize: "0.72rem", padding: "3px 10px", background: "rgba(100,116,139,0.08)", color: "#64748b", border: "1px solid #1e293b", borderRadius: 999, fontFamily: "monospace" }}>
                {tag}
              </span>
            ))}
          </div>

          {/* Title + description */}
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 10, letterSpacing: "-0.02em", color: "#f1f5f9" }}>
            {meta.gallery_title}
          </h1>
          <p style={{ fontSize: "0.92rem", color: "#94a3b8", lineHeight: 1.7, maxWidth: 680, marginBottom: 28 }}>
            {meta.gallery_description}
          </p>

          {/* CTA */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "20px 24px",
              background: "rgba(34,211,238,0.04)",
              border: "1px solid rgba(34,211,238,0.15)",
              borderRadius: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: "1rem", marginBottom: 4 }}>
                Generate your own architecture diagram
              </div>
              <div style={{ fontSize: "0.83rem", color: "#64748b", lineHeight: 1.6 }}>
                Describe any architecture in plain English. Ollama maps it to real AWS and
                Kubernetes icons and renders it with the diagrams.net engine — in about 30 seconds.
              </div>
            </div>
            <GenerateCtaLink
              diagramId={item.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "12px 28px",
                background: "#22d3ee",
                color: "#020617",
                borderRadius: 10,
                fontWeight: 700,
                fontSize: "0.9rem",
                textDecoration: "none",
                flexShrink: 0,
              }}
            />
          </div>

          {/* Small attribution */}
          <div style={{ marginTop: 20, fontSize: "0.7rem", color: "#334155", fontFamily: "monospace" }}>
            Rendered via embed.diagrams.net (draw.io engine) · diagrams.so Intent Capture &amp; Conversion Flywheel
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function topNavLink(active = false): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 14px",
    fontSize: "0.78rem",
    fontFamily: "monospace",
    borderRadius: 8,
    border: active ? "1px solid rgba(34,211,238,0.35)" : "1px solid #1e293b",
    background: active ? "rgba(34,211,238,0.1)" : "transparent",
    color: active ? "#22d3ee" : "#94a3b8",
    textDecoration: "none",
  };
}

// ── Static metadata ────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item   = loadItem(id);
  if (!item) return { title: "Diagram not found" };
  return {
    title:       item.gallery_metadata.gallery_title + " — Diagrams.so",
    description: item.gallery_metadata.gallery_description,
  };
}
