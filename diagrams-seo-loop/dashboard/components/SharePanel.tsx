"use client";

import { useState } from "react";

interface Props {
  title: string;
  /** Optional: if the item is saved, pass its ID so the share note is specific. */
  itemId?: string;
}

function buildPosts(title: string, itemId?: string) {
  const link = itemId
    ? `http://localhost:3000/shared/${itemId}`
    : "DIAGRAM_LINK";

  const linkedin =
    `Spent way too long drawing this ${title} diagram by hand before I found Diagrams.so. ` +
    `Generated this in about 30 seconds. Sharing in case it saves someone else the same time: ${link}`;

  const twitter =
    `Drew this ${title} architecture in ~30 seconds with Diagrams.so. ` +
    `Link if useful: ${link} 🏗️`;

  return { linkedin, twitter };
}

export default function SharePanel({ title, itemId }: Props) {
  const [open, setOpen]               = useState(false);
  const [copied, setCopied]           = useState<"linkedin" | "twitter" | null>(null);

  const posts = buildPosts(title, itemId);
  const isPlaceholder = !itemId;

  const copy = (platform: "linkedin" | "twitter") => {
    const text = posts[platform];
    navigator.clipboard.writeText(text).then(() => {
      setCopied(platform);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div>
      {/* Trigger */}
      <button
        className="btn btn-ghost"
        onClick={() => setOpen((v) => !v)}
        style={{ fontSize: "0.78rem", padding: "6px 14px", gap: 6 }}
      >
        <span style={{ fontSize: "0.9rem" }}>↗</span>
        {open ? "Close share" : "Share"}
      </button>

      {/* Inline panel */}
      {open && (
        <div
          className="animate-in"
          style={{
            marginTop: 10,
            padding: "16px 18px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Ready-to-copy posts
          </div>

          {/* LinkedIn post */}
          <PostBlock
            platform="LinkedIn"
            color="#60a5fa"
            text={posts.linkedin}
            copied={copied === "linkedin"}
            onCopy={() => copy("linkedin")}
            isPlaceholder={isPlaceholder}
          />

          {/* Twitter post */}
          <PostBlock
            platform="Twitter / 𝕏"
            color="var(--cyan)"
            text={posts.twitter}
            copied={copied === "twitter"}
            onCopy={() => copy("twitter")}
            isPlaceholder={isPlaceholder}
          />

          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontStyle: "italic", borderTop: "1px solid var(--border-subtle)", paddingTop: 10 }}>
            {isPlaceholder
              ? "Save to Review Queue first, then share — or replace DIAGRAM_LINK with your gallery URL after publishing."
              : "Share this link — or replace it with your live gallery URL after publishing."}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-component ─────────────────────────────────────────────────────────────

function PostBlock({
  platform, color, text, copied, onCopy, isPlaceholder,
}: {
  platform: string;
  color:    string;
  text:     string;
  copied:   boolean;
  onCopy:   () => void;
  isPlaceholder: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="flex items-center justify-between">
        <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", fontWeight: 600, color }}>
          {platform}
        </span>
        <button
          className="btn btn-ghost"
          onClick={onCopy}
          style={{
            fontSize: "0.68rem",
            padding: "3px 10px",
            color: copied ? "var(--emerald)" : "var(--text-muted)",
            borderColor: copied ? "rgba(52,211,153,0.4)" : undefined,
          }}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <div
        style={{
          fontSize: "0.8rem",
          lineHeight: 1.65,
          color: "var(--text-secondary)",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-muted)",
          borderRadius: "var(--radius-md)",
          padding: "10px 12px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {text}
      </div>
      {isPlaceholder && (
        <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          Replace DIAGRAM_LINK with your gallery URL after publishing.
        </div>
      )}
    </div>
  );
}
