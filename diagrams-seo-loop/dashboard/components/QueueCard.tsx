"use client";

import type { QueueItem } from "@/types/queue";
import ClientTimestamp from "@/components/ClientTimestamp";

interface Props {
  item:     QueueItem;
  acting:   string | null;
  onSelect: () => void;
  onReview: (item: QueueItem, action: "approve" | "reject") => void;
}

const statusColors: Record<string, string> = {
  pending:  "var(--amber)",
  approved: "var(--emerald)",
  rejected: "var(--rose)",
};

const providerColors: Record<string, string> = {
  aws:     "var(--amber)",
  azure:   "#60a5fa",
  gcp:     "var(--emerald)",
  generic: "var(--slate)",
};

export default function QueueCard({ item, acting, onSelect, onReview }: Props) {
  const isActing = acting === item.id;
  const meta = item.gallery_metadata;
  const color = statusColors[item.status] ?? "var(--slate)";

  return (
    <div
      className="card animate-in"
      style={{ cursor: "pointer", borderLeft: `3px solid ${color}`, transition: "all 0.2s" }}
      onClick={onSelect}
    >
      {/* Top row: keyword + status badge */}
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.7rem",
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
          }}
        >
          {item.keyword}
        </div>
        <span className={`badge badge-${item.status}`}>{item.status}</span>
      </div>

      {/* Gallery title */}
      <h3
        style={{
          fontSize: "0.95rem",
          fontWeight: 600,
          color: "var(--text-primary)",
          marginBottom: 6,
          lineHeight: 1.4,
        }}
      >
        {meta.gallery_title}
      </h3>

      {/* Description */}
      <p
        style={{
          fontSize: "0.8rem",
          color: "var(--text-secondary)",
          marginBottom: 14,
          lineHeight: 1.6,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {meta.gallery_description}
      </p>

      {/* LinkedIn preview */}
      <div
        style={{
          background: "var(--bg-elevated)",
          borderRadius: "var(--radius-sm)",
          padding: "10px 12px",
          fontSize: "0.78rem",
          color: "var(--text-muted)",
          marginBottom: 14,
          borderLeft: "2px solid rgba(34,211,238,0.3)",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          fontStyle: "italic",
        }}
      >
        {item.social_posts.linkedin}
      </div>

      {/* Tags + provider */}
      <div className="flex flex-wrap gap-2" style={{ marginBottom: 14 }}>
        {(meta.tags ?? []).slice(0, 4).map((tag) => (
          <span key={tag} className="tag">{tag}</span>
        ))}
        <span
          className="badge"
          style={{
            color: providerColors[meta.provider] ?? "var(--slate)",
            background: "transparent",
            borderColor: `${providerColors[meta.provider] ?? "var(--slate)"}44`,
          }}
        >
          {meta.provider}
        </span>
        <span className="badge badge-generic">{meta.category}</span>
      </div>

      {/* Timestamp + node count */}
      <div
        className="flex items-center justify-between"
        style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: 16 }}
      >
        <ClientTimestamp iso={item.timestamp} style={{ fontFamily: "var(--font-mono)" }} />
        <span>{item.spec.nodes.length} nodes · {item.spec.edges.length} edges</span>
      </div>

      {/* Action buttons */}
      {item.status === "pending" && (
        <div
          className="flex gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="btn btn-approve"
            disabled={!!acting}
            onClick={() => onReview(item, "approve")}
            style={{ flex: 1 }}
          >
            {isActing ? <span className="spinner" /> : "✓"} Approve
          </button>
          <button
            className="btn btn-reject"
            disabled={!!acting}
            onClick={() => onReview(item, "reject")}
            style={{ flex: 1 }}
          >
            {isActing ? <span className="spinner" /> : "✗"} Reject
          </button>
        </div>
      )}

      {item.status !== "pending" && (
        <div
          style={{
            textAlign: "center",
            fontSize: "0.75rem",
            color,
            fontFamily: "var(--font-mono)",
            padding: "6px 0",
          }}
        >
          {item.status === "approved" ? "✓ Approved — moved to approved/" : "✗ Rejected — moved to rejected/"}
        </div>
      )}

      {/* Expand hint */}
      <div
        style={{
          textAlign: "center",
          marginTop: 10,
          fontSize: "0.7rem",
          color: "var(--text-muted)",
          borderTop: "1px solid var(--border-subtle)",
          paddingTop: 10,
        }}
      >
        Click to view full details ↗
      </div>
    </div>
  );
}
