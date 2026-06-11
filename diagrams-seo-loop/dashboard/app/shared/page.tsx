/**
 * /shared — gallery of all shareable diagrams
 * Lists every item from data/queue/ and data/approved/ with a link to its /shared/[id] page.
 */

import Link       from "next/link";
import fs         from "fs";
import path       from "path";
import type { QueueItem } from "@/types/queue";
import SharedCard from "@/components/SharedCard";

const ROOT = path.resolve(process.cwd(), "..");

function loadAllItems(): QueueItem[] {
  const dirs  = ["approved", "queue"].map((d) => path.join(ROOT, "data", d));
  const items: QueueItem[] = [];
  const seen  = new Set<string>();

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      const id = file.replace(/\.json$/, "");
      if (seen.has(id)) continue;
      seen.add(id);
      try {
        const raw = fs.readFileSync(path.join(dir, file), "utf-8");
        items.push(JSON.parse(raw) as QueueItem);
      } catch {}
    }
  }

  return items.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export default function SharedIndexPage() {
  const items = loadAllItems();

  return (
    <div style={{ minHeight: "100vh", background: "#020617", color: "#e2e8f0" }}>

      {/* ── Top bar ──────────────────────────────────────────── */}
      <header style={{ background: "rgba(15,23,42,0.95)", borderBottom: "1px solid #1e293b", position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(12px)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", gap: 16, flexWrap: "wrap" }}>

            {/* Logo */}
            <div style={{ fontFamily: "monospace", fontSize: "0.95rem", fontWeight: 700 }}>
              <span style={{ color: "#22d3ee" }}>diagrams</span>
              <span style={{ color: "#475569" }}>.so</span>
              <span style={{ marginLeft: 10, fontSize: "0.62rem", fontWeight: 500, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Growth Loop
              </span>
            </div>

            {/* Nav */}
            <nav style={{ display: "flex", gap: 8 }}>
              <Link href="/"        style={navLink()}>Review Queue</Link>
              <Link href="/generate" style={navLink()}>✦ Generate</Link>
              <Link href="/shared"   style={navLink(true)}>↗ Shared</Link>
            </nav>
          </div>
        </div>
      </header>

      {/* ── Content ──────────────────────────────────────────── */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 32px 64px" }}>

        <div style={{ marginBottom: 36 }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 10, letterSpacing: "-0.02em" }}>
            Shared Diagrams
          </h1>
          <p style={{ fontSize: "0.88rem", color: "#94a3b8", lineHeight: 1.7 }}>
            Each diagram has a public landing page — this is what the Share button&apos;s{" "}
            <code style={{ fontSize: "0.8rem", background: "#1e293b", padding: "2px 6px", borderRadius: 4 }}>DIAGRAM_LINK</code>{" "}
            resolves to. Visitors see the diagram immediately, then get one CTA: Generate your own.
          </p>
        </div>

        {items.length === 0 ? (
          <div style={{ padding: "40px 24px", textAlign: "center", color: "#475569", background: "#0f172a", borderRadius: 12, border: "1px solid #1e293b" }}>
            No items yet. Run the pipeline or generate a diagram from the{" "}
            <Link href="/generate" style={{ color: "#22d3ee", textDecoration: "none" }}>Generate page</Link>.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {items.map((item) => (
              <SharedCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function navLink(active = false): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 14px",
    fontSize: "0.78rem",
    fontFamily: "monospace",
    borderRadius: 8,
    border: active ? "1px solid rgba(34,211,238,0.35)" : "1px solid #1e293b",
    background: active ? "rgba(34,211,238,0.1)" : "transparent",
    color:  active ? "#22d3ee" : "#94a3b8",
    textDecoration: "none",
    cursor: "pointer",
    transition: "border-color 0.15s",
  };
}
