/**
 * Shared Ollama helpers for server-side API routes.
 */

export const OLLAMA_URL = "http://localhost:11434/api/generate";

export const OLLAMA_MODEL_PRIORITY = [
  "phi3",
  "phi",
  "llama3",
  "llama3.2",
  "llama3.1",
  "mistral",
  "gemma",
];

export async function detectOllamaModel(): Promise<string> {
  const res = await fetch("http://localhost:11434/api/tags", {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error("Ollama not reachable");
  const data = (await res.json()) as { models?: { name: string }[] };
  const available = (data.models ?? []).map((m) => m.name);
  for (const p of OLLAMA_MODEL_PRIORITY) {
    const match = available.find((a) => a.toLowerCase().includes(p));
    if (match) return match;
  }
  if (available.length > 0) return available[0];
  throw new Error("No models found in Ollama. Run: ollama pull phi3:mini");
}

/**
 * Infers the user's professional role and company type from their diagram prompt.
 * Returns sensible defaults if Ollama is unreachable or output cannot be parsed.
 */
export async function inferUserContext(
  prompt: string,
): Promise<{ role: string; company_type: string }> {
  try {
    const model = await detectOllamaModel();
    const raw   = await ollamaGenerate(
      `Given this architecture diagram prompt: "${prompt.slice(0, 200)}"
Infer the user's likely professional role and company type.
Reply in valid JSON only, no extra text:
{"role": "Senior DevOps Engineer", "company_type": "B2B SaaS startup"}`,
      model,
      80,
    );
    const match = raw.match(/\{[^{}]+\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { role?: string; company_type?: string };
      return {
        role:         parsed.role         ?? "Software Engineer",
        company_type: parsed.company_type ?? "Tech Company",
      };
    }
  } catch {
    // fall through to defaults
  }
  return { role: "Software Engineer", company_type: "Tech Company" };
}

export async function ollamaGenerate(
  prompt: string,
  model: string,
  numPredict = 256,
): Promise<string> {
  const res = await fetch(OLLAMA_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0.3, num_predict: numPredict },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = (await res.json()) as { response?: string };
  return (data.response ?? "").trim();
}
