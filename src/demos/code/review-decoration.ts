import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";
import type { JevResponse } from "../../../shared/api";
import type { SourceMark, SourceTone } from "../../components/DiffView";
import { readProbability, reviewQuestionKey } from "./analysis";
import { REVIEW_LENSES, type ReviewHunk, type ReviewLensId } from "./review-data";

export type ChangedRange = {
  side: "additions" | "deletions";
  start: number;
  end: number;
};
export type HunkCoordinates = {
  ranges: ChangedRange[];
  anchor: { side: "additions" | "deletions"; line: number } | null;
};

export const LENS_TONES: Record<ReviewLensId, SourceTone> = {
  behavior: "blue",
  permissions: "purple",
  weaker_tests: "amber",
  error_handling: "red",
};

/** Preserve original one-based coordinates, including disjoint change blocks. */
export function changedCoordinates(diff: string): HunkCoordinates {
  const ranges: ChangedRange[] = [];
  let oldLine = 0;
  let newLine = 0;
  let expectedOld = 0;
  let expectedNew = 0;
  let usedOld = 0;
  let usedNew = 0;
  let inHunk = false;
  let previousIndex = -1;

  function validateCounts() {
    if (inHunk && (usedOld !== expectedOld || usedNew !== expectedNew))
      throw new Error("Unified diff line counts do not match its hunk header.");
  }

  for (const row of diff.split("\n")) {
    const header = row.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (header) {
      validateCounts();
      oldLine = Number(header[1]);
      newLine = Number(header[3]);
      expectedOld = Number(header[2] ?? 1);
      expectedNew = Number(header[4] ?? 1);
      usedOld = 0;
      usedNew = 0;
      inHunk = true;
      previousIndex = -1;
      continue;
    }
    if (!inHunk || row.startsWith("\\") || row === "") continue;
    if (row.startsWith(" ")) {
      oldLine++;
      newLine++;
      usedOld++;
      usedNew++;
      previousIndex = -1;
      continue;
    }
    const side = row.startsWith("+") ? "additions" : row.startsWith("-") ? "deletions" : null;
    if (!side) throw new Error("Invalid row in unified diff.");
    const line = side === "additions" ? newLine++ : oldLine++;
    if (side === "additions") usedNew++;
    else usedOld++;
    if (line < 1) throw new Error("Changed source coordinates must start at line one.");
    const previous = ranges[previousIndex];
    if (previous?.side === side && previous.end + 1 === line) previous.end = line;
    else {
      previousIndex = ranges.push({ side, start: line, end: line }) - 1;
    }
  }
  validateCounts();
  if (!inHunk) throw new Error("No unified diff hunk header was supplied.");
  const additions = ranges.filter((range) => range.side === "additions");
  const anchorRange = additions.at(-1) ?? ranges.at(-1);
  return {
    ranges,
    anchor: anchorRange ? { side: anchorRange.side, line: anchorRange.end } : null,
  };
}

export function parseReviewDiff(hunk: ReviewHunk): FileDiffMetadata {
  // This is deliberately a partial patch. No invented surrounding file lines.
  const patch = `diff --git a/${hunk.path} b/${hunk.path}\n--- a/${hunk.path}\n+++ b/${hunk.path}\n${hunk.diff}\n`;
  const diff = parsePatchFiles(patch, undefined, true)[0]?.files[0];
  if (!diff) throw new Error(`Could not parse review hunk ${hunk.id}.`);
  return diff;
}

export function reviewDecoration(
  hunk: ReviewHunk,
  response: JevResponse | null,
  selected: ReviewLensId[],
  threshold: number,
) {
  const coordinates = changedCoordinates(hunk.diff);
  const judgments = REVIEW_LENSES.map((lens) => ({
    ...lens,
    tone: LENS_TONES[lens.id],
    probability: readProbability(response, reviewQuestionKey(hunk.id, lens.id)),
    selected: selected.includes(lens.id),
  }));
  const active = judgments
    .filter(
      (item) => item.selected && item.probability !== undefined && item.probability >= threshold,
    )
    .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));
  const unknown = judgments.some((item) => item.selected && item.probability === undefined);
  // The model judges a hunk, not an individual line. Mark its actual changed
  // ranges with the strongest selected lens; list every selected score inline.
  const marks: SourceMark[] = active[0]
    ? coordinates.ranges.map((range) => ({ ...range, tone: active[0].tone }))
    : [];
  return { ...coordinates, judgments, active, unknown, matches: active.length > 0, marks };
}

export function rangeLabel(range: ChangedRange) {
  return `${range.side === "additions" ? "new" : "old"} L${range.start}${range.start === range.end ? "" : `–${range.end}`}`;
}
