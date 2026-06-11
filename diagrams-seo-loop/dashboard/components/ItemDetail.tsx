"use client";

import { useState } from "react";
import type { QueueItem, DecisionAction, DecisionPriority } from "@/types/queue";
import { sanitizeSuggestionField } from "@/lib/conversion-suggestions";
import SharePanel from "@/components/SharePanel";
import ClientTimestamp from "@/components/ClientTimestamp";

interface Props {
  item:     QueueItem;
  acting:   string | null;
  onReview: (item: QueueItem, action: "approve" | "reject") => void;
  onClose:  () => void;
}

type SocialTab = "linkedin" | "twitter" | "devto";

const SOCIAL_COLORS: Record<SocialTab, string> = {
  linkedin: "#60a5fa",
  twitter:  "var(--cyan)",
  devto:    "var(--violet)",
};

const SOCIAL_ICONS: Record<SocialTab, string> = {
  linkedin: "in",
  twitter:  "𝕏",
  devto:    "DEV",
};

// ── Intent badge helpers ──────────────────────────────────────────────────────

type IntentSegment = "casual" | "engaged" | "high_intent" | "champion";

const SEGMENT_COLOR: Record<IntentSegment, string> = {
  casual:      "rgba(100,116,139,0.9)",
  engaged:     "rgba(34,211,238,0.9)",
  high_intent: "rgba(167,139,250,0.9)",
  champion:    "rgba(52,211,153,0.9)",
};

const SEGMENT_BG: Record<IntentSegment, string> = {
  casual:      "rgba(100,116,139,0.08)",
  engaged:     "rgba(34,211,238,0.08)",
  high_intent: "rgba(167,139,250,0.08)",
  champion:    "rgba(52,211,153,0.08)",
};

const SEGMENT_BORDER: Record<IntentSegment, string> = {
  casual:      "rgba(100,116,139,0.3)",
  engaged:     "rgba(34,211,238,0.3)",
  high_intent: "rgba(167,139,250,0.3)",
  champion:    "rgba(52,211,153,0.3)",
};

const SEGMENT_LABEL: Record<IntentSegment, string> = {
  casual:      "Casual",
  engaged:     "Engaged",
  high_intent: "High Intent",
  champion:    "Champion",
};

// ── AI Decision Engine — Recommendation panel ─────────────────────────────────

const ACTION_LABEL: Record<DecisionAction, string> = {
  none:                        "No Action",
  educational_email:           "Educational Email",
  upgrade_email:               "Upgrade Email",
  champion_outreach:           "Champion Outreach",
  team_collaboration_followup: "Team Collaboration Follow-up",
  returning_user_nurture:      "Returning User Nurture",
  free_limit_conversion:       "Free Limit Conversion",
  high_intent_followup:        "High-Intent Follow-up",
};

const PRIORITY_COLOR: Record<DecisionPriority, string> = {
  low:    "rgba(100,116,139,0.9)",
  medium: "rgba(251,191,36,0.9)",
  high:   "rgba(52,211,153,0.9)",
};

const PRIORITY_BG: Record<DecisionPriority, string> = {
  low:    "rgba(100,116,139,0.08)",
  medium: "rgba(251,191,36,0.08)",
  high:   "rgba(52,211,153,0.08)",
};

const PRIORITY_BORDER: Record<DecisionPriority, string> = {
  low:    "rgba(100,116,139,0.3)",
  medium: "rgba(251,191,36,0.3)",
  high:   "rgba(52,211,153,0.3)",
};

function AIRecommendation({
  action,
  priority,
  confidence,
  reason,
}: {
  action:     DecisionAction;
  priority:   DecisionPriority;
  confidence: number;
  reason:     string;
}) {
  const pct = Math.round(confidence * 100);

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
        <h3 style={{ fontSize: "0.85rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          AI Recommendation
        </h3>
        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          Decision Engine
        </span>
      </div>

      <div
        className="card"
        style={{
          padding: "16px 18px",
          borderLeft: "3px solid var(--cyan)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* Action + Priority + Confidence row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>
              Action
            </div>
            <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--cyan)" }}>
              {ACTION_LABEL[action]}
            </div>
          </div>

          <div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>
              Priority
            </div>
            <span
              style={{
                display: "inline-block",
                fontSize: "0.72rem",
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: 999,
                background: PRIORITY_BG[priority],
                color:      PRIORITY_COLOR[priority],
                border:     `1px solid ${PRIORITY_BORDER[priority]}`,
                textTransform: "capitalize",
              }}
            >
              {priority}
            </span>
          </div>

          <div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>
              Confidence
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Confidence bar */}
              <div style={{ flex: 1, height: 6, background: "var(--border-subtle)", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: pct >= 80 ? "var(--cyan)" : pct >= 60 ? "rgba(251,191,36,0.8)" : "rgba(100,116,139,0.6)",
                    borderRadius: 3,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--text-primary)", minWidth: 36 }}>
                {pct}%
              </span>
            </div>
          </div>
        </div>

        {/* Reason */}
        {reason && (
          <div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>
              Reason
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {reason}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 8, fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontStyle: "italic" }}>
        Generated by the deterministic rules engine. Set ENABLE_AI_DECISION_ENGINE=true to use Ollama-powered recommendations.
      </div>
    </div>
  );
}

export default function ItemDetail({ item, acting, onReview, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<SocialTab>("linkedin");
  const [showJson, setShowJson]   = useState(false);
  const isActing = acting === item.id;
  const meta = item.gallery_metadata;

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Back button + actions */}
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 12 }}>
        <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: "0.8rem" }}>
          ← Back to queue
        </button>

        {item.status === "pending" && (
          <div className="flex gap-2">
            <button
              className="btn btn-reject"
              disabled={!!acting}
              onClick={() => onReview(item, "reject")}
            >
              {isActing ? <span className="spinner" /> : "✗"} Reject
            </button>
            <button
              className="btn btn-approve"
              disabled={!!acting}
              onClick={() => onReview(item, "approve")}
            >
              {isActing ? <span className="spinner" /> : "✓"} Approve
            </button>
          </div>
        )}
        {item.status !== "pending" && (
          <span
            className={`badge badge-${item.status}`}
            style={{ fontSize: "0.8rem", padding: "6px 14px" }}
          >
            {item.status.toUpperCase()}
          </span>
        )}
      </div>

      {/* Title bar */}
      <div className="card" style={{ padding: "18px 20px", borderLeft: "3px solid var(--cyan)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {item.keyword} · <ClientTimestamp iso={item.timestamp} />
        </div>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 6 }}>{meta.gallery_title}</h2>
        <p style={{ fontSize: "0.88rem" }}>{meta.gallery_description}</p>
        <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
          {(meta.tags ?? []).map((tag) => (
            <span key={tag} className="tag">{tag}</span>
          ))}
          <span className={`badge badge-${meta.provider}`}>{meta.provider}</span>
          <span className="badge badge-generic">{meta.category}</span>

          {/* Intent Intelligence Layer — score + segment badge */}
          {item.intent_segment && (
            <span
              title={`Intent Score: ${item.intent_score ?? 0}`}
              style={{
                fontSize: "0.65rem",
                fontFamily: "var(--font-mono)",
                padding: "2px 8px",
                borderRadius: 999,
                background: SEGMENT_BG[item.intent_segment as IntentSegment],
                color:      SEGMENT_COLOR[item.intent_segment as IntentSegment],
                border:     `1px solid ${SEGMENT_BORDER[item.intent_segment as IntentSegment]}`,
                letterSpacing: "0.05em",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                cursor: "default",
              }}
            >
              <span>◉</span>
              <span>Intent {item.intent_score ?? 0}</span>
              <span style={{ opacity: 0.6 }}>·</span>
              <span>{SEGMENT_LABEL[item.intent_segment as IntentSegment]}</span>
            </span>
          )}
        </div>
      </div>

      {/* Two-column layout: diagram + social/meta */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* Diagram preview */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <h3 style={{ fontSize: "0.85rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Architecture Diagram
            </h3>
            <a
              href={`/api/items/${item.id}/diagram`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
              style={{ fontSize: "0.72rem", padding: "4px 10px" }}
            >
              Open fullscreen ↗
            </a>
          </div>
          {/* allow-popups is required so the nested embed.diagrams.net iframe can load */}
          <iframe
            className="diagram-frame"
            src={`/api/items/${item.id}/diagram`}
            title={`Diagram: ${meta.gallery_title}`}
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          />

          {/* Share button */}
          <div style={{ marginTop: 10 }}>
            <SharePanel title={meta.gallery_title} itemId={item.id} />
          </div>

          {/* Node list */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Components ({item.spec.nodes.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {item.spec.nodes.map((node) => (
                <span key={node} className="tag" style={{ color: "var(--text-secondary)", borderColor: "var(--border-muted)" }}>
                  {node}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: social posts + metadata */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Social tabs */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <h3 style={{ fontSize: "0.85rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Social Drafts
              </h3>
              <div className="flex gap-1" style={{ marginLeft: "auto" }}>
                {(["linkedin", "twitter", "devto"] as SocialTab[]).map((tab) => (
                  <button
                    key={tab}
                    className="btn btn-ghost"
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: "3px 10px",
                      fontSize: "0.7rem",
                      fontFamily: "var(--font-mono)",
                      ...(activeTab === tab
                        ? { color: SOCIAL_COLORS[tab], borderColor: `${SOCIAL_COLORS[tab]}55`, background: `${SOCIAL_COLORS[tab]}11` }
                        : {}),
                    }}
                  >
                    {SOCIAL_ICONS[tab]}
                  </button>
                ))}
              </div>
            </div>
            <div
              className="social-box"
              style={{ borderLeft: `3px solid ${SOCIAL_COLORS[activeTab]}` }}
            >
              {item.social_posts[activeTab]}
            </div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 6, fontFamily: "var(--font-mono)" }}>
              Replace LINK_HERE with the published gallery URL before posting.
            </div>
          </div>

          {/* Gallery metadata */}
          <div>
            <h3 style={{ fontSize: "0.85rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
              Gallery Metadata
            </h3>
            <div className="card" style={{ padding: 14, gap: 10, display: "flex", flexDirection: "column" }}>
              {[
                { label: "Title",       val: meta.gallery_title },
                { label: "Description", val: meta.gallery_description },
                { label: "Category",    val: meta.category },
                { label: "Provider",    val: meta.provider },
                { label: "Tags",        val: (meta.tags ?? []).join(", ") },
              ].map(({ label, val }) => (
                <div key={label}>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-primary)" }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Diagram JSON spec toggle */}
          <div>
            <button
              className="btn btn-ghost"
              style={{ fontSize: "0.75rem", width: "100%", justifyContent: "center" }}
              onClick={() => setShowJson((v) => !v)}
            >
              {showJson ? "▲ Hide" : "▼ Show"} Diagram JSON spec
            </button>
            {showJson && (
              <pre className="json-viewer" style={{ marginTop: 8 }}>
                {JSON.stringify(item.spec, null, 2)}
              </pre>
            )}
          </div>

          {/* Architecture description */}
          <div>
            <h3 style={{ fontSize: "0.85rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
              Architecture Description
            </h3>
            <div
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "14px 16px",
                fontSize: "0.8rem",
                color: "var(--text-secondary)",
                lineHeight: 1.7,
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {item.description}
            </div>
          </div>
        </div>
      </div>

      {/* AI Decision Engine — Recommendation */}
      {item.decision_action && item.decision_action !== "none" && (
        <AIRecommendation
          action={item.decision_action}
          priority={item.decision_priority ?? "low"}
          confidence={item.decision_confidence ?? 0}
          reason={item.decision_reason ?? ""}
        />
      )}

      {/* Conversion Path */}
      {item.conversion_suggestions && item.conversion_suggestions.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
            <h3 style={{ fontSize: "0.85rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Conversion Path
            </h3>
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              What paid users unlock
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {item.conversion_suggestions.map((suggestion, i) => {
              const title = sanitizeSuggestionField(suggestion.title);
              const description = sanitizeSuggestionField(suggestion.description);
              return (
              <div
                key={i}
                className="card"
                style={{
                  padding: "14px 16px",
                  borderLeft: "3px solid var(--violet)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "0.65rem", fontFamily: "var(--font-mono)", color: "var(--violet)", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 4, padding: "2px 6px" }}>
                    PAID
                  </span>
                  <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    {title}
                  </div>
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {description}
                </div>
              </div>
            );})}
          </div>

          <div style={{ marginTop: 10, fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontStyle: "italic" }}>
            These would be surfaced to free users after they generate this diagram to demonstrate paid value.
          </div>
        </div>
      )}
    </div>
  );
}
