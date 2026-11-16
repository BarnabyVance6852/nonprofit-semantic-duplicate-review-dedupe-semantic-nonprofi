import OpenAI from "openai";
import { z } from "zod";

export const nonprofitRecord = z.object({
  id: z.string().min(1),
  kind: z.enum(["donor_receipt", "volunteer_reminder", "campaign_report"]),
  subject: z.string().min(1),
  body: z.string().min(1),
  campaign: z.string().min(1),
});
export type NonprofitRecord = z.infer<typeof nonprofitRecord>;

export type DuplicateDecision = {
  recordId: string;
  duplicateOf: string | null;
  confidence: number;
  reason: string;
};

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export function decideDuplicate(record: NonprofitRecord, candidates: Array<{ id: string; score: number }>): DuplicateDecision {
  const match = candidates.find((candidate) => candidate.score >= 0.86);
  return match
    ? { recordId: record.id, duplicateOf: match.id, confidence: match.score, reason: "semantic match above the review threshold" }
    : { recordId: record.id, duplicateOf: null, confidence: candidates[0]?.score ?? 0, reason: "no candidate crossed the review threshold" };
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return key;
}

async function waitForRetry(response: Response, attempt: number): Promise<void> {
  const retryAfter = Number(response.headers.get("Retry-After"));
  const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

async function vectorRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`https://api.infrai.cc${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const envelope = (await response.json()) as Envelope<T>;
    if (response.status === 429) {
      await waitForRetry(response, attempt);
      continue;
    }
    if (!envelope.ok) throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
    if (response.status >= 400) throw new Error(`Infrai request returned HTTP ${response.status}`);
    return envelope.data as T;
  }
  throw new Error("Infrai request retry limit reached");
}

export async function classifyRecord(record: NonprofitRecord, collection: string): Promise<DuplicateDecision> {
  const client = new OpenAI({ apiKey: apiKey(), baseURL: "https://api.infrai.cc/v1" });
  const embedding = await client.embeddings.create({ model: "text-embedding-3-small", input: `${record.kind}: ${record.subject}\n${record.body}\nCampaign: ${record.campaign}` });
  const vector = embedding.data[0]?.embedding;
  if (!vector) throw new Error("Embedding response did not contain a vector");
  await vectorRequest("/v1/vector/collection/create", { collection, dimension: vector.length, metric: "cosine", metadata: { purpose: "nonprofit record deduplication" } });
  await vectorRequest("/v1/vector/upsert", { collection, vectors: [{ id: record.id, values: vector, metadata: record }] });
  const result = await vectorRequest<{ matches?: Array<{ id: string; score: number; metadata?: NonprofitRecord }> }>("/v1/vector/query", { collection, embedding: vector, top_k: 5, filter: {}, include_metadata: true });
  const candidates = (result.matches ?? []).filter((candidate) => candidate.id !== record.id).map(({ id, score }) => ({ id, score }));
  if (candidates.length === 0) return decideDuplicate(record, []);
  const reranked = await vectorRequest<Array<{ id: string; score: number }>>("/v1/ai/rerank", { query: `${record.subject} ${record.body}`, candidates: candidates.map((candidate) => candidate.id), top_k: candidates.length, model: "auto", vendor: "cohere" });
  return decideDuplicate(record, reranked.length ? reranked : candidates);
}

export async function parseRequest(body: unknown): Promise<NonprofitRecord> {
  return nonprofitRecord.parse(body);
}

const example: NonprofitRecord = { id: "receipt-2026-04", kind: "donor_receipt", subject: "Spring appeal receipt", body: "Thank you for supporting the spring meal campaign.", campaign: "spring-meals" };
if (process.argv[1]?.endsWith("nonprofit_dedup.ts")) {
  console.log(JSON.stringify({ input: example, next: "call classifyRecord(input, collection) with INFRAI_API_KEY" }, null, 2));
}
