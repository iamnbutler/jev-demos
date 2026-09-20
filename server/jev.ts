import { createHash, randomUUID } from "node:crypto";
import type { Answer, JevRequest, JevResponse, Question } from "../shared/api";
import { config } from "./config";
import { ServiceError } from "./validation";

const cache = new Map<string, JevResponse>();
const inflight = new Map<string, Promise<JevResponse>>();
const TTL = 30 * 60 * 1000;
const MAX_CACHE = 128;

function finiteProbability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validDistribution(value: unknown, keys: string[]): value is Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const probabilities = value as Record<string, unknown>;
  if (
    Object.keys(probabilities).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(probabilities, key))
  )
    return false;
  const values = Object.values(probabilities);
  if (!values.every(finiteProbability)) return false;
  // The API rounds probabilities. Allow a small rounding residual, not arbitrary weights.
  return Math.abs(values.reduce((sum, probability) => sum + probability, 0) - 1) <= 0.03;
}

export function isValidAnswer(answer: unknown, question: Question): answer is Answer {
  if (!answer || typeof answer !== "object") return false;
  const a = answer as Record<string, unknown>;
  if (a.type !== question.type) return false;
  if (a.type === "noul") return finiteProbability(a.noul);
  if (!finiteProbability(a.confidence)) return false;
  if (question.type === "choice")
    return (
      typeof a.choice === "string" &&
      Object.hasOwn(question.criteria, a.choice) &&
      validDistribution(a.probabilities, Object.keys(question.criteria))
    );
  if (
    question.type !== "score" ||
    typeof a.score !== "number" ||
    !Number.isFinite(a.score) ||
    a.score < 0 ||
    a.score > question.criteria.length - 1
  )
    return false;
  const keys = question.criteria.map((_, index) => String(index));
  return (
    validDistribution(a.probabilities, keys) &&
    Boolean(
      a.legend &&
      typeof a.legend === "object" &&
      keys.every((key) => typeof (a.legend as Record<string, unknown>)[key] === "string"),
    )
  );
}

async function callProvider(input: JevRequest): Promise<JevResponse> {
  if (!config.jevToken)
    throw new ServiceError(
      "Add JEV_TOKEN to .dev.vars, then restart the server to run live judgments.",
      503,
    );
  const started = performance.now();
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch("https://api.typesafe.ai/v1/systemone", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.jevToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.jevModel,
          state: input.state,
          questions: input.questions,
        }),
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      if (attempt === 2)
        throw new ServiceError("Jev could not be reached. Your input is still here; try again.");
      await Bun.sleep(500 * 2 ** attempt);
      continue;
    }
    if (![429, 502, 503, 529].includes(response.status) || attempt === 2) break;
    const retrySeconds = Number(response.headers.get("retry-after"));
    await Bun.sleep(Math.min(5000, retrySeconds > 0 ? retrySeconds * 1000 : 600 * 2 ** attempt));
  }
  if (!response?.ok) {
    const status = response?.status;
    if (status === 401 || status === 403)
      throw new ServiceError(
        "Jev rejected the server credential. Check JEV_TOKEN in .dev.vars.",
        503,
      );
    if (status === 422 || status === 400)
      throw new ServiceError(
        "Jev rejected this question batch. Shorten the input or use fewer questions.",
        422,
      );
    throw new ServiceError(
      `Jev is temporarily unavailable${status ? ` (HTTP ${status})` : ""}. Try again.`,
      503,
    );
  }
  const providerMs = Math.round(performance.now() - started);
  let body: Record<string, unknown>;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new ServiceError("Jev returned an unreadable response. Try again.");
  }
  const answers = body.answers as Record<string, unknown> | undefined;
  if (
    !answers ||
    !Object.entries(input.questions).every(([key, q]) => isValidAnswer(answers[key], q))
  ) {
    throw new ServiceError(
      "Jev returned incomplete or invalid judgments. No partial result has been applied.",
    );
  }
  const usage = body.usage as { input_tokens?: number; output_tokens?: number } | undefined;
  return {
    model: typeof body.model === "string" ? body.model : config.jevModel,
    answers: answers as JevResponse["answers"],
    usage: { input_tokens: usage?.input_tokens ?? 0, output_tokens: usage?.output_tokens ?? 0 },
    meta: {
      requestId: randomUUID(),
      providerMs,
      totalMs: Math.round(performance.now() - started),
      cached: false,
      questionCount: Object.keys(input.questions).length,
      at: new Date().toISOString(),
    },
  };
}

export async function evaluateJev(input: JevRequest): Promise<JevResponse> {
  const key = createHash("sha256")
    .update(
      JSON.stringify({ model: config.jevModel, state: input.state, questions: input.questions }),
    )
    .digest("hex");
  const previous = cache.get(key);
  if (input.cache !== false && previous && Date.now() - Date.parse(previous.meta.at) < TTL) {
    return { ...previous, meta: { ...previous.meta, cached: true, totalMs: 0 } };
  }
  const pending = inflight.get(key);
  if (pending && input.cache !== false) return pending;
  const promise = callProvider(input);
  inflight.set(key, promise);
  try {
    const result = await promise;
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
    return result;
  } finally {
    if (inflight.get(key) === promise) inflight.delete(key);
  }
}
