import { describe, expect, test } from "bun:test";
import type { JevResponse } from "../../../shared/api";
import {
  commitsAtRevision,
  keywordTerms,
  lexicalMatches,
  rankFunctions,
  readProbability,
  reversedPatches,
  strongestProbability,
} from "./analysis";
import { HISTORY_COMMITS } from "./history-data";
import type { SourceFunction } from "./source-data";

function response(answers: JevResponse["answers"]): JevResponse {
  return {
    answers,
    model: "test",
    usage: { input_tokens: 0, output_tokens: 0 },
    meta: {
      requestId: "test",
      providerMs: 0,
      totalMs: 0,
      cached: false,
      questionCount: Object.keys(answers).length,
      at: "",
    },
  };
}

describe("code search ranking and unknown assessments", () => {
  const functions: SourceFunction[] = [
    { id: "absent", name: "isHomeowner", path: "a.ts", startLine: 1, code: "return true;" },
    {
      id: "zero",
      name: "requireOwner",
      path: "b.ts",
      startLine: 1,
      code: 'throw new Error("owner required");',
    },
    { id: "positive", name: "findOwner", path: "c.ts", startLine: 1, code: "return owner;" },
  ];

  test("missing and invalid probabilities stay unknown; known zero stays zero", () => {
    const result = response({
      function_zero: { type: "noul", noul: 0 },
      invalid: { type: "noul", noul: 1.2 },
      nan: { type: "noul", noul: Number.NaN },
    });
    expect(readProbability(result, "function_absent")).toBeUndefined();
    expect(readProbability(result, "function_zero")).toBe(0);
    expect(readProbability(result, "invalid")).toBeUndefined();
    expect(readProbability(result, "nan")).toBeUndefined();
    expect(strongestProbability([undefined, undefined])).toBeUndefined();
    expect(strongestProbability([undefined, 0])).toBe(0);
  });

  test("semantic sorting places known zero above unknown and preserves the input list", () => {
    const result = response({
      function_zero: { type: "noul", noul: 0 },
      function_positive: { type: "noul", noul: 0.8 },
    });
    expect(rankFunctions(functions, "owner", result, "semantic").map((row) => row.fn.id)).toEqual([
      "positive",
      "zero",
      "absent",
    ]);
    expect(functions.map((fn) => fn.id)).toEqual(["absent", "zero", "positive"]);
  });

  test("keyword baseline uses unique whole words and camel-case boundaries without semantic stemming", () => {
    expect(keywordTerms("The owner and the Owner")).toEqual(["owner"]);
    expect(lexicalMatches(functions[0], "owner")).toEqual([]);
    expect(lexicalMatches(functions[1], "owner")).toEqual(["owner"]);
    expect(lexicalMatches(functions[1], "ownership")).toEqual([]);
  });
});

describe("exact prepared history membership", () => {
  test("a revision includes its head and excludes all later commits", () => {
    const included = commitsAtRevision(HISTORY_COMMITS, "c12");
    expect(included.map((commit) => commit.id)).toEqual(
      HISTORY_COMMITS.slice(0, 12).map((commit) => commit.id),
    );
    expect(included.some((commit) => commit.id === "c13")).toBe(false);
    expect(commitsAtRevision(HISTORY_COMMITS, "not-a-revision")).toEqual([]);
  });

  test("reversals only apply once their undo commit exists in the selected prefix", () => {
    const before = reversedPatches(commitsAtRevision(HISTORY_COMMITS, "c11"));
    const after = reversedPatches(commitsAtRevision(HISTORY_COMMITS, "c12"));
    const latest = reversedPatches(commitsAtRevision(HISTORY_COMMITS, "c24"));
    expect(before.has("c09")).toBe(false);
    expect(after.get("c09")?.id).toBe("c12");
    expect(after.has("c16")).toBe(false);
    expect(latest.get("c16")?.id).toBe("c18");
    expect(latest.get("c21")?.id).toBe("c24");
    expect(commitsAtRevision(HISTORY_COMMITS, "c12").some((commit) => commit.id === "c09")).toBe(
      true,
    );
  });

  test("an invalid reversal cannot invent an earlier member of the chain", () => {
    const reversal = { ...HISTORY_COMMITS[11], reverts: "c24" };
    expect(reversedPatches([HISTORY_COMMITS[0], reversal]).size).toBe(0);
  });
});
