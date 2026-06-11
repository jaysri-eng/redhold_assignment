"use client";

import Link from "next/link";
import { useState } from "react";
import type { QueueItem } from "@/types/queue";

export default function SharedCard({ item }: { item: QueueItem }) {
  const meta    = item.gallery_metadata;
  const [hovered, setHovered] = useState(false);

  return (
    <Link href={`/shared/${item.id}`} style={{ textDecoration: "none", display: "block" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background:    hovered ? "#0a1628" : "#0f172a",
          border:        `1px solid ${hovered ? "rgba(34,211,238,0.35)" : "#1e293b"}`,
          borderRadius:  12,
          padding:       "18px 20px",
          display:       "flex",
          flexDirection: "column",
          gap:           10,
          transition:    "border-color 0.15s, background 0.15s",
          cursor:        "pointer",
        }}
      >
        {/* Badges */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.65rem", padding: "2px 8px", background: "rgba(34,211,238,0.08)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.25)", borderRadius: 999, fontFamily: "monospace" }}>
            {meta.provider}
          </span>
          <span style={{ fontSize: "0.65rem", padding: "2px 8px", background: "rgba(100,116,139,0.1)", color: "#64748b", border: "1px solid #1e293b", borderRadius: 999, fontFamily: "monospace" }}>
            {meta.category}
          </span>
          <span style={{
            fontSize: "0.65rem", padding: "2px 8px", borderRadius: 999, fontFamily: "monospace",
            ...(item.status === "approved"
              ? { background: "rgba(52,211,153,0.08)",  color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }
              : { background: "rgba(251,191,36,0.08)",  color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" }),
          }}>
            {item.status}
          </span>
        </div>

        {/* Title */}
        <div style={{ fontSize: "0.92rem", fontWeight: 600, color: "#f1f5f9", lineHeight: 1.4 }}>
          {meta.gallery_title}
        </div>

        {/* Description */}
        <div style={{ fontSize: "0.78rem", color: "#64748b", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {meta.gallery_description}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: "0.68rem", color: "#334155", fontFamily: "monospace" }}>
            {item.spec.nodes.length} components
          </span>
          <span style={{ fontSize: "0.72rem", color: "#22d3ee", fontFamily: "monospace" }}>
            View diagram ↗
          </span>
        </div>
      </div>
    </Link>
  );
}
