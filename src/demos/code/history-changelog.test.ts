import { describe, expect, test } from "bun:test";
import type { JevResponse } from "../../../shared/api";
import { HISTORY_COMMITS } from "./history-data";
import {
  buildChangelogRequest,
  canceledCommitIds,
  changelogContext,
  groupChangelog,
  parseWrittenChangelog,
  type ChangelogGroup,
  type WrittenChangelog,
} from "./history-changelog";

describe("changelog evidence boundary", () => {
  test("only the selected revision's commits enter the first pass", () => {
    const commits = HISTORY_COMMITS.slice(0, 12);
    const request = buildChangelogRequest(commits);
    expect(Object.keys(request.questions)).toHaveLength(60);
    expect(JSON.stringify(request)).not.toContain(HISTORY_COMMITS[20].sha);
    expect((request.state as { commits: unknown[] }).commits).toHaveLength(12);
  });
  test("omits both sides of an explicit revert pair only once the revert is in the range", () => {
    const before = HISTORY_COMMITS.slice(0, 23);
    expect(canceledCommitIds(before).has("c21")).toBe(false);
    const after = canceledCommitIds(HISTORY_COMMITS);
    expect(after.has("c21")).toBe(true);
    expect(after.has("c24")).toBe(true);
    expect(after.size).toBe(6);
  });
  test("low-confidence and missing categories remain in Needs review", () => {
    const response = {
      answers: { changelog_c01: { type: "choice", choice: "behavior", confidence: 0.49 } },
    } as unknown as JevResponse;
    expect(groupChangelog(HISTORY_COMMITS.slice(0, 2), response, false)).toEqual([
      { category: "uncertain", commits: HISTORY_COMMITS.slice(0, 2) },
    ]);
  });
  const groups: ChangelogGroup[] = [
    { category: "behavior", commits: [HISTORY_COMMITS[0]] },
    { category: "tests", commits: [HISTORY_COMMITS[3]] },
  ];
  const valid: WrittenChangelog = {
    sections: [
      {
        category: "behavior",
        entries: [{ text: "Cap requested page sizes.", commits: [HISTORY_COMMITS[0].sha] }],
      },
      {
        category: "tests",
        entries: [{ text: "Cover page-size limits.", commits: [HISTORY_COMMITS[3].sha] }],
      },
    ],
  };
  test("writer handoff preserves diffs and categories", () => {
    const handoff = changelogContext(groups, "Preview", []);
    expect(handoff.groups[0].commits[0].diff).toBe(HISTORY_COMMITS[0].diff);
    expect(handoff.groups[0].category).toBe("behavior");
    expect(parseWrittenChangelog(JSON.stringify(valid), groups)).toEqual(valid);
  });
  test("rejects invented, excluded, or cross-category citations", () => {
    for (const sha of ["invented", HISTORY_COMMITS[20].sha, HISTORY_COMMITS[3].sha]) {
      const changed = structuredClone(valid);
      changed.sections[0].entries[0].commits = [sha];
      expect(() => parseWrittenChangelog(JSON.stringify(changed), groups)).toThrow(
        "valid source commits",
      );
    }
  });
  test("rejects missing commits, omitted categories, and duplicate categories", () => {
    expect(() =>
      parseWrittenChangelog(JSON.stringify({ sections: [valid.sections[0]] }), groups),
    ).toThrow();
    expect(() =>
      parseWrittenChangelog(
        JSON.stringify({ sections: [valid.sections[0], valid.sections[0]] }),
        groups,
      ),
    ).toThrow();
    const expanded: ChangelogGroup[] = [
      { category: "behavior", commits: HISTORY_COMMITS.slice(0, 2) },
      groups[1],
    ];
    expect(() => parseWrittenChangelog(JSON.stringify(valid), expanded)).toThrow(
      "omitted source commits",
    );
  });
});
