import { useCallback, useEffect, useRef, useState } from "react";
import type { ChoiceAnswer, JevRequest, JevResponse, ScoreAnswer } from "../../shared/api";

export type Evaluation = {
  data: JevResponse | null;
  loading: boolean;
  error: string | null;
  request: JevRequest | null;
  run: (request: JevRequest) => Promise<JevResponse | null>;
  reset: () => void;
};

export async function evaluate(input: JevRequest, signal?: AbortSignal): Promise<JevResponse> {
  const started = performance.now();
  const response = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(190000)])
      : AbortSignal.timeout(190000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "The evaluation could not be completed.");
  const result = body as JevResponse;
  return { ...result, meta: { ...result.meta, totalMs: Math.round(performance.now() - started) } };
}

export function useEvaluation(): Evaluation {
  const [data, setData] = useState<JevResponse | null>(null);
  const [request, setRequest] = useState<JevRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      sequence.current++;
      controller.current?.abort();
    },
    [],
  );

  const reset = useCallback(() => {
    sequence.current++;
    controller.current?.abort();
    setData(null);
    setRequest(null);
    setError(null);
    setLoading(false);
  }, []);

  const run = useCallback(async (input: JevRequest) => {
    controller.current?.abort();
    const current = ++sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    const submitted = { ...input, cache: input.cache ?? false };
    setData(null);
    setError(null);
    setRequest(structuredClone(submitted));
    setLoading(true);
    try {
      const result = await evaluate(submitted, abort.signal);
      if (current !== sequence.current) return null;
      setData(result);
      return result;
    } catch (err) {
      if (current === sequence.current && !abort.signal.aborted)
        setError(err instanceof Error ? err.message : "The evaluation could not be completed.");
      return null;
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, []);

  return { data, request, loading, error, run, reset };
}

export function getNoul(data: JevResponse | null, key: string): number | undefined {
  const answer = data?.answers[key];
  return answer?.type === "noul" ? answer.noul : undefined;
}
export function getChoice(data: JevResponse | null, key: string): ChoiceAnswer | undefined {
  const answer = data?.answers[key];
  return answer?.type === "choice" ? answer : undefined;
}
export function getScore(data: JevResponse | null, key: string): ScoreAnswer | undefined {
  const answer = data?.answers[key];
  return answer?.type === "score" ? answer : undefined;
}
