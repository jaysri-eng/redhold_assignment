/**
 * LLM-generated paid-upgrade follow-up suggestions (phi3:mini tuned).
 */

import { detectOllamaModel, ollamaGenerate } from "./ollama";

export interface ConversionSuggestion {
  title:       string;
  description: string;
}

function cleanText(s: string): string {
  return s.trim().replace(/^["']|["']$/g, "");
}

/** Strip bracket placeholders phi3:mini often copies from the prompt template. */
export function sanitizeSuggestionField(s: string): string {
  let val = cleanText(s);
  // Repeated passes for stacked prefixes like "[title] [title] Foo"
  for (let i = 0; i < 3; i++) {
    val = val
      .replace(/^\[(?:title|description)(?:\s*here)?\]\s*/i, "")
      .replace(/^\[one sentence[^\]]*\]\s*/i, "")
      .replace(/^\[[^\]]{1,60}\]\s*/, "");
  }
  val = val.replace(/\[title\]\s*/gi, "").replace(/\[description\]\s*/gi, "");
  return val.trim();
}

function isLowQualitySuggestion(title: string, description: string): boolean {
  if (!title || title.length < 4) return true;
  if (/^\[.+\]$/.test(title)) return true;
  if (/\[title\]|\[description\]/i.test(title + description)) return true;
  if (/^under \d+ characters/i.test(title)) return true;
  return false;
}

function normalizeSuggestion(rawTitle: string, rawDescription: string): ConversionSuggestion {
  return {
    title:       sanitizeSuggestionField(rawTitle).slice(0, 55),
    description: sanitizeSuggestionField(rawDescription || "Production-grade follow-up on Pro.").slice(0, 120),
  };
}

/** Parse "Suggestion 1: Title - Description" lines from Ollama output. */
export function parseConversionSuggestions(raw: string): ConversionSuggestion[] {
  const suggestions: ConversionSuggestion[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^(?:suggestion\s*\d+[:.]?\s*|\d+[.)]\s*)(.*)/i);
    const content = cleanText(match ? match[1] : trimmed);

    // Skip lines that are only template instructions
    if (/^\[(?:title|description)\]$/i.test(content)) continue;
    if (/^format exactly/i.test(content)) continue;

    if (content.includes(" - ")) {
      const dashIdx = content.indexOf(" - ");
      const rawTitle = content.slice(0, dashIdx);
      const rawDesc  = content.slice(dashIdx + 3);
      const norm     = normalizeSuggestion(rawTitle, rawDesc);
      if (!isLowQualitySuggestion(norm.title, norm.description)) {
        suggestions.push(norm);
      }
    } else if (/^[^:]+:\s+.+/.test(content) && !/^suggestion/i.test(content)) {
      const idx = content.indexOf(": ");
      const norm = normalizeSuggestion(content.slice(0, idx), content.slice(idx + 2));
      if (!isLowQualitySuggestion(norm.title, norm.description)) {
        suggestions.push(norm);
      }
    } else if (content.length > 8 && !content.startsWith("[")) {
      suggestions.push(normalizeSuggestion(content, ""));
    }
  }

  return suggestions.filter((s) => s.title.length > 0);
}

function buildPrompt(
  userPrompt: string,
  title: string,
  nodes: string[],
  description: string,
): string {
  const nodesPreview = nodes.slice(0, 8).join(", ");
  const summary      = description.slice(0, 280);

  return `A developer created this architecture diagram on Diagrams.so.

Prompt: "${userPrompt.slice(0, 220)}"
Title: ${title}
Components: ${nodesPreview}
Summary: ${summary}

Suggest 2 paid Pro follow-up diagrams specific to THIS architecture. Use real service names from the component list.

Rules:
- Title under 50 chars, no brackets, no placeholders
- Description: one sentence under 100 chars
- Do NOT write the words title or description as labels

Example output for a Kafka e-commerce diagram:
Suggestion 1: Order saga with DLQ and idempotency keys - Adds retry topics and dead-letter queues between order and payment services.
Suggestion 2: Real-time fraud scoring on checkout stream - Adds Kinesis Analytics between API Gateway and payment Lambda.

Now write 2 suggestions for the architecture above. Copy the example format exactly. No brackets:

Suggestion 1:`;
}

function fallbackSuggestions(title: string, nodes: string[]): ConversionSuggestion[] {
  const anchor = nodes.slice(0, 2).join(" + ") || title;
  return [
    {
      title:       `Production hardening: ${anchor}`.slice(0, 55),
      description: `Add observability, secrets rotation, and policy guardrails around ${anchor}.`.slice(0, 120),
    },
    {
      title:       `Scale-out: ${title}`.slice(0, 55),
      description: `Multi-AZ layout with autoscaling and failure isolation for ${anchor}.`.slice(0, 120),
    },
  ];
}

export async function generateConversionSuggestions(
  userPrompt: string,
  title: string,
  nodes: string[],
  description: string,
  model?: string,
): Promise<ConversionSuggestion[]> {
  const resolvedModel = model ?? (await detectOllamaModel());

  // Prompt ends with "Suggestion 1:" so model continues inline; prepend label for parser
  const continuation = await ollamaGenerate(buildPrompt(userPrompt, title, nodes, description), resolvedModel, 256);
  const raw = `Suggestion 1: ${continuation}`;

  const parsed = parseConversionSuggestions(raw);
  const valid  = parsed.filter((s) => !isLowQualitySuggestion(s.title, s.description));

  if (valid.length >= 2) return valid.slice(0, 2);
  if (valid.length === 1) {
    const fb = fallbackSuggestions(title, nodes);
    return [valid[0], fb[1]];
  }

  return fallbackSuggestions(title, nodes);
}
