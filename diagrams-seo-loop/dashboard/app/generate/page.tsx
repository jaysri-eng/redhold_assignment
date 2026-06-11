"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildDrawioHtml } from "@/lib/diagram-builder";
import SharePanel from "@/components/SharePanel";
import { sanitizeSuggestionField } from "@/lib/conversion-suggestions";
import { useMounted } from "@/hooks/use-mounted";
import posthog from "posthog-js";
import { DEMO_EXAMPLES, type DemoExample } from "@/lib/demo-examples";

const LS_KEY          = "diagrams_generations_count";
const LS_USER_ID_KEY  = "diagrams_user_id";
const LS_LAST_VISIT   = "diagrams_last_visit";
const FREE_LIMIT      = 2;

// ── Intent helpers (fire-and-forget — never block the UI) ─────────────────────

type IntentEventType =
  | "diagram_generated"
  | "multiple_generations_same_session"
  | "free_limit_reached"
  | "returning_user"
  | "abandoned_after_first_generation";

async function emitIntent(
  userId:    string,
  eventType: IntentEventType,
  metadata:  Record<string, unknown> = {},
): Promise<void> {
  try {
    await fetch("/api/events", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ user_id: userId, event_type: eventType, metadata }),
    });
  } catch {
    // Never surface intent tracking errors to the user
  }
}

/** Generate a persistent anonymous UUID and store it in localStorage. */
function getOrCreateUserId(): string {
  const existing = localStorage.getItem(LS_USER_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(LS_USER_ID_KEY, id);
  return id;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface GalleryMetadata {
  gallery_title:       string;
  gallery_description: string;
  tags:                string[];
  category:            string;
  provider:            string;
}

interface SocialPosts {
  linkedin: string;
  twitter:  string;
  devto:    string;
}

interface StageEvent {
  stage: number;
  status: "running" | "done" | "error";
  label: string;
  drawioXml?: string;
  spec?: {
    title: string;
    nodes: string[];
    edges: [string, string][];
    provider: string;
    category: string;
  };
  description?: string;
  conversionSuggestions?: ConversionSuggestion[];
  gallery_metadata?: GalleryMetadata;
  social_posts?: SocialPosts;
}

interface StageState {
  status: "idle" | "running" | "done" | "error";
  label: string;
}

interface ConversionSuggestion {
  title: string;
  description: string;
}

const STAGE_LABELS_BASE = [
  "Detecting model",
  "Expanding architecture",
  "Identifying components",
  "Mapping connections",
  "Pro follow-up suggestions",
];

const STAGE_LABELS_KEYWORD = [
  ...STAGE_LABELS_BASE,
  "Gallery metadata",
  "Social drafts",
];

const EXAMPLE_PROMPTS = [
  {
    label: "Zero trust SaaS",
    prompt:
      "Design a zero trust network architecture for a SaaS application on AWS. Include identity verification with IAM and Cognito, API Gateway with WAF, microservices behind a service mesh, encrypted RDS and DynamoDB, and CloudWatch audit logging.",
  },
  {
    label: "Kafka e-commerce",
    prompt:
      "Event-driven e-commerce platform using Kafka for order processing. Separate order, inventory, payment, and notification services each with their own database. Include a React storefront, API Gateway, and a real-time analytics pipeline using Kinesis and Redshift.",
  },
  {
    label: "GitOps CI/CD",
    prompt:
      "GitOps CI/CD pipeline for a Kubernetes application using ArgoCD. Include GitHub as the source repo, a GitHub Actions build pipeline with security scanning, container registry, ArgoCD syncing to staging and production clusters, and Prometheus and Grafana for observability.",
  },
  {
    label: "HIPAA data pipeline",
    prompt:
      "HIPAA compliant healthcare data pipeline on AWS. Patient data flows from an HL7 FHIR API through Kinesis for real-time ingestion, Lambda for transformation, encrypted RDS for patient records, S3 for audit trails, and CloudWatch with VPC Flow Logs for compliance monitoring.",
  },
  {
    label: "Multi-region active-active",
    prompt:
      "Multi-region active-active architecture on AWS across us-east-1 and eu-west-1. Global load balancing with Route53 latency routing, DynamoDB Global Tables for data replication, application load balancers in each region, ElastiCache with cross-region replication, and health check failover.",
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function GeneratePage() {
  const router = useRouter();

  const mounted = useMounted();

  // ── Anonymous user identity ───────────────────────────────────────────────
  const [userId, setUserId] = useState<string>("");
  useEffect(() => {
    if (!mounted) return;
    const id = getOrCreateUserId();
    setUserId(id);
    // Identify the user in PostHog so every event is attributed to the same
    // distinct_id that the server-side PostHog query will use.
    try { posthog.identify(id); } catch {}
  }, [mounted]);

  // ── Returning user detection ──────────────────────────────────────────────
  // Fires once per mount after identity is known; updates last-visit timestamp.
  useEffect(() => {
    if (!mounted || !userId) return;
    const now        = Date.now();
    const lastVisit  = parseInt(localStorage.getItem(LS_LAST_VISIT) ?? "0", 10);
    const sevenDays  = 7 * 24 * 60 * 60 * 1000;
    if (lastVisit > 0 && now - lastVisit > sevenDays) {
      void emitIntent(userId, "returning_user", { gap_ms: now - lastVisit });
    }
    localStorage.setItem(LS_LAST_VISIT, String(now));
  }, [mounted, userId]);

  // ── Generation counter (localStorage) ────────────────────────────────────
  const [genCount, setGenCount] = useState(0);
  useEffect(() => {
    if (!mounted) return;
    const stored = parseInt(localStorage.getItem(LS_KEY) ?? "0", 10);
    setGenCount(isNaN(stored) ? 0 : stored);
  }, [mounted]);

  const incrementCount = useCallback(() => {
    setGenCount((prev) => {
      const next = prev + 1;
      localStorage.setItem(LS_KEY, String(next));
      return next;
    });
  }, []);

  const resetCount = useCallback(() => {
    localStorage.setItem(LS_KEY, "0");
    setGenCount(0);
  }, []);

  // Defer gated UI until after mount so SSR HTML matches first client paint
  const isGated = mounted && genCount >= FREE_LIMIT;
  const displayGenCount = mounted ? genCount : 0;

  // ── Core state ────────────────────────────────────────────────────────────
  const [keywordMode, setKeywordMode] = useState(false);
  const [prompt, setPrompt]           = useState("");
  const [generating, setGenerating]   = useState(false);
  const [stages, setStages]           = useState<StageState[]>(
    STAGE_LABELS_BASE.map(() => ({ status: "idle", label: "" }))
  );
  const [result, setResult]           = useState<StageEvent | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [elapsed, setElapsed]         = useState(0);
  const [saving, setSaving]           = useState(false);
  const [savedId, setSavedId]         = useState<string | null>(null);
  const [emailSent, setEmailSent]     = useState(false);
  const [suggestions, setSuggestions] = useState<ConversionSuggestion[]>([]);
  const [galleryMetadata, setGalleryMetadata] = useState<GalleryMetadata | null>(null);
  const [socialPosts, setSocialPosts]         = useState<SocialPosts | null>(null);
  const [activeSocialTab, setActiveSocialTab] = useState<"linkedin" | "twitter" | "devto">("linkedin");

  // ── Demo mode state (additive — real generate flow is completely unchanged) ─
  const [demoModeOpen,      setDemoModeOpen]      = useState(false);
  const [activeDemoExample, setActiveDemoExample] = useState<DemoExample | null>(null);

  // ── Sequence runner state ──────────────────────────────────────────────────
  const [seqRunning,   setSeqRunning]   = useState(false);
  const [seqResult,    setSeqResult]    = useState<{
    processed: number; skipped: number; errors: number;
    sentSteps?: { id: string; step: number }[];
  } | null>(null);
  const [seqCountdown, setSeqCountdown] = useState<number | null>(null);
  const seqTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSequences = useCallback(async () => {
    if (seqRunning) return;
    setSeqRunning(true);
    try {
      const res  = await fetch("/api/run-sequences", { method: "POST" });
      const data = await res.json() as {
        processed?: number; skipped?: number; errors?: number;
        sentSteps?: { id: string; step: number }[];
      };
      setSeqResult({
        processed: data.processed ?? 0,
        skipped:   data.skipped   ?? 0,
        errors:    data.errors    ?? 0,
        sentSteps: data.sentSteps ?? [],
      });
    } catch {
      setSeqResult({ processed: 0, skipped: 0, errors: 1 });
    } finally {
      setSeqRunning(false);
    }
  }, [seqRunning]);

  // Auto-fire sequences every 10 seconds whenever a demo example is active
  // OR a real diagram has just been saved — covers both flows automatically.
  useEffect(() => {
    const active = !!(activeDemoExample || savedId);

    if (!active) {
      if (seqTimerRef.current) { clearInterval(seqTimerRef.current); seqTimerRef.current = null; }
      setSeqCountdown(null);
      return;
    }

    // Fire immediately (catches step 1 which has 0 delay), then every 10 seconds
    void runSequences();
    setSeqCountdown(10);

    const tick = setInterval(() => {
      setSeqCountdown((prev) => {
        if (prev === null || prev <= 1) {
          void runSequences();
          return 10;
        }
        return prev - 1;
      });
    }, 1_000);

    seqTimerRef.current = tick;
    return () => { clearInterval(tick); seqTimerRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDemoExample, savedId]);

  // Clear demo banner when a real generation starts
  useEffect(() => {
    if (generating) setActiveDemoExample(null);
  }, [generating]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  // Count generations within this browser session (resets on full page reload)
  const sessionGenRef = useRef(0);

  // Track abandoned_after_first_generation: result present but user leaves without saving
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && result && !savedId && userId) {
        void emitIntent(userId, "abandoned_after_first_generation", {
          diagram_title: result.spec?.title ?? "",
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [result, savedId, userId]);

  // ── Save to Queue ─────────────────────────────────────────────────────────
  const sendEvangelistPreview = useCallback(async (
    itemId: string,
    savedSuggestions: ConversionSuggestion[],
  ) => {
    if (!result?.spec || savedSuggestions.length < 2) return;
    setEmailSent(false);
    try {
      const res = await fetch("/api/notify", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagram_id:               itemId,
          diagram_title:            result.spec.title,
          user_prompt:              prompt.trim(),
          suggestion_1_title:       savedSuggestions[0].title,
          suggestion_1_description: savedSuggestions[0].description,
          suggestion_2_title:       savedSuggestions[1].title,
          suggestion_2_description: savedSuggestions[1].description,
        }),
      });
      const data = await res.json() as { ok?: boolean };
      if (data.ok) setEmailSent(true);
    } catch (err: unknown) {
      console.error("[notify] email failed:", err);
    }
  }, [result, prompt]);

  const saveToQueue = useCallback(async () => {
    if (!result?.drawioXml || !result.spec) return;
    setSaving(true);
    setEmailSent(false);
    try {
      const res = await fetch("/api/items", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:                  result.spec.title,
          description:            result.description ?? "",
          nodes:                  result.spec.nodes,
          edges:                  result.spec.edges,
          provider:               result.spec.provider,
          category:               result.spec.category,
          drawioXml:              result.drawioXml,
          keyword:                prompt.trim(),
          conversion_suggestions: suggestions,
          user_id:                userId || undefined,
          ...(galleryMetadata ? { gallery_metadata: galleryMetadata } : {}),
          ...(socialPosts     ? { social_posts:     socialPosts     } : {}),
        }),
      });
      const data = await res.json() as {
        ok?: boolean;
        id?: string;
        item?: { conversion_suggestions?: ConversionSuggestion[] };
        error?: string;
      };
      if (data.ok && data.id) {
        setSavedId(data.id);
        const saved = data.item?.conversion_suggestions ?? suggestions;
        if (saved.length >= 2) setSuggestions(saved);
        void sendEvangelistPreview(data.id, saved.length >= 2 ? saved : suggestions);
      } else {
        alert(data.error ?? "Save failed");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [result, prompt, suggestions, galleryMetadata, socialPosts, sendEvangelistPreview]);

  // ── Demo mode loader (no Ollama) ─────────────────────────────────────────
  const loadDemoExample = useCallback((example: DemoExample) => {
    try {
      setDemoModeOpen(false);
      setActiveDemoExample(example);
      setSuggestions(example.conversion_suggestions);
      setSavedId(null);
      setEmailSent(false);
      setError(null);
      setGenerating(false);
      setSeqResult(null);
      setStages(STAGE_LABELS_BASE.map(() => ({ status: "idle", label: "" })));
      setResult({
        stage:               4,
        status:              "done",
        label:               "Demo loaded",
        drawioXml:           "<mxGraphModel/>",
        spec:                example.spec,
        description:         example.description,
        conversionSuggestions: example.conversion_suggestions,
      });

      // Write a sequence record so "Send Due Emails" works immediately
      fetch("/api/demo-sequence", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagram_id:               example.id,
          diagram_title:            example.spec.title,
          user_prompt:              example.description,
          suggestion_1_title:       example.conversion_suggestions[0]?.title       ?? "",
          suggestion_1_description: example.conversion_suggestions[0]?.description ?? "",
          suggestion_2_title:       example.conversion_suggestions[1]?.title       ?? "",
          suggestion_2_description: example.conversion_suggestions[1]?.description ?? "",
          user_context:             example.user_context,
          decision_action:          "educational_email",
        }),
      }).catch(() => {}); // fire-and-forget, never surface errors
    } catch {
      // Silent fallback
    }
  }, []);

  // ── Generate ──────────────────────────────────────────────────────────────
  const generate = useCallback(async (overridePrompt?: string) => {
    const p = overridePrompt ?? prompt;
    if (!p.trim() || generating) return;

    const stageLabels = keywordMode ? STAGE_LABELS_KEYWORD : STAGE_LABELS_BASE;

    setGenerating(true);
    setResult(null);
    setError(null);
    setElapsed(0);
    setSavedId(null);
    setEmailSent(false);
    setSuggestions([]);
    setGalleryMetadata(null);
    setSocialPosts(null);
    if (overridePrompt) setPrompt(overridePrompt);
    setStages(stageLabels.map(() => ({ status: "idle", label: "" })));

    const start = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);

    try {
      const res = await fetch("/api/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ prompt: p.trim(), keyword_mode: keywordMode }),
      });
      if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buffer   = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          try {
            const evt = JSON.parse(raw) as StageEvent;
            if (evt.status === "error") { setError(evt.label); break; }
            if (evt.stage >= 0 && evt.stage <= 3) {
              setStages((prev) => {
                const next = [...prev];
                if (evt.stage < next.length) next[evt.stage] = { status: evt.status, label: evt.label };
                return next;
              });
            }
            if (evt.stage === 4 && evt.status === "running" && evt.label?.includes("Pro follow-up")) {
              setStages((prev) => {
                const next = [...prev];
                if (next.length > 4) next[4] = { status: "running", label: evt.label };
                return next;
              });
            }
            // ── Keyword mode: gallery metadata (stage 5) ───────────────────
            if (evt.stage === 5) {
              setStages((prev) => {
                const next = [...prev];
                if (next.length > 5) next[5] = { status: evt.status, label: evt.label };
                return next;
              });
              if (evt.status === "done" && evt.gallery_metadata) {
                setGalleryMetadata(evt.gallery_metadata);
              }
            }

            // ── Keyword mode: social posts (stage 6) ───────────────────────
            if (evt.stage === 6) {
              setStages((prev) => {
                const next = [...prev];
                if (next.length > 6) next[6] = { status: evt.status, label: evt.label };
                return next;
              });
              if (evt.status === "done" && evt.social_posts) {
                setSocialPosts(evt.social_posts);
              }
            }

            if (evt.stage === 4 && evt.status === "done" && evt.drawioXml) {
              setResult(evt);
              incrementCount();

              // PostHog: diagram generated
              try {
                posthog.capture("diagram_generated", {
                  diagram_title: evt.spec?.title    ?? "",
                  provider:      evt.spec?.provider ?? "",
                });
              } catch {}

              // ── Intent signals on successful generation ────────────────────
              if (userId) {
                void emitIntent(userId, "diagram_generated", {
                  diagram_title: evt.spec?.title ?? "",
                  provider:      evt.spec?.provider ?? "",
                  category:      evt.spec?.category ?? "",
                });

                // Multiple generations in the same browser session
                if (sessionGenRef.current >= 1) {
                  void emitIntent(userId, "multiple_generations_same_session", {
                    session_count: sessionGenRef.current + 1,
                  });
                }
                sessionGenRef.current += 1;

                // Free limit reached on this generation
                const currentCount = parseInt(localStorage.getItem(LS_KEY) ?? "0", 10);
                if (currentCount + 1 >= FREE_LIMIT) {
                  void emitIntent(userId, "free_limit_reached", {
                    count: currentCount + 1,
                  });
                  // PostHog: free limit reached
                  try {
                    posthog.capture("free_limit_reached", {
                      generation_count: currentCount + 1,
                    });
                  } catch {}
                }
              }

              if (evt.conversionSuggestions?.length) {
                setSuggestions(
                  evt.conversionSuggestions.map((s) => ({
                    title:       sanitizeSuggestionField(s.title),
                    description: sanitizeSuggestionField(s.description),
                  })),
                );
              }
              setStages((prev) => {
                const next = [...prev];
                if (next.length > 4) next[4] = { status: "done", label: "Suggestions ready" };
                return next;
              });
            }
          } catch {}
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      clearTimer();
      setGenerating(false);
    }
  }, [prompt, generating, keywordMode, incrementCount]);

  return (
    <div style={{ minHeight: "100vh" }}>

      {/* ── Nav header ────────────────────────────────────────── */}
      <header style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border-subtle)", position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(12px)" }}>
        <div className="container">
          <div className="flex items-center justify-between" style={{ padding: "16px 0", gap: 24, flexWrap: "wrap" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "1rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
              <span style={{ color: "var(--cyan)" }}>diagrams</span>
              <span style={{ color: "var(--text-muted)" }}>.so</span>
              <span style={{ marginLeft: 10, fontSize: "0.65rem", fontWeight: 500, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Growth Loop</span>
            </div>
            <nav className="flex gap-2">
              <Link href="/" className="btn btn-ghost" style={{ fontSize: "0.78rem", padding: "6px 16px" }}>Review Queue</Link>
              <Link href="/generate" className="btn btn-ghost" style={{ fontSize: "0.78rem", padding: "6px 16px", background: "rgba(34,211,238,0.1)", color: "var(--cyan)", borderColor: "rgba(34,211,238,0.35)" }}>✦ Generate</Link>
              <Link href="/shared"   className="btn btn-ghost" style={{ fontSize: "0.78rem", padding: "6px 16px" }}>↗ Shared</Link>
            </nav>
          </div>
        </div>
      </header>

      {/* ── Free-tier banner (shown from 3rd generation onwards) ── */}
      {isGated && (
        <div style={{ background: "rgba(167,139,250,0.06)", borderBottom: "1px solid rgba(167,139,250,0.2)", padding: "8px 0" }}>
          <div className="container flex items-center justify-between" style={{ gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
              You are on the free plan.{" "}
              <span style={{ color: "var(--violet)", fontWeight: 600 }}>{displayGenCount} diagrams generated.</span>
              {" "}Production-grade follow-ups are a paid feature.
            </span>
            <div className="flex items-center gap-3">
              <a href="#upgrade" style={{ fontSize: "0.78rem", color: "var(--violet)", fontWeight: 600, fontFamily: "var(--font-mono)", textDecoration: "none" }}>
                Upgrade to Pro →
              </a>
              <button
                onClick={resetCount}
                style={{ fontSize: "0.65rem", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", textDecoration: "underline", padding: 0 }}
              >
                Reset counter (demo only)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DEMO MODE banner ─────────────────────────────────── */}
      {activeDemoExample && (
        <div style={{ background: "rgba(251,191,36,0.08)", borderBottom: "1px solid rgba(251,191,36,0.35)", padding: "8px 0" }}>
          <div className="container flex items-center justify-between" style={{ gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.78rem", color: "#fbbf24", fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }}>
              ⚡ DEMO MODE — {activeDemoExample.label}
            </span>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
              Pre-loaded example · no Ollama calls · real generate flow unchanged
            </span>
            <button
              onClick={() => { setActiveDemoExample(null); setResult(null); setSuggestions([]); }}
              style={{ fontSize: "0.68rem", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", textDecoration: "underline", padding: 0 }}
            >
              Exit demo
            </button>
          </div>
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────── */}
      <main className="container" style={{ paddingTop: 40, paddingBottom: 64 }}>

        {/* Hero */}
        <div style={{ maxWidth: 720, marginBottom: 36 }}>
          <h1 style={{ fontSize: "1.6rem", marginBottom: 10 }}>Generate a Diagram</h1>
          <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
            Describe any architecture in plain English. Ollama expands it into a structured spec,
            maps AWS / K8s icons, and renders it with the{" "}
            <strong style={{ color: "var(--cyan)" }}>diagrams.net engine</strong>
            {" "}— the same renderer that powers Diagrams.so.
          </p>
          <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: "var(--radius-md)", fontSize: "0.75rem", color: "#fbbf24" }}>
            <span>⏱</span>
            <span>phi3:mini on CPU takes <strong>2–4 minutes</strong> to generate. Diagram loads once Ollama finishes.</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "start" }}>

          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Prompt input */}
            <div className="card" style={{ padding: 20 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {keywordMode ? "Keyword Cluster" : "Architecture Prompt"}
                </div>
                {/* Mode toggle */}
                <button
                  onClick={() => { if (!generating) setKeywordMode((v) => !v); }}
                  disabled={generating}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "4px 10px",
                    background: keywordMode ? "rgba(34,211,238,0.1)" : "rgba(167,139,250,0.07)",
                    border: `1px solid ${keywordMode ? "rgba(34,211,238,0.4)" : "rgba(167,139,250,0.25)"}`,
                    borderRadius: "var(--radius-md)",
                    cursor: generating ? "not-allowed" : "pointer",
                    transition: "all 0.15s",
                    opacity: generating ? 0.5 : 1,
                  }}
                >
                  <span style={{ fontSize: "0.65rem", fontFamily: "var(--font-mono)", color: keywordMode ? "var(--cyan)" : "var(--violet)", fontWeight: 600, letterSpacing: "0.06em" }}>
                    {keywordMode ? "⌖ KEYWORD MODE" : "✦ PROMPT MODE"}
                  </span>
                </button>
              </div>
              {keywordMode && (
                <div style={{ marginBottom: 10, padding: "7px 10px", background: "rgba(34,211,238,0.04)", border: "1px solid rgba(34,211,238,0.18)", borderRadius: "var(--radius-md)", fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  Enter short keywords — the pipeline expands them internally, then generates the diagram <strong style={{ color: "var(--cyan)" }}>plus</strong> gallery metadata and LinkedIn / X / Dev.to drafts.
                </div>
              )}
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate(); }}
                placeholder={keywordMode
                  ? "Enter architecture keywords — e.g. \"zero trust SaaS on AWS\" or \"Kafka event-driven e-commerce\""
                  : "Describe the architecture — name actual services, describe data flows, mention security requirements and scale context."}
                style={{ width: "100%", minHeight: 140, background: "var(--bg-base)", border: "1px solid var(--border-muted)", borderRadius: "var(--radius-md)", padding: "12px 14px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "0.875rem", lineHeight: 1.7, resize: "vertical", outline: "none", transition: "border-color 0.2s" }}
                onFocus={(e) => (e.target.style.borderColor = "rgba(34,211,238,0.5)")}
                onBlur={(e)  => (e.target.style.borderColor = "var(--border-muted)")}
                disabled={generating}
              />
              <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
                <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {prompt.length} chars · ⌘↵ to generate
                </span>
                <button
                  className="btn btn-approve"
                  onClick={() => {
                    try { posthog.capture("cta_clicked", { button: "generate_diagram" }); } catch {}
                    generate();
                  }}
                  disabled={generating || !prompt.trim()}
                  style={{ fontSize: "0.82rem", padding: "8px 22px" }}
                >
                  {generating
                    ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Generating…</>
                    : "✦ Generate Diagram"
                  }
                </button>
              </div>
            </div>

            {/* Progress stages */}
            {(generating || result || error) && (
              <div className="card animate-in" style={{ padding: "16px 20px" }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Pipeline Progress
                  </div>
                  {generating && (
                    <div className="flex items-center gap-2">
                      <span className="spinner" style={{ width: 11, height: 11 }} />
                      <span style={{ fontSize: "0.72rem", color: "#fbbf24", fontFamily: "var(--font-mono)" }}>
                        {elapsed}s — Ollama running, please wait…
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(keywordMode ? STAGE_LABELS_KEYWORD : STAGE_LABELS_BASE).map((label, i) => {
                    const s = stages[i];
                    return (
                      <div key={i} className="flex items-center gap-3" style={{ fontSize: "0.82rem" }}>
                        <div style={{ width: 20, height: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {s.status === "running" && <span className="spinner" style={{ width: 14, height: 14 }} />}
                          {s.status === "done"    && <span style={{ color: "var(--emerald)", fontSize: "1rem" }}>✓</span>}
                          {s.status === "error"   && <span style={{ color: "var(--rose)", fontSize: "1rem" }}>✗</span>}
                          {s.status === "idle"    && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--border-muted)", display: "block" }} />}
                        </div>
                        <div>
                          <span style={{ color: s.status === "idle" ? "var(--text-muted)" : "var(--text-primary)" }}>{label}</span>
                          {s.label && s.status !== "idle" && (
                            <span style={{ color: "var(--text-muted)", marginLeft: 8, fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>{s.label}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {error && (
                  <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(251,113,133,0.08)", border: "1px solid rgba(251,113,133,0.3)", borderRadius: "var(--radius-md)", color: "var(--rose)", fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}>
                    {error.includes("Ollama") ? "Ollama is not running. Start it with: ollama serve" : error}
                  </div>
                )}
              </div>
            )}

            {/* Diagram result */}
            {result && (
              <div className="animate-in">

                {/* Title bar + actions */}
                <div className="card" style={{ padding: "14px 18px", borderLeft: "3px solid var(--cyan)", marginBottom: 16 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                    Generated diagram · diagrams.net renderer
                  </div>
                  <h2 style={{ fontSize: "1.15rem", marginBottom: 6 }}>{result.spec?.title}</h2>
                  <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
                    {result.spec?.nodes.map((n) => <span key={n} className="tag">{n}</span>)}
                  </div>

                  <div className="flex items-center justify-between" style={{ marginTop: 12, flexWrap: "wrap", gap: 8 }}>
                    <div className="flex gap-2 flex-wrap">
                      <span className={`badge badge-${result.spec?.provider ?? "generic"}`}>{result.spec?.provider}</span>
                      <span className="badge badge-generic">{result.spec?.category}</span>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", alignSelf: "center" }}>
                        {result.spec?.nodes.length} nodes · {result.spec?.edges.length} edges
                      </span>
                    </div>
                    {savedId ? (
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: "0.78rem", color: "var(--emerald)" }}>✓ Saved to queue</span>
                        <button className="btn btn-ghost" style={{ fontSize: "0.72rem", padding: "4px 12px" }} onClick={() => router.push("/")}>
                          View in Queue →
                        </button>
                      </div>
                    ) : (
                      <button className="btn btn-approve" onClick={saveToQueue} disabled={saving} style={{ fontSize: "0.78rem", padding: "6px 18px" }}>
                        {saving ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Saving…</> : "↑ Save to Review Queue"}
                      </button>
                    )}
                  </div>
                </div>

                {/* diagrams.net iframe (srcDoc — self-contained) */}
                {result.spec && (
                  <iframe
                    srcDoc={buildDrawioHtml(result.spec)}
                    title={result.spec.title ?? "Architecture Diagram"}
                    sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
                    style={{ width: "100%", minHeight: 580, border: "none", display: "block", borderRadius: "var(--radius-md)", background: "#020617" }}
                  />
                )}

                {/* Share panel */}
                <div style={{ marginTop: 12 }}>
                  <SharePanel title={result.spec?.title ?? "architecture"} itemId={savedId ?? undefined} />
                </div>

                {/* Architecture description */}
                {result.description && (
                  <div className="card" style={{ marginTop: 16, padding: "14px 18px" }}>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                      Architecture Description
                    </div>
                    <p style={{ fontSize: "0.82rem", lineHeight: 1.75, color: "var(--text-secondary)" }}>{result.description}</p>
                  </div>
                )}

                {/* ── Gallery + Social panel (keyword mode only) ── */}
                {(galleryMetadata || socialPosts) && (
                  <div className="card animate-in" style={{ marginTop: 16, padding: "16px 18px", borderLeft: "3px solid var(--cyan)", background: "rgba(34,211,238,0.02)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                      <span style={{ fontSize: "0.65rem", fontFamily: "var(--font-mono)", color: "var(--cyan)", background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.35)", borderRadius: 4, padding: "2px 6px" }}>
                        ⌖ GALLERY LOOP OUTPUT
                      </span>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                        gallery metadata + social drafts — saved to queue on approve
                      </span>
                    </div>

                    {/* Gallery metadata */}
                    {galleryMetadata && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Gallery Page</div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{galleryMetadata.gallery_title}</div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: 8 }}>{galleryMetadata.gallery_description}</div>
                        <div className="flex flex-wrap gap-1">
                          {galleryMetadata.tags.map((tag) => (
                            <span key={tag} style={{ fontSize: "0.65rem", fontFamily: "var(--font-mono)", color: "var(--cyan)", background: "rgba(34,211,238,0.07)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 4, padding: "2px 6px" }}>#{tag}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Social posts tabbed preview */}
                    {socialPosts && (
                      <div>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Social Drafts</div>
                        <div className="flex gap-2" style={{ marginBottom: 10 }}>
                          {(["linkedin", "twitter", "devto"] as const).map((tab) => (
                            <button
                              key={tab}
                              onClick={() => setActiveSocialTab(tab)}
                              style={{
                                fontSize: "0.68rem", fontFamily: "var(--font-mono)", padding: "3px 10px",
                                background: activeSocialTab === tab ? "rgba(34,211,238,0.12)" : "transparent",
                                border: `1px solid ${activeSocialTab === tab ? "rgba(34,211,238,0.4)" : "var(--border-subtle)"}`,
                                borderRadius: "var(--radius-md)", cursor: "pointer",
                                color: activeSocialTab === tab ? "var(--cyan)" : "var(--text-muted)",
                                transition: "all 0.12s",
                              }}
                            >
                              {tab === "twitter" ? "X / Twitter" : tab === "devto" ? "Dev.to" : "LinkedIn"}
                            </button>
                          ))}
                        </div>
                        <pre style={{ fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontFamily: "var(--font-body)", background: "var(--bg-base)", padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", maxHeight: 200, overflow: "auto" }}>
                          {socialPosts[activeSocialTab]}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Demo email preview panel (only in demo mode) ── */}
                {activeDemoExample && (
                  <div className="card animate-in" style={{ marginTop: 16, padding: "16px 18px", borderLeft: "3px solid #fbbf24", background: "rgba(251,191,36,0.03)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: "0.65rem", fontFamily: "var(--font-mono)", color: "#fbbf24", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", borderRadius: 4, padding: "2px 6px" }}>
                        ✉ STEP 1 EMAIL PREVIEW
                      </span>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                        {activeDemoExample.user_context.role} · {activeDemoExample.user_context.company_type}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginBottom: 6 }}>
                      Subject: <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{activeDemoExample.email_preview.subject}</span>
                    </div>
                    <pre style={{ fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontFamily: "var(--font-body)", background: "var(--bg-base)", padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", maxHeight: 320, overflow: "auto" }}>
                      {activeDemoExample.email_preview.body}
                    </pre>
                  </div>
                )}

                {/* ── Conversion suggestions ── */}
                {suggestions.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
                      <h3 style={{ fontSize: "0.85rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                        Next-level versions
                      </h3>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        {isGated ? "Pro feature" : `${FREE_LIMIT - displayGenCount + 1 > 0 ? FREE_LIMIT - displayGenCount + 1 : 0} free generation${(FREE_LIMIT - displayGenCount + 1) !== 1 ? "s" : ""} remaining after this`}
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {suggestions.map((s, i) => (
                        <ConversionCard
                          key={i}
                          suggestion={s}
                          locked={isGated}
                          onGenerate={() => generate(`${prompt.trim()}\n\nExtend with: ${s.title}. ${s.description}`)}
                          generating={generating}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Evangelist email confirmation — subtle, background-only */}
                {emailSent && (
                  <div style={{ marginTop: 10, fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>✉</span>
                    <span>User nurture preview sent to your inbox</span>
                  </div>
                )}

                {/* Raw XML */}
                <details style={{ marginTop: 16 }}>
                  <summary style={{ cursor: "pointer", fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", padding: "8px 0", userSelect: "none" }}>
                    ▶ View mxGraph XML (paste into any diagrams.net)
                  </summary>
                  <pre className="json-viewer" style={{ marginTop: 8, fontSize: "0.65rem", maxHeight: 320, overflow: "auto" }}>
                    {result.drawioXml}
                  </pre>
                </details>
              </div>
            )}
          </div>

          {/* Right column — example prompts + tips */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Demo Mode button */}
            <button
              onClick={() => setDemoModeOpen((v) => !v)}
              disabled={generating}
              style={{
                textAlign: "center", padding: "10px 14px",
                background: demoModeOpen ? "rgba(251,191,36,0.12)" : "rgba(251,191,36,0.06)",
                border: "1px solid rgba(251,191,36,0.4)", borderRadius: "var(--radius-md)",
                cursor: generating ? "not-allowed" : "pointer", transition: "background 0.15s",
                opacity: generating ? 0.5 : 1,
              }}
            >
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#fbbf24", fontFamily: "var(--font-mono)" }}>
                ⚡ Demo Mode
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                Load a pre-built example instantly
              </div>
            </button>

            {/* Demo example cards (shown when demo panel is open) */}
            {demoModeOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px", background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: "var(--radius-md)" }}>
                <div style={{ fontSize: "0.68rem", color: "#fbbf24", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
                  Choose an example
                </div>
                {DEMO_EXAMPLES.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => loadDemoExample(ex)}
                    style={{
                      textAlign: "left", padding: "12px 14px",
                      background: "var(--bg-surface)", border: "1px solid rgba(251,191,36,0.3)",
                      borderRadius: "var(--radius-md)", cursor: "pointer",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#fbbf24"; (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(251,191,36,0.3)"; (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)"; }}
                  >
                    <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#fbbf24", marginBottom: 4, fontFamily: "var(--font-mono)" }}>{ex.label}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.45 }}>
                      {ex.user_context.role} · {ex.user_context.company_type}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: 1.4, marginTop: 2 }}>
                      {ex.spec.title.slice(0, 60)}…
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              Example Prompts
            </div>
            {EXAMPLE_PROMPTS.map((ex) => (
              <button
                key={ex.label}
                onClick={() => setPrompt(ex.prompt)}
                disabled={generating}
                style={{ textAlign: "left", padding: "12px 14px", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", cursor: generating ? "not-allowed" : "pointer", transition: "border-color 0.15s, background 0.15s", opacity: generating ? 0.5 : 1 }}
                onMouseEnter={(e) => { if (!generating) { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-muted)"; (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; } }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)"; (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)"; }}
              >
                <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--cyan)", marginBottom: 4, fontFamily: "var(--font-mono)" }}>{ex.label}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{ex.prompt.slice(0, 90)}…</div>
              </button>
            ))}

            <div style={{ marginTop: 8, padding: "12px 14px", background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: "var(--radius-md)", fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
              <div style={{ color: "var(--violet)", fontWeight: 600, marginBottom: 4, fontFamily: "var(--font-mono)" }}>✦ How it renders</div>
              The pipeline maps each component to a real AWS / K8s icon from the diagrams.net shape library, lays them in architectural tiers, and loads the mxGraph XML into embed.diagrams.net — the same engine powering Diagrams.so.
            </div>

            <div style={{ marginTop: 4, padding: "12px 14px", background: "rgba(34,211,238,0.03)", border: "1px solid rgba(34,211,238,0.15)", borderRadius: "var(--radius-md)", fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
              <div style={{ color: "var(--cyan)", fontWeight: 600, marginBottom: 4, fontFamily: "var(--font-mono)" }}>✦ Prompt tips</div>
              Name specific services (Amazon RDS, not "database"). Mention the cloud provider. Include security or compliance constraints for richer icon mapping.
            </div>

            {/* ── Nurture Sequences panel ── */}
            <div style={{ marginTop: 8, padding: "12px 14px", background: "rgba(251,191,36,0.03)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: "var(--radius-md)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ color: "#fbbf24", fontWeight: 600, fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>
                  ✉ Nurture Sequences
                </div>
                {(activeDemoExample || savedId) && seqCountdown !== null && (
                  <div style={{ fontSize: "0.68rem", fontFamily: "var(--font-mono)", color: seqRunning ? "var(--emerald)" : "var(--text-muted)" }}>
                    {seqRunning ? "⚡ firing…" : `next check in ${seqCountdown}s`}
                  </div>
                )}
              </div>

              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 8 }}>
                {(activeDemoExample || savedId)
                  ? "Auto-firing every 10 seconds — emails send automatically once their delay has passed."
                  : "Emails fire automatically after saving a diagram. Or click to check now."
                }
              </div>

              <button
                onClick={runSequences}
                disabled={seqRunning}
                style={{
                  width: "100%", padding: "7px 12px", fontSize: "0.75rem", fontFamily: "var(--font-mono)",
                  background: seqRunning ? "rgba(251,191,36,0.06)" : "rgba(251,191,36,0.1)",
                  border: "1px solid rgba(251,191,36,0.35)", borderRadius: "var(--radius-md)",
                  color: "#fbbf24", cursor: seqRunning ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  transition: "background 0.15s",
                }}
              >
                {seqRunning
                  ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Checking…</>
                  : "Send Due Emails →"
                }
              </button>

              {seqResult && (
                <div style={{ marginTop: 8, fontSize: "0.7rem", fontFamily: "var(--font-mono)", lineHeight: 1.8 }}>
                  {seqResult.processed > 0 ? (
                    <>
                      <div style={{ color: "var(--emerald)", fontWeight: 600 }}>
                        ✓ {seqResult.processed} email{seqResult.processed !== 1 ? "s" : ""} sent
                      </div>
                      {(seqResult.sentSteps ?? []).map((s) => (
                        <div key={`${s.id}-${s.step}`} style={{ color: "var(--text-muted)", paddingLeft: 10 }}>
                          Step {s.step} of 3 — {
                            s.step === 1 ? "intro + pro upgrades" :
                            s.step === 2 ? "production-grade follow-up" :
                            "upgrade before limit"
                          }
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ color: "var(--text-muted)" }}>– no steps due yet</div>
                  )}
                  {seqResult.errors > 0 && (
                    <div style={{ color: "var(--rose)" }}>✗ {seqResult.errors} error — check console</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Conversion card ────────────────────────────────────────────────────────────

function ConversionCard({
  suggestion, locked, onGenerate, generating,
}: {
  suggestion: ConversionSuggestion;
  locked:     boolean;
  onGenerate: () => void;
  generating: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        padding: "14px 16px",
        borderLeft: `3px solid ${locked ? "rgba(167,139,250,0.35)" : "var(--violet)"}`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.65rem", fontFamily: "var(--font-mono)", color: "var(--violet)", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 4, padding: "2px 6px" }}>
          {locked ? "🔒 PRO" : "NEXT"}
        </span>
        <div style={{ fontSize: "0.82rem", fontWeight: 600, color: locked ? "var(--text-secondary)" : "var(--text-primary)" }}>
          {suggestion.title}
        </div>
      </div>

      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
        {suggestion.description}
      </div>

      {locked ? (
        <div style={{ marginTop: 2, fontSize: "0.75rem", color: "var(--violet)", fontFamily: "var(--font-mono)" }}>
          Upgrade to Pro to generate production-grade follow-ups.
        </div>
      ) : (
        <button
          className="btn btn-ghost"
          onClick={onGenerate}
          disabled={generating}
          style={{ fontSize: "0.72rem", padding: "5px 12px", color: "var(--violet)", borderColor: "rgba(167,139,250,0.4)", marginTop: 2, alignSelf: "flex-start" }}
        >
          {generating ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Generating…</> : "Generate follow-up →"}
        </button>
      )}
    </div>
  );
}
