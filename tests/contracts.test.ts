import { describe, expect, test } from "bun:test";
import { isValidAnswer } from "../server/jev";
import { evaluationSchema, isLocalRequest } from "../server/validation";
import { handleRequest } from "../server/app";
import { buildDuplicateRequest, relationshipFor } from "../src/demos/duplicates/analysis";
import { reports, draftPresets } from "../src/demos/duplicates/data";
import { buildDiscussionRequest, parseGeneratedThread } from "../src/demos/discussion/analysis";
import { threads } from "../src/demos/discussion/data";

describe("provider boundary", () => {
  test("validates probability and category membership rather than accepting arbitrary values", () => {
    expect(
      isValidAnswer({ type: "noul", noul: 0.7 }, { type: "noul", instructions: "Relevant?" }),
    ).toBe(true);
    expect(
      isValidAnswer({ type: "noul", noul: 2 }, { type: "noul", instructions: "Relevant?" }),
    ).toBe(false);
    expect(
      isValidAnswer({ type: "noul", noul: null }, { type: "noul", instructions: "Relevant?" }),
    ).toBe(false);
    expect(
      isValidAnswer(
        {
          type: "choice",
          choice: "invented",
          probabilities: { yes: 0.7, no: 0.3 },
          confidence: 0.4,
        },
        { type: "choice", instructions: "Matches?", criteria: { yes: "A match", no: "No match" } },
      ),
    ).toBe(false);
    expect(
      isValidAnswer(
        { type: "choice", choice: "yes", probabilities: { yes: 0.7 }, confidence: 0.4 },
        { type: "choice", instructions: "Matches?", criteria: { yes: "A match", no: "No match" } },
      ),
    ).toBe(false);
    expect(
      isValidAnswer(
        { type: "choice", choice: "yes", probabilities: { yes: 0.9, no: 0.9 }, confidence: 0.4 },
        { type: "choice", instructions: "Matches?", criteria: { yes: "A match", no: "No match" } },
      ),
    ).toBe(false);
    expect(
      isValidAnswer(
        { type: "score", score: 0.6, probabilities: {}, confidence: 0.4 },
        { type: "score", instructions: "Useful?", criteria: ["No", "Yes"] },
      ),
    ).toBe(false);
    expect(
      isValidAnswer(
        {
          type: "score",
          score: 0.6,
          probabilities: { "0": 0.4, "1": 0.6 },
          confidence: 0.2,
          legend: { "0": "No", "1": "Yes" },
        },
        { type: "score", instructions: "Useful?", criteria: ["No", "Yes"] },
      ),
    ).toBe(true);
  });
  test("rejects malformed questions and empty batches before calling providers", () => {
    expect(evaluationSchema.safeParse({ state: "x", questions: {} }).success).toBe(false);
    expect(
      evaluationSchema.safeParse({
        state: "x",
        questions: {
          q: { type: "choice", instructions: "Choose", criteria: { only: "one option" } },
        },
      }).success,
    ).toBe(false);
    expect(
      evaluationSchema.safeParse({
        state: "x",
        questions: { q: { type: "score", instructions: "Rate", criteria: ["low", "high"] } },
      }).success,
    ).toBe(true);
  });
  test("rejects cross-site requests and nonlocal Host values", () => {
    expect(
      isLocalRequest(
        new Request("http://localhost:4317/api/evaluate", {
          headers: { origin: "https://example.com" },
        }),
      ),
    ).toBe(false);
    expect(isLocalRequest(new Request("http://example.com:4317/api/health"))).toBe(false);
    expect(
      isLocalRequest(
        new Request("http://localhost:4318/api/evaluate", {
          headers: { origin: "http://localhost:4317" },
        }),
      ),
    ).toBe(true);
    expect(
      isLocalRequest(
        new Request("http://localhost:4317/api/evaluate", { headers: { origin: "null" } }),
      ),
    ).toBe(false);
  });
  test("health reveals configuration, never credentials", async () => {
    const response = await handleRequest(new Request("http://localhost:4317/api/health"));
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["anthropic", "jev", "openai"]);
    for (const provider of Object.values(body) as Record<string, unknown>[])
      expect(Object.keys(provider).sort()).toEqual(["configured", "model"]);
  });
  test("refuses secret files and malformed JSON without echoing input", async () => {
    for (const path of ["/.dev.vars", "/.env", "/%2Edev.vars", "/server/config.ts"]) {
      const response = await handleRequest(new Request(`http://localhost:4317${path}`));
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not found");
    }
    const response = await handleRequest(
      new Request("http://localhost:4317/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "private-content-with-invalid-json",
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("private-content");
  });
});

describe("evidence integrity", () => {
  test("compares every duplicate candidate and never sends preset labels or expected answers", () => {
    const request = buildDuplicateRequest(draftPresets[1]);
    expect(Object.keys(request.questions)).toHaveLength(reports.length * 3);
    expect((request.state as { draft: unknown }).draft).toEqual({
      title: draftPresets[1].title,
      body: draftPresets[1].body,
    });
    expect(relationshipFor(null, "184")).toBe("unassessed");
  });
  test("discussion cutoff excludes every later post from state and questions", () => {
    const request = buildDiscussionRequest(threads[0], 5);
    expect((request.state as { posts: unknown[] }).posts).toHaveLength(5);
    expect(Object.keys(request.questions)).toHaveLength(15);
    expect(JSON.stringify(request)).not.toContain(threads[0].posts[10].body);
    expect(request.questions.kind_p11).toBeUndefined();
  });
  test("new threads are validated and sorted chronologically before evaluation", () => {
    const thread = parseGeneratedThread(
      JSON.stringify({
        title: "Discussion",
        posts: [
          { author: "B", body: "Later observation", time: "2026-09-20T12:00:00Z" },
          { author: "A", body: "Earlier question", time: "2026-09-20T10:00:00Z" },
        ],
      }),
    );
    expect(thread.posts.map((p) => p.author)).toEqual(["A", "B"]);
    expect(() =>
      parseGeneratedThread(
        JSON.stringify({
          title: "Bad",
          posts: [{ author: "A", body: "text", time: "not a timestamp" }, {}],
        }),
      ),
    ).toThrow();
    expect(() => parseGeneratedThread('{"title":"Bad","posts":[]}')).toThrow();
  });
});
