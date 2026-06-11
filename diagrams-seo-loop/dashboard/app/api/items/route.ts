// app/api/items/route.ts — GET all items, POST a new generated item

import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getAllItems, getPendingItems, getCounts, QUEUE_DIR } from "@/lib/queue";
import { addSequence } from "@/lib/sequence-runner";
import { buildDrawioHtml } from "@/lib/diagram-builder";
import { generateConversionSuggestions, sanitizeSuggestionField } from "@/lib/conversion-suggestions";
import { inferUserContext } from "@/lib/ollama";
import { getIntentProfile } from "@/lib/intent";
import { getUserEvents } from "@/lib/events";
import { getDecision } from "@/lib/decision-engine";
import { isPostHogConfigured, getUserEventCounts, eventCountsToDecisionAction, mergeEventCounts } from "@/lib/posthog-query";
import type { QueueItem, Provider, Category, DecisionAction, DecisionPriority } from "@/types/queue";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  if (status === "pending") {
    return NextResponse.json({ items: getPendingItems(), counts: getCounts() });
  }

  return NextResponse.json({ items: getAllItems(), counts: getCounts() });
}

// ── POST — save a Generate-page result to the review queue ───────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      title:                   string;
      description:             string;
      nodes:                   string[];
      edges:                   [string, string][];
      provider:                string;
      category:                string;
      drawioXml:               string;
      keyword?:                string;
      conversion_suggestions?: { title: string; description: string }[];
      /** Anonymous localStorage user ID passed from the Generate page */
      user_id?:                string;
      /** Pre-generated gallery metadata from keyword mode */
      gallery_metadata?: {
        gallery_title:       string;
        gallery_description: string;
        tags:                string[];
        category:            string;
        provider:            string;
      };
      /** Pre-generated social posts from keyword mode */
      social_posts?: {
        linkedin: string;
        twitter:  string;
        devto:    string;
      };
    };

    const {
      title,
      description,
      nodes,
      edges,
      provider,
      category,
      drawioXml,
      keyword,
      conversion_suggestions,
      user_id,
      gallery_metadata: preGalleryMetadata,
      social_posts:     preSocialPosts,
    } = body;

    if (!title || !nodes?.length) {
      return NextResponse.json({ error: "title and nodes are required" }, { status: 400 });
    }

    const baseId  = slugify(title);
    // Make ID unique if collision
    let id = baseId;
    let attempt = 0;
    while (
      fs.existsSync(path.join(QUEUE_DIR, `${id}.json`)) &&
      attempt < 99
    ) {
      attempt++;
      id = `${baseId}-${attempt}`;
    }

    const spec = {
      title,
      nodes,
      edges,
      provider: (provider ?? "generic") as Provider,
      category: (category ?? "cloud")   as Category,
      style:    "flow" as const,
    };

    // Build and persist the HTML file (uses same renderer as pipeline)
    const html    = buildDrawioHtml(spec);
    const htmlRel = `data/queue/${id}.html`;
    const htmlAbs = path.join(QUEUE_DIR, `${id}.html`);
    fs.writeFileSync(htmlAbs, html, "utf-8");


    const sourcePrompt = keyword?.trim() || title;

    // Use pre-generated gallery metadata (keyword mode) or build minimal fallback
    const resolvedGalleryMetadata = preGalleryMetadata ?? {
      gallery_title:       (title.length > 60 ? title.slice(0, 57) + "…" : title),
      gallery_description: description
        ? description.slice(0, 160)
        : `${category} architecture on ${provider} — ${nodes.slice(0, 3).join(", ")} and more.`,
      tags:     nodes.slice(0, 5).map((n) => n.toLowerCase().replace(/\s+/g, "-")),
      category: spec.category,
      provider: spec.provider,
    };

    // Use pre-generated social posts (keyword mode) or fall back to templates
    const resolvedSocialPosts = preSocialPosts ?? {
      linkedin: `I just mapped out a ${title} using an AI pipeline that generates diagrams.net architecture diagrams locally. Here's the full spec → LINK_HERE`,
      twitter:  `Just generated: ${title}. Architecture mapped with real AWS icons via diagrams.net. LINK_HERE`,
      devto:    `## ${title}\n\nArchitecture overview:\n\n${description?.slice(0, 400) ?? ""}\n\nFull interactive diagram → LINK_HERE`,
    };
    let resolvedSuggestions = conversion_suggestions?.length
      ? conversion_suggestions.slice(0, 2).map((s) => ({
          title:       sanitizeSuggestionField(s.title),
          description: sanitizeSuggestionField(s.description),
        }))
      : [];

    if (resolvedSuggestions.length < 2) {
      try {
        resolvedSuggestions = await generateConversionSuggestions(
          sourcePrompt,
          title,
          nodes,
          description ?? "",
        );
      } catch {
        // keep empty — notify step will be skipped on client if < 2 suggestions
      }
    }

    // Infer user role + company type from the prompt (best-effort, non-blocking)
    let userContext = { role: "Software Engineer", company_type: "Tech Company" };
    try {
      userContext = await inferUserContext(sourcePrompt);
    } catch {
      // keep defaults — never block the save
    }

    // ── Decision engine — PostHog-first, local fallback ──────────────────────
    //
    // When POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID are set, query PostHog
    // for the user's real event counts and derive the decision action from there.
    // PostHog becomes the single source of truth for user intent — the local
    // JSON files (events/, intent/, decisions/) are kept as a fallback for
    // offline / unconfigured environments.

    // Load local intent profile (used as fallback only)
    const intentProfile = user_id?.trim() ? getIntentProfile(user_id.trim()) : null;

    let decisionResult: {
      action:     DecisionAction;
      reason:     string;
      confidence: number;
      priority:   DecisionPriority;
    } = {
      action:     "educational_email",
      reason:     "",
      confidence: 0,
      priority:   "low",
    };

    try {
      if (isPostHogConfigured() && user_id?.trim()) {
        // ── PostHog path ───────────────────────────────────────────────────
        // PostHog has ingestion lag (a few seconds). Merge with the local
        // intent profile taking the MAX of each counter so we always use
        // whichever source has fresher data.
        const phCounts  = await getUserEventCounts(user_id.trim());
        const localEventCounts = intentProfile?.event_counts ?? {};
        const merged = mergeEventCounts(phCounts, {
          diagram_generated:  (localEventCounts.diagram_generated  as number | undefined) ?? 0,
          free_limit_reached: (localEventCounts.free_limit_reached as number | undefined) ?? 0,
        });
        const phAction = eventCountsToDecisionAction(merged);
        decisionResult = {
          action:     phAction,
          reason:     `PostHog+local: generated=${merged.diagram_generated} saved=${merged.diagram_saved} limit_hits=${merged.free_limit_reached}`,
          confidence: 0.9,
          priority:   merged.free_limit_reached >= 1 ? "high" : merged.diagram_generated >= 3 ? "medium" : "low",
        };
        console.log(`[items] PostHog decision for ${user_id}: ${phAction}`, merged);
      } else {
        // ── Local fallback path ────────────────────────────────────────────
        const userEvents = user_id?.trim() ? getUserEvents(user_id.trim()) : [];
        const recentEvents = userEvents
          .slice()
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
          .slice(0, 10)
          .map((e) => e.event_type);

        const decision = await getDecision(
          {
            user_id:        user_id?.trim() || undefined,
            intent_score:   intentProfile?.intent_score   ?? 0,
            intent_segment: intentProfile?.segment        ?? "casual",
            event_counts:   intentProfile?.event_counts   ?? {},
            user_context:   userContext,
            recent_events:  recentEvents,
          },
          id,
        );
        decisionResult = {
          action:     decision.action,
          reason:     decision.reason,
          confidence: decision.confidence,
          priority:   decision.priority,
        };
      }
    } catch {
      // Decision failure never blocks the save — default to educational_email
    }

    const item: QueueItem = {
      id,
      keyword:           sourcePrompt,
      status:            "pending",
      timestamp:         new Date().toISOString(),
      description:       description ?? "",
      spec,
      diagram_html_path: htmlRel,
      gallery_metadata: resolvedGalleryMetadata,
      social_posts:     resolvedSocialPosts,
      conversion_suggestions: resolvedSuggestions,
      user_context:           userContext,
      // Intent Intelligence Layer fields
      creator_user_id: user_id?.trim() || undefined,
      intent_score:    intentProfile?.intent_score ?? 0,
      intent_segment:  intentProfile?.segment      ?? "casual",
      // AI Decision Engine fields
      decision_action:     decisionResult.action     || undefined,
      decision_priority:   decisionResult.priority   || undefined,
      decision_reason:     decisionResult.reason     || undefined,
      decision_confidence: decisionResult.confidence ?? undefined,
    };

    const jsonAbs = path.join(QUEUE_DIR, `${id}.json`);
    fs.writeFileSync(jsonAbs, JSON.stringify(item, null, 2), "utf-8");

    // Write a 3-step nurture sequence record (replaces n8n webhook)
    // Fire-and-forget — addSequence swallows all errors internally
    addSequence({
      diagram_id:               id,
      diagram_title:            item.spec.title,
      user_prompt:              item.keyword,
      suggestion_1_title:       resolvedSuggestions[0]?.title       ?? "",
      suggestion_1_description: resolvedSuggestions[0]?.description ?? "",
      suggestion_2_title:       resolvedSuggestions[1]?.title       ?? "",
      suggestion_2_description: resolvedSuggestions[1]?.description ?? "",
      user_context:             userContext,
      decision_action:          decisionResult.action || "educational_email",
    });

    return NextResponse.json({ ok: true, id, item }, { status: 201 });
  } catch (err: unknown) {
    console.error("POST /api/items error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
