/**
 * app/api/generate/route.ts
 * Streaming SSE endpoint: accepts a text prompt, calls Ollama in 3 steps,
 * and sends progress events back to the client as they complete.
 *
 * Event format (newline-delimited SSE):
 *   data: {"stage":1,"status":"running","label":"..."}
 *   data: {"stage":1,"status":"done","label":"..."}
 *   ...
 *   data: {"stage":4,"status":"done","drawioXml":"...","spec":{...},"description":"..."}
 *
 * Rendering: diagrams.net (embed.diagrams.net) — draw.io engine, no Diagrams.so API.
 * No external LLM APIs. Only Ollama at localhost:11434.
 */

import { NextRequest } from "next/server";
import { buildDrawioXml } from "@/lib/diagram-builder";
import { detectOllamaModel, ollamaGenerate } from "@/lib/ollama";
import { generateConversionSuggestions } from "@/lib/conversion-suggestions";
import type { ConversionSuggestion } from "@/lib/conversion-suggestions";
import type { GalleryMetadata, SocialPosts } from "@/types/queue";

export const maxDuration = 300; // Allow up to 5 min for slow hardware

// ── JSON extraction ───────────────────────────────────────────────────────────

function extractJson(text: string): Record<string, unknown> {
  // Try direct parse
  try { return JSON.parse(text); } catch {}
  // Strip markdown fences
  const clean = text.replace(/```(?:json)?[^\n]*\n?/g, "").replace(/`+$/, "").trim();
  try { return JSON.parse(clean); } catch {}
  // Find first {...}
  const m = clean.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  throw new Error("No valid JSON found");
}

function recoverNodesFromTruncated(text: string, prompt: string): {
  title: string; nodes: string[]; provider: string; category: string;
} {
  const clean = text.replace(/```(?:json)?[^\n]*\n?/g, "").trim();
  const title = (clean.match(/"title"\s*:\s*"([^"]+)"/) ?? [])[1] ?? prompt.slice(0, 50);
  const prov  = (clean.match(/"provider"\s*:\s*"(aws|azure|gcp|generic)"/) ?? [])[1] ?? "generic";
  const cat   = (clean.match(/"category"\s*:\s*"(cloud|devops|microservices|data|security|cicd)"/) ?? [])[1] ?? "cloud";
  const nodesMatch = clean.match(/"nodes"\s*:\s*\[([^\]]*)/);
  const nodes: string[] = nodesMatch
    ? (nodesMatch[1].match(/"([^"]+)"/g) ?? []).map((s) => s.replace(/"/g, ""))
    : [];
  return { title, nodes, provider: prov, category: cat };
}

// ── Edge extraction from plain text ──────────────────────────────────────────

function parseEdgesFromText(raw: string, nodes: string[]): [string, string][] {
  const nodeSet = new Set(nodes);
  const edges: [string, string][] = [];
  const seen = new Set<string>();

  for (const line of raw.split("\n")) {
    const m = line.trim().match(/^[-*•]?\s*(.+?)\s*[-=][-=>]+\s*(.+?)\s*[.,;]?$/);
    if (!m) continue;
    const src = m[1].trim().replace(/^["']|["']$/g, "");
    const dst = m[2].trim().replace(/^["']|["']$/g, "");
    if (nodeSet.has(src) && nodeSet.has(dst) && src !== dst) {
      const key = `${src}→${dst}`;
      if (!seen.has(key)) { seen.add(key); edges.push([src, dst]); }
    }
  }
  return edges;
}

// ── Prompt templates ──────────────────────────────────────────────────────────

function stage1Prompt(userPrompt: string): string {
  return `Describe the architecture for: "${userPrompt}"

Write 5 to 8 sentences covering:
1. The entry point (what receives traffic first)
2. The main services and what each one does
3. The data layer (databases, caches, object storage)
4. Any messaging, queues, or async components
5. Security or compliance considerations if relevant

Use specific product names (Amazon SQS, Nginx, PostgreSQL, etc.). Sentences only, no bullet points.`;
}

function stage2aPrompt(userPrompt: string, description: string): string {
  return `Output ONLY a JSON object. No explanation, no markdown.

Architecture topic: ${userPrompt}
Summary: ${description.slice(0, 400)}

JSON to output (fill in real values):
{
  "title": "short diagram title under 55 chars",
  "nodes": ["Node1", "Node2", "Node3", "Node4", "Node5", "Node6", "Node7", "Node8"],
  "provider": "aws",
  "category": "microservices",
  "style": "flow"
}

Rules:
- nodes: exactly 8 specific component names, each under 22 chars, name actual services
- provider: aws, azure, gcp, or generic
- category: cloud, devops, microservices, data, security, or cicd

Your JSON:`;
}

function stage2bPrompt(nodes: string[], description: string): string {
  const list = nodes.map((n) => `- ${n}`).join("\n");
  return `These are the components in an architecture diagram:
${list}

Architecture summary: ${description.slice(0, 300)}

List the connections between them. Write one connection per line as:
Source -> Target

Only use names from the list above. Write 6 to 10 connections. No other text.

Connections:`;
}

// ── Gallery metadata helpers ──────────────────────────────────────────────────

function galleryMetadataPrompt(keyword: string, title: string, nodes: string[]): string {
  return `Complete this template for a diagram gallery page. Replace each bracketed instruction with real content.

Diagram topic: ${keyword}
Key components: ${nodes.slice(0, 6).join(", ")}

Title: [under 60 characters, specific and SEO-friendly, include key technology names]
Description: [under 160 characters, specific and useful, mention main technologies and use case]
Tags: [3 to 5 comma-separated lowercase tags relevant to this architecture]

Your answer (keep the exact label format, no extra text):`;
}

function parseGalleryMetadata(
  raw: string,
  title: string,
  provider: string,
  category: string,
): GalleryMetadata {
  let gallery_title = "";
  let gallery_description = "";
  let tags: string[] = [];

  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (/^title\s*:/i.test(t)) {
      const val = t.split(":").slice(1).join(":").trim().replace(/^\[|\]$/g, "").trim();
      if (val && val.length > 4 && !val.toLowerCase().startsWith("under "))
        gallery_title = val.slice(0, 60);
    } else if (/^description\s*:/i.test(t)) {
      const val = t.split(":").slice(1).join(":").trim().replace(/^\[|\]$/g, "").trim();
      if (val && val.length > 4 && !val.toLowerCase().startsWith("under "))
        gallery_description = val.slice(0, 160);
    } else if (/^tags\s*:/i.test(t)) {
      const rawTags = t.split(":").slice(1).join(":").trim().replace(/^\[|\]$/g, "");
      tags = rawTags
        .split(",")
        .map((s) => s.trim().toLowerCase().replace(/\s+/g, "-").replace(/['"]/g, ""))
        .filter(Boolean)
        .slice(0, 5);
    }
  }

  return {
    gallery_title:       gallery_title || title.slice(0, 60),
    gallery_description: gallery_description || `${title} — production-grade architecture diagram.`,
    tags:                tags.length ? tags : [provider, category],
    category:            category as GalleryMetadata["category"],
    provider:            provider as GalleryMetadata["provider"],
  };
}

// ── Social posts helpers ──────────────────────────────────────────────────────

function socialPostsPrompt(keyword: string, title: string, nodes: string[]): string {
  return `Write three social media posts about this architecture diagram. Start each post with the problem it solves. Sound like an engineer sharing a solution, not an ad.

Topic: ${keyword}
Diagram title: ${title}
Key components: ${nodes.slice(0, 5).join(", ")}

Write each post under its exact label. No other text.

LinkedIn: [3 to 4 sentences. Start with the problem. Name specific components. End with LINK_HERE]

Twitter: [Under 280 characters. One relevant emoji. End with LINK_HERE]

Devto: [4 to 5 sentences. Technical tone. Start with the engineering challenge. End with LINK_HERE]`;
}

function parseSocialPosts(raw: string, keyword: string, title: string): SocialPosts {
  const posts: SocialPosts = { linkedin: "", twitter: "", devto: "" };

  // Normalise bold markdown headers like **LinkedIn** or **LinkedIn Post:**
  let normalised = raw.replace(
    /\*\*((?:linkedin|twitter|devto|dev\.to)[^*]*?)\*\*\s*:?/gi,
    (_, g: string) => {
      const label = g.toLowerCase();
      if (label.includes("linkedin")) return "linkedin:";
      if (label.includes("twitter")) return "twitter:";
      return "devto:";
    },
  );
  // Normalise markdown headings
  normalised = normalised.replace(
    /(?:^|\n)#+\s*(linkedin|twitter|devto|dev\.to)[^\n]*/gi,
    (_, g: string) => {
      const label = g.toLowerCase();
      if (label.includes("linkedin")) return "\nlinkedin:";
      if (label.includes("twitter")) return "\ntwitter:";
      return "\ndevto:";
    },
  );

  const parts = normalised.split(/(?:^|\n)(linkedin|twitter|devto)\s*:/i);

  if (parts.length >= 3) {
    for (let i = 1; i < parts.length - 1; i += 2) {
      const label = parts[i].toLowerCase().trim() as keyof SocialPosts;
      let content = parts[i + 1]?.trim() ?? "";
      content = content.split("\n\n")[0].trim(); // take first paragraph only
      if (content && !content.includes("LINK_HERE"))
        content = content.trimEnd().replace(/[.,;]$/, "") + " LINK_HERE";
      if (label in posts && content) posts[label] = content;
    }
  }

  if (!posts.linkedin)
    posts.linkedin = `Building ${title}? Here's the full architecture breakdown. LINK_HERE`;
  if (!posts.twitter)
    posts.twitter = `🏗 Architecture: ${keyword}. Mapped with real AWS icons. LINK_HERE`;
  if (!posts.devto)
    posts.devto = `## ${title}\n\n${keyword} — full architecture with components and connections. LINK_HERE`;

  return posts;
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { prompt, keyword_mode } = (await req.json()) as {
    prompt:        string;
    keyword_mode?: boolean;
  };

  if (!prompt?.trim()) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Detect model
        const model = await detectOllamaModel();
        send({ stage: 0, status: "done", label: `Using model: ${model}` });

        // Stage 1 — architecture description
        send({ stage: 1, status: "running", label: "Expanding architecture description…" });
        const description = await ollamaGenerate(stage1Prompt(prompt), model, 512);
        send({ stage: 1, status: "done", label: `Architecture described (${description.length} chars)` });

        // Stage 2a — nodes
        send({ stage: 2, status: "running", label: "Identifying components…" });
        let title = prompt.slice(0, 55);
        let nodes: string[] = [];
        let provider = "generic";
        let category = "cloud";

        try {
          const raw2a = await ollamaGenerate(stage2aPrompt(prompt, description), model, 500);
          try {
            const parsed = extractJson(raw2a) as Record<string, unknown>;
            title    = (parsed.title    as string) ?? title;
            nodes    = (parsed.nodes    as string[]) ?? [];
            provider = (parsed.provider as string) ?? provider;
            category = (parsed.category as string) ?? category;
          } catch {
            const recovered = recoverNodesFromTruncated(raw2a, prompt);
            title    = recovered.title;
            nodes    = recovered.nodes;
            provider = recovered.provider;
            category = recovered.category;
          }
        } catch {}

        // Deduplicate nodes
        nodes = [...new Set(nodes)];
        send({ stage: 2, status: "done", label: `${nodes.length} components identified` });

        // Stage 2b — edges
        send({ stage: 3, status: "running", label: "Mapping connections…" });
        let edges: [string, string][] = [];
        if (nodes.length >= 2) {
          try {
            const raw2b = await ollamaGenerate(stage2bPrompt(nodes, description), model, 300);
            edges = parseEdgesFromText(raw2b, nodes);
          } catch {}
        }
        send({ stage: 3, status: "done", label: `${edges.length} connections mapped` });

        // Build diagrams.net XML (mxGraph format with AWS/K8s icons)
        const spec = { title, nodes, edges, provider, category };
        const drawioXml = buildDrawioXml(spec);

        send({ stage: 4, status: "running", label: "Diagram rendered" });

        // Stage 5 — personalised paid-unlock suggestions
        send({ stage: 4, status: "running", label: "Generating Pro follow-up suggestions…" });
        let conversionSuggestions: ConversionSuggestion[] = [];
        try {
          conversionSuggestions = await generateConversionSuggestions(
            prompt,
            title,
            nodes,
            description,
            model,
          );
        } catch {
          conversionSuggestions = [];
        }

        send({
          stage: 4,
          status: "done",
          label: "Diagram ready",
          drawioXml,
          spec,
          description,
          conversionSuggestions,
        });

        // ── Keyword mode: gallery metadata + social posts ─────────────────
        if (keyword_mode) {
          // Stage 5 — gallery metadata
          send({ stage: 5, status: "running", label: "Writing gallery metadata…" });
          let gallery_metadata: GalleryMetadata = {
            gallery_title:       title.slice(0, 60),
            gallery_description: `${title} — production-grade architecture diagram.`,
            tags:                [provider, category],
            category:            category as GalleryMetadata["category"],
            provider:            provider as GalleryMetadata["provider"],
          };
          try {
            const raw5 = await ollamaGenerate(
              galleryMetadataPrompt(prompt, title, nodes),
              model,
              300,
            );
            gallery_metadata = parseGalleryMetadata(raw5, title, provider, category);
          } catch {}
          send({
            stage: 5,
            status: "done",
            label: `"${gallery_metadata.gallery_title.slice(0, 45)}"`,
            gallery_metadata,
          });

          // Stage 6 — social posts
          send({ stage: 6, status: "running", label: "Drafting social posts…" });
          let social_posts: SocialPosts = {
            linkedin: `Built a ${title} using diagrams.net. LINK_HERE`,
            twitter:  `🏗 Architecture: ${prompt.slice(0, 80)}. LINK_HERE`,
            devto:    `## ${title}\n\nFull architecture diagram → LINK_HERE`,
          };
          try {
            const raw6 = await ollamaGenerate(
              socialPostsPrompt(prompt, title, nodes),
              model,
              800,
            );
            social_posts = parseSocialPosts(raw6, prompt, title);
          } catch {}
          send({
            stage: 6,
            status: "done",
            label: "LinkedIn · X · Dev.to ready",
            social_posts,
          });
        }

      } catch (err) {
        send({
          stage: -1,
          status: "error",
          label: err instanceof Error ? err.message : String(err),
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
