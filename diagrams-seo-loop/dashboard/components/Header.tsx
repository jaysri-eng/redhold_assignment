"use client";

import Link from "next/link";
import type { ItemStatus } from "@/types/queue";

interface Counts {
  pending: number;
  approved: number;
  rejected: number;
}

interface Props {
  counts: Counts;
  filter: ItemStatus | "all";
  onFilterChange: (f: ItemStatus | "all") => void;
}

const filters: { key: ItemStatus | "all"; label: string }[] = [
  { key: "all",      label: "All" },
  { key: "pending",  label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

export default function Header({ counts, filter, onFilterChange }: Props) {
  const total = counts.pending + counts.approved + counts.rejected;
  const approvalRate =
    total > 0 ? Math.round((counts.approved / total) * 100) : 0;

  return (
    <header
      style={{
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-subtle)",
        position: "sticky",
        top: 0,
        zIndex: 100,
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="container">
        <div
          className="flex items-center justify-between"
          style={{ padding: "16px 0", gap: 24, flexWrap: "wrap" }}
        >
          {/* Logo / Title */}
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "1rem",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--text-primary)",
              }}
            >
              <span style={{ color: "var(--cyan)" }}>diagrams</span>
              <span style={{ color: "var(--text-muted)" }}>.so</span>
              <span
                style={{
                  marginLeft: 10,
                  fontSize: "0.65rem",
                  fontWeight: 500,
                  color: "var(--text-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Growth Loop
              </span>
            </div>
            <div
              style={{
                fontSize: "0.7rem",
                color: "var(--text-muted)",
                marginTop: 2,
                fontFamily: "var(--font-mono)",
              }}
            >
              Human review queue · nothing auto-publishes
            </div>
          </div>

          {/* Right side: tab nav + stats */}
          <div className="flex items-center gap-4" style={{ flexWrap: "wrap" }}>
            {/* Tab navigation */}
            <nav className="flex gap-2">
              <Link
                href="/"
                className="btn btn-ghost"
                style={{
                  fontSize: "0.78rem",
                  padding: "6px 16px",
                  background: "rgba(34,211,238,0.1)",
                  color: "var(--cyan)",
                  borderColor: "rgba(34,211,238,0.35)",
                }}
              >
                Review Queue
              </Link>
              <Link
                href="/generate"
                className="btn btn-ghost"
                style={{ fontSize: "0.78rem", padding: "6px 16px" }}
              >
                ✦ Generate
              </Link>
              <Link
                href="/shared"
                className="btn btn-ghost"
                style={{ fontSize: "0.78rem", padding: "6px 16px" }}
              >
                ↗ Shared
              </Link>
            </nav>

            {/* Stats */}
            <div className="flex items-center gap-2">
              <div className="stat-pill">
                <span className="stat-num" style={{ color: "var(--amber)" }}>
                  {counts.pending}
                </span>
                <span className="stat-label">Pending</span>
              </div>
              <div className="stat-pill">
                <span className="stat-num" style={{ color: "var(--emerald)" }}>
                  {counts.approved}
                </span>
                <span className="stat-label">Approved</span>
              </div>
              <div className="stat-pill">
                <span className="stat-num" style={{ color: "var(--rose)" }}>
                  {counts.rejected}
                </span>
                <span className="stat-label">Rejected</span>
              </div>
              {total > 0 && (
                <div className="stat-pill">
                  <span
                    className="stat-num"
                    style={{
                      color: approvalRate >= 40 ? "var(--emerald)" : "var(--rose)",
                    }}
                  >
                    {approvalRate}%
                  </span>
                  <span className="stat-label">Approval</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div
          className="flex items-center gap-2"
          style={{ paddingBottom: 14, borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}
        >
          <span
            style={{
              fontSize: "0.7rem",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              marginRight: 4,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Filter:
          </span>
          {filters.map((f) => {
            const count =
              f.key === "all"       ? total
              : f.key === "pending"  ? counts.pending
              : f.key === "approved" ? counts.approved
              : counts.rejected;

            return (
              <button
                key={f.key}
                className="btn btn-ghost"
                onClick={() => onFilterChange(f.key)}
                style={{
                  padding: "5px 14px",
                  fontSize: "0.78rem",
                  ...(filter === f.key
                    ? {
                        background: "rgba(34,211,238,0.1)",
                        color: "var(--cyan)",
                        borderColor: "rgba(34,211,238,0.35)",
                      }
                    : {}),
                }}
              >
                {f.label}
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: "0.7rem",
                    opacity: 0.7,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
