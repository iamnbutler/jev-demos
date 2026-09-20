import { describe, expect, test } from "bun:test";
import type { JevResponse } from "../../../shared/api";
import type { ContextTurn } from "./context-data";
import {
  buildContextRequest,
  countCharacters,
  estimateTokens,
  readContextJudgments,
  renderContext,
  selectContext,
} from "./context";

const turns: ContextTurn[] = [
  {
    id: "rule",
    title: "Rule",
    kind: "instruction",
    protected: true,
    messages: [{ id: "u", role: "user", body: "Keep the public contract." }],
  },
  {
    id: "pair",
    title: "Evidence",
    kind: "exchange",
    messages: [
      { id: "c", role: "assistant", toolCallId: "call-1", body: "Run the focused test." },
      {
        id: "r",
        role: "tool",
        toolCallId: "call-1",
        body: "Assertion failed: cancellation threw.",
      },
    ],
  },
  {
    id: "note",
    title: "Old read",
    kind: "note",
    messages: [{ id: "n", role: "assistant", body: "This is a duplicate read." }],
  },
];

const task = "Finish cancellation.";
const base = { turns, task, budgetTokens: 1000, pinnedIds: new Set<string>(), judgments: {} };

describe("context budget and source preservation", () => {
  test("counts Unicode code points rather than double-counting supplementary characters", () => {
    expect(countCharacters("a🧭é")).toBe(3);
    expect(estimateTokens("🧭🧭🧭")).toBe(1);
  });
  test("keeps explicit constraints before inference and leaves missing judgments unassessed", () => {
    const result = selectContext(base);
    expect(result.retained.map((turn) => turn.id)).toEqual(["rule"]);
    expect(result.reasons.pair).toBe("unassessed");
    expect(result.archived).toHaveLength(2);
  });

  test("counts the exact assembled text, including separators and objective, at the budget boundary", () => {
    const exactBudget = estimateTokens(renderContext(task, turns.slice(0, 2)));
    const judgments = { pair: { relevant: 0.9, essential: 0.8 } };
    const fits = selectContext({ ...base, budgetTokens: exactBudget, judgments });
    expect(fits.retained.map((turn) => turn.id)).toEqual(["rule", "pair"]);
    expect(fits.characters).toBe(fits.text.length);
    expect(fits.estimatedTokens).toBe(Math.ceil(fits.characters / 4));
    expect(fits.overBudget).toBe(false);
    const misses = selectContext({ ...base, budgetTokens: exactBudget - 1, judgments });
    expect(misses.retained.map((turn) => turn.id)).toEqual(["rule"]);
    expect(misses.reasons.pair).toBe("budget");
  });

  test("never splits a tool call and result to squeeze into a cap", () => {
    const callOnly: ContextTurn = { ...turns[1]!, messages: turns[1]!.messages.slice(0, 1) };
    const budgetTokens = estimateTokens(renderContext(task, [turns[0]!, callOnly]));
    const result = selectContext({
      ...base,
      budgetTokens,
      judgments: { pair: { relevant: 1, essential: 1 } },
    });
    expect(result.retained.map((turn) => turn.id)).toEqual(["rule"]);
    expect(result.archived.find((turn) => turn.id === "pair")?.messages).toHaveLength(2);
  });

  test("reports an honest overflow when mandatory material cannot fit", () => {
    const result = selectContext({ ...base, budgetTokens: 1, pinnedIds: new Set(["pair"]) });
    expect(result.retained.map((turn) => turn.id)).toEqual(["rule", "pair"]);
    expect(result.overBudget).toBe(true);
    expect(result.estimatedTokens).toBe(result.protectedTokens);
    expect(result.reasons.pair).toBe("pinned");
  });

  test("unpinning restores model selection and does not mutate the original source", () => {
    const original = JSON.stringify(turns);
    const pinned = selectContext({ ...base, pinnedIds: new Set(["pair"]) });
    const unpinned = selectContext(base);
    expect(pinned.retained).toHaveLength(2);
    expect(unpinned.retained).toHaveLength(1);
    expect(JSON.stringify(turns)).toBe(original);
  });

  test("does not treat one missing primitive or low probabilities as adequate evidence", () => {
    const result = selectContext({
      ...base,
      judgments: { pair: { relevant: 0.95 }, note: { relevant: 0.1, essential: 0.1 } },
    });
    expect(result.reasons.pair).toBe("unassessed");
    expect(result.reasons.note).toBe("low-signal");
    expect(result.retained).toHaveLength(1);
  });

  test("uses source order in the final context even when model priority is reversed", () => {
    const result = selectContext({
      ...base,
      judgments: { pair: { relevant: 0.7, essential: 0.7 }, note: { relevant: 1, essential: 1 } },
    });
    expect(result.retained.map((turn) => turn.id)).toEqual(["rule", "pair", "note"]);
  });

  test("changing only the budget leaves the inference request unchanged", () => {
    const first = buildContextRequest(task, turns);
    selectContext({ ...base, budgetTokens: 100 });
    const second = buildContextRequest(task, turns);
    expect(second).toEqual(first);
    expect(Object.keys(first.questions)).toHaveLength(turns.length * 2);
  });

  test("malformed or missing model outputs remain unknown", () => {
    const response = {
      answers: {
        relevant_pair: { type: "noul", noul: NaN },
        essential_pair: { type: "noul", noul: 0.8 },
      },
    } as unknown as JevResponse;
    const parsed = readContextJudgments(response, turns);
    expect(parsed.pair?.relevant).toBeUndefined();
    expect(parsed.pair?.essential).toBe(0.8);
    expect(parsed.note?.relevant).toBeUndefined();
  });
});
