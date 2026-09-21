import { describe, expect, test } from "bun:test";
import type { JevRequest, JevResponse } from "../../../shared/api";
import { extractFunctions } from "./build-semantic-corpus";
import { CORPUS_REPOSITORIES, type SearchCorpus, type SearchFunction } from "./semantic-corpus";
import {
  buildSemanticSearchRequest,
  createSearchBatches,
  mergeSearchAnswers,
  prioritizeCandidates,
  rankSearchFunctions,
  SEARCH_BATCH_SIZE,
  SEARCH_STATE_LIMIT,
  SemanticSearchSession,
} from "./semantic-search";

const scope = { provenance: "Authored source fixtures for deterministic tests only." };

function candidates(count: number): SearchFunction[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `test_${index}`,
    name: `function${index}`,
    path: `src/file-${index}.ts`,
    startLine: 1,
    endLine: 3,
    code: `function function${index}(value: string) {\n  return value.toUpperCase();\n}`,
    repository: "test/fixture",
    revision: "fixture",
    sourceUrl: null,
    licenseUrl: null,
    kind: "function",
    imports: [],
  }));
}

function response(request: JevRequest, probability = 0.8): JevResponse {
  return {
    model: "test-only-jev",
    answers: Object.fromEntries(
      Object.keys(request.questions).map((key) => [key, { type: "noul", noul: probability }]),
    ),
    usage: { input_tokens: 1, output_tokens: 1 },
    meta: {
      requestId: "test-only",
      providerMs: 42,
      totalMs: 45,
      cached: false,
      questionCount: Object.keys(request.questions).length,
      at: "2026-09-20T12:00:00Z",
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function controlledEvaluator() {
  const calls: {
    request: JevRequest;
    signal: AbortSignal;
    resolve: (value: JevResponse) => void;
    reject: (reason: Error) => void;
  }[] = [];
  const evaluate = (request: JevRequest, signal: AbortSignal) => {
    const pending = deferred<JevResponse>();
    calls.push({ request, signal, resolve: pending.resolve, reject: pending.reject });
    // Deliberately ignores abort so epoch guards, not transport behavior, are under test.
    return pending.promise;
  };
  return { calls, evaluate };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("semantic corpus and request boundaries", () => {
  test("AST extraction preserves exact complete lines and avoids overlapping nested functions", () => {
    const source = [
      "/* Copyright (c) Test Authors — MIT */",
      'import { external } from "./external";',
      "export function process(input: string) {",
      "  function normalize(value: string) {",
      "    return value.trim().toLowerCase();",
      "  }",
      "  return external(normalize(input));",
      "}",
      "export const close = async (connection: Connection) => {",
      "  await connection.stopAcceptingRequests();",
      "  return connection.close();",
      "};",
    ].join("\n");
    const found = extractFunctions(source, "src/example.ts", CORPUS_REPOSITORIES[0]);
    expect(found.map((fn) => fn.name)).toEqual(["process", "close"]);
    expect(found[0].startLine).toBe(3);
    expect(found[0].endLine).toBe(8);
    expect(found[0].code).toBe(source.split("\n").slice(2, 8).join("\n"));
    expect(found[0].sourceUrl).toEndWith("/src/example.ts#L3-L8");
    expect(found[0].notice).toContain("Copyright (c) Test Authors");
    expect(found[1].code).toStartWith("export const close =");
    expect(found[1].imports).toEqual(['import { external } from "./external";']);
  });

  test("stored corpus has 500+ unique real excerpts, pinned links, and complete notices", async () => {
    const corpus = (await Bun.file(
      new URL("../../../public/semantic-search/corpus.json", import.meta.url),
    ).json()) as SearchCorpus;
    expect(corpus.functions.length).toBeGreaterThanOrEqual(500);
    expect(corpus.repositories).toHaveLength(3);
    expect(new Set(corpus.functions.map((fn) => fn.id)).size).toBe(corpus.functions.length);
    expect(new Set(corpus.functions.map((fn) => fn.code.replace(/\s+/g, " ").trim())).size).toBe(
      corpus.functions.length,
    );
    for (const fn of corpus.functions) {
      expect(fn.revision).toMatch(/^[a-f0-9]{40}$/);
      expect(fn.sourceUrl).toBe(
        `https://github.com/${fn.repository}/blob/${fn.revision}/${fn.path}#L${fn.startLine}-L${fn.endLine}`,
      );
      expect(fn.code.split("\n")).toHaveLength(fn.endLine - fn.startLine + 1);
      expect(fn.code.length).toBeLessThanOrEqual(8_000);
    }
    for (const repository of corpus.repositories) {
      const license = await Bun.file(
        new URL(`../../../public${repository.localLicense}`, import.meta.url),
      ).text();
      expect(license).toContain("MIT License");
      expect(license).toContain("Copyright (c)");
      expect(license).toContain("Permission is hereby granted");
    }
  });

  test("batches obey count and source-size limits, retain all candidates and exact source", () => {
    const functions = candidates(60).map((fn) => ({
      ...fn,
      code: `${fn.code}\n// ${"x".repeat(2_000)}`,
    }));
    const batches = createSearchBatches("Find uppercase conversions", functions, scope);
    expect(batches.length).toBeGreaterThan(3);
    expect(new Set(batches.flatMap((batch) => batch.candidateIds)).size).toBe(60);
    for (const batch of batches) {
      expect(batch.candidateIds.length).toBeLessThanOrEqual(SEARCH_BATCH_SIZE);
      expect(JSON.stringify(batch.request.state).length).toBeLessThanOrEqual(SEARCH_STATE_LIMIT);
      expect(Object.keys(batch.request.questions)).toEqual(
        batch.candidateIds.map((id) => `function_${id}`),
      );
      expect(batch.request.cache).toBe(false);
      for (const fn of (batch.request.state as { functions: SearchFunction[] }).functions)
        expect(fn.code).toBe(functions.find((candidate) => candidate.id === fn.id)!.code);
    }
  });

  test("queueing never pre-filters and oversized edits are rejected rather than truncated", () => {
    const functions = candidates(3);
    functions[2].code += "\n// path traversal";
    expect(prioritizeCandidates(functions, "path traversal").map((fn) => fn.id)).toEqual([
      "test_2",
      "test_0",
      "test_1",
    ]);
    expect(() => createSearchBatches("find path", [functions[0], functions[0]], scope)).toThrow(
      "distinct IDs",
    );
    expect(() =>
      createSearchBatches("find path", [{ ...functions[0], code: "x".repeat(50_000) }], scope),
    ).toThrow("too large");
  });

  test("missing, foreign, NaN, and out-of-range answers cannot become scores", () => {
    const request = buildSemanticSearchRequest("find functions", candidates(6), scope);
    const result = response(request);
    result.answers.function_test_0 = { type: "noul", noul: 0 };
    result.answers.function_test_1 = { type: "noul", noul: NaN };
    result.answers.function_test_2 = { type: "noul", noul: 1.1 };
    delete result.answers.function_test_3;
    result.answers.function_foreign = { type: "noul", noul: 1 };
    const merged = mergeSearchAnswers(
      {},
      candidates(6).map((fn) => fn.id),
      result,
    );
    expect(merged.scores).toEqual({ test_0: 0, test_4: 0.8, test_5: 0.8 });
    expect(
      rankSearchFunctions(candidates(6), merged.scores, "find functions").map((row) => row.fn.id),
    ).toEqual(["test_4", "test_5", "test_0", "test_1", "test_2", "test_3"]);
  });
});

describe("real-response streaming state machine (mock transport)", () => {
  test("bounds concurrency and publishes out-of-order arrivals before earlier batches finish", async () => {
    const transport = controlledEvaluator();
    let now = 0;
    const session = new SemanticSearchSession(transport.evaluate, 4, () => now);
    const finished = session.start("find functions", candidates(100), scope);
    expect(transport.calls).toHaveLength(4);
    expect(session.getSnapshot().scores).toEqual({});
    now = 42;
    transport.calls[1].resolve(response(transport.calls[1].request, 0.8));
    await flush();
    expect(transport.calls).toHaveLength(5);
    expect(session.getSnapshot().active).toBe(4);
    expect(Object.keys(session.getSnapshot().scores)).toHaveLength(24);
    expect(session.getSnapshot().firstResultMs).toBe(42);
    expect(session.getSnapshot().movements.test_24).toBe("new");
    transport.calls[2].resolve(response(transport.calls[2].request, 0.95));
    await flush();
    expect(session.getSnapshot().movements.test_24).toBe(-24);
    expect(session.getSnapshot().scores.test_0).toBeUndefined();
    for (const index of [4, 3, 0])
      transport.calls[index].resolve(response(transport.calls[index].request, 0.1));
    await finished;
    expect(session.getSnapshot().status).toBe("complete");
    expect(Object.keys(session.getSnapshot().scores)).toHaveLength(100);
    expect(
      session.getSnapshot().attempts.every((attempt) => attempt.response && attempt.request),
    ).toBe(true);
    expect(session.getSnapshot().active).toBe(0);
  });

  test("stop/resume keeps accepted batches, ignores old arrivals, and excludes paused time", async () => {
    const transport = controlledEvaluator();
    let now = 0;
    const session = new SemanticSearchSession(transport.evaluate, 2, () => now);
    const original = session.start("find functions", candidates(50), scope);
    now = 20;
    transport.calls[0].resolve(response(transport.calls[0].request, 0.3));
    await flush();
    expect(transport.calls).toHaveLength(3);
    now = 30;
    session.stop();
    expect(session.getSnapshot().status).toBe("paused");
    expect(transport.calls[1].signal.aborted).toBe(true);
    expect(Object.keys(session.getSnapshot().scores)).toHaveLength(24);
    now = 1030;
    const resumed = session.resume();
    expect(transport.calls).toHaveLength(5);
    for (const index of [1, 2])
      transport.calls[index].resolve(response(transport.calls[index].request, 0.99));
    await original;
    expect(Object.keys(session.getSnapshot().scores)).toHaveLength(24);
    now = 1040;
    for (const index of [3, 4])
      transport.calls[index].resolve(response(transport.calls[index].request, 0.6));
    await resumed;
    expect(session.getSnapshot().status).toBe("complete");
    expect(session.getSnapshot().elapsedMs).toBe(40);
    expect(session.getSnapshot().scores.test_0).toBe(0.3);
    expect(session.getSnapshot().scores.test_24).toBe(0.6);
    expect(
      session.getSnapshot().attempts.filter((attempt) => attempt.status === "cancelled"),
    ).toHaveLength(2);
  });

  test("new input supersedes old responses even when candidate IDs are reused", async () => {
    const transport = controlledEvaluator();
    const session = new SemanticSearchSession(transport.evaluate);
    const oldRun = session.start("old query", candidates(2), scope);
    const newRun = session.start("new query", candidates(2), scope);
    transport.calls[0].resolve(response(transport.calls[0].request, 0.99));
    await oldRun;
    expect(session.getSnapshot().scores).toEqual({});
    expect(session.getSnapshot().query).toBe("new query");
    transport.calls[1].resolve(response(transport.calls[1].request, 0.12));
    await newRun;
    expect(session.getSnapshot().scores.test_0).toBe(0.12);
    const resetRun = session.start("reset me", candidates(2), scope);
    session.reset();
    transport.calls[2].resolve(response(transport.calls[2].request, 0.99));
    await resetRun;
    expect(session.getSnapshot().status).toBe("idle");
    expect(session.getSnapshot().attempts).toEqual([]);
  });

  test("failed or partial batches remain unknown and are the only batches retried", async () => {
    const transport = controlledEvaluator();
    const session = new SemanticSearchSession(transport.evaluate, 2);
    const first = session.start("find functions", candidates(26), scope);
    transport.calls[0].resolve(response(transport.calls[0].request, 0.4));
    transport.calls[1].reject(new Error("Provider unavailable"));
    await first;
    expect(session.getSnapshot().status).toBe("incomplete");
    expect(Object.keys(session.getSnapshot().scores)).toHaveLength(24);
    expect(session.getSnapshot().attempts[1].error).toBe("Provider unavailable");
    const retry = session.resume();
    expect(transport.calls).toHaveLength(3);
    const partial = response(transport.calls[2].request, 0.6);
    delete partial.answers.function_test_25;
    transport.calls[2].resolve(partial);
    await retry;
    expect(session.getSnapshot().status).toBe("incomplete");
    expect(session.getSnapshot().scores.test_25).toBeUndefined();
    expect(session.getSnapshot().scores.test_24).toBe(0.6);
    expect(session.getSnapshot().attempts[2].response).toBe(partial);
    const final = session.resume();
    transport.calls[3].resolve(response(transport.calls[3].request, 0.7));
    await final;
    expect(session.getSnapshot().status).toBe("complete");
    expect(session.getSnapshot().scores.test_0).toBe(0.4);
    expect(session.getSnapshot().scoreAttempts.test_25).toBe("attempt-4");
  });

  test("dispose aborts requests and prevents further emissions after unmount", async () => {
    const transport = controlledEvaluator();
    const session = new SemanticSearchSession(transport.evaluate);
    let emissions = 0;
    session.subscribe(() => emissions++);
    const run = session.start("find functions", candidates(2), scope);
    const before = emissions;
    session.dispose();
    expect(transport.calls[0].signal.aborted).toBe(true);
    transport.calls[0].resolve(response(transport.calls[0].request));
    await run;
    expect(emissions).toBe(before);
    expect(session.getSnapshot().scores).toEqual({});
  });
});
