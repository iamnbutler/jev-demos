import { describe, expect, test } from "bun:test";
import type { JevResponse } from "../../../shared/api";
import { changedCoordinates, parseReviewDiff, reviewDecoration } from "./review-decoration";
import { REVIEW_HUNKS } from "./review-data";

describe("review source coordinates", () => {
  test("maps replacements to separate old/new coordinates without including context", () => {
    expect(changedCoordinates(REVIEW_HUNKS[1].diff)).toEqual({
      ranges: [
        { side: "deletions", start: 19, end: 19 },
        { side: "additions", start: 19, end: 19 },
      ],
      anchor: { side: "additions", line: 19 },
    });
  });

  test("keeps offset hunks and disjoint blocks in original file coordinates", () => {
    const diff = "@@ -70,4 +91,4 @@\n-a\n+b\n c\n-d\n+e\n f\n@@ -201 +225 @@\n-x\n+y";
    expect(changedCoordinates(diff).ranges).toEqual([
      { side: "deletions", start: 70, end: 70 },
      { side: "additions", start: 91, end: 91 },
      { side: "deletions", start: 72, end: 72 },
      { side: "additions", start: 93, end: 93 },
      { side: "deletions", start: 201, end: 201 },
      { side: "additions", start: 225, end: 225 },
    ]);
  });

  test("handles additions-only, deletions-only and no-newline markers", () => {
    expect(changedCoordinates(REVIEW_HUNKS[6].diff)).toEqual({
      ranges: [{ side: "additions", start: 52, end: 58 }],
      anchor: { side: "additions", line: 58 },
    });
    expect(changedCoordinates("@@ -14,2 +13,0 @@\n-a\n-b\n\\ No newline at end of file")).toEqual({
      ranges: [{ side: "deletions", start: 14, end: 15 }],
      anchor: { side: "deletions", line: 15 },
    });
  });

  test("rejects mismatched headers instead of displaying wrong line evidence", () => {
    expect(() => changedCoordinates("@@ -12,2 +12 @@\n-a\n+b")).toThrow("line counts");
    expect(() => changedCoordinates("+a")).toThrow("header");
  });

  test("all supplied hunks parse as partial metadata with correct file-side bounds", () => {
    for (const hunk of REVIEW_HUNKS) {
      const { ranges } = changedCoordinates(hunk.diff);
      const parsed = parseReviewDiff(hunk);
      expect(parsed.name).toBe(hunk.path);
      expect(parsed.isPartial).toBe(true);
      for (const range of ranges) {
        const count = parsed.hunks[0];
        const start = range.side === "additions" ? count.additionStart : count.deletionStart;
        const length = range.side === "additions" ? count.additionCount : count.deletionCount;
        expect(range.start).toBeGreaterThanOrEqual(start);
        expect(range.end).toBeLessThan(start + length);
      }
    }
  });
});

test("decoration requires returned probabilities and selected lenses above threshold", () => {
  const hunk = REVIEW_HUNKS[1];
  const response: JevResponse = {
    model: "test fixture",
    usage: { input_tokens: 0, output_tokens: 0 },
    meta: {
      requestId: "test",
      providerMs: 0,
      totalMs: 0,
      cached: false,
      questionCount: 3,
      at: "test",
    },
    answers: {
      hunk_retry_role_behavior: { type: "noul", noul: 0.9 },
      hunk_retry_role_permissions: { type: "noul", noul: 0.97 },
      hunk_retry_role_weaker_tests: { type: "noul", noul: 0.03 },
    },
  };
  expect(reviewDecoration(hunk, null, ["behavior"], 0.65).marks).toEqual([]);
  const result = reviewDecoration(hunk, response, ["behavior", "permissions"], 0.65);
  expect(result.marks).toEqual([
    { side: "deletions", start: 19, end: 19, tone: "purple" },
    { side: "additions", start: 19, end: 19, tone: "purple" },
  ]);
  expect(result.active.map((item) => item.id)).toEqual(["permissions", "behavior"]);
  expect(reviewDecoration(hunk, response, ["weaker_tests"], 0.65).marks).toEqual([]);
  expect(reviewDecoration(hunk, response, ["error_handling"], 0.65).unknown).toBe(true);
  expect(reviewDecoration(hunk, response, [], 0.65).marks).toEqual([]);
});
