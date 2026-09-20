import { describe, expect, test } from "bun:test";
import type { JevResponse } from "../../../shared/api";
import { RUN_TRACES, type RunTrace } from "./replay-data";
import {
  buildReplayRequest,
  checkpointLabel,
  readReplayJudgment,
  replayEventEvidence,
  summarizeReplay,
  type ReplayAssessment,
  type ReplayJudgment,
} from "./replay";

const trace = RUN_TRACES[0]!;
const response = { answers: {} } as JevResponse;

function assessment(index: number, judgment: ReplayJudgment): ReplayAssessment {
  return { index, judgment, request: buildReplayRequest(trace, index), response };
}

describe("prefix-only run assessments", () => {
  test("never includes a future event or scenario outcome labels in an earlier request", () => {
    const altered: RunTrace = {
      ...trace,
      title: "HIDDEN FINAL OUTCOME",
      subtitle: "HIDDEN FINAL OUTCOME",
      events: trace.events.map((event, index) => ({
        ...event,
        title: "EDITORIAL RESULT HINT",
        body: index > 2 ? "FUTURE_SECRET_SENTINEL" : event.body,
      })),
    };
    const request = buildReplayRequest(altered, 2);
    const serialized = JSON.stringify(request.state);
    expect(serialized).not.toContain("FUTURE_SECRET_SENTINEL");
    expect(serialized).not.toContain("HIDDEN FINAL OUTCOME");
    expect(serialized).not.toContain("EDITORIAL RESULT HINT");
    expect(request.state).toEqual(
      expect.objectContaining({
        priorEvents: trace.events.slice(0, 2).map(replayEventEvidence),
        currentEvent: replayEventEvidence(trace.events[2]!),
        visibleEventCount: 3,
      }),
    );
  });

  test("first event has no prior history and invalid playheads are rejected", () => {
    expect(buildReplayRequest(trace, 0).state).toEqual(
      expect.objectContaining({ priorEvents: [] }),
    );
    expect(() => buildReplayRequest(trace, -1)).toThrow(RangeError);
    expect(() => buildReplayRequest(trace, 1.5)).toThrow(RangeError);
    expect(() => buildReplayRequest(trace, trace.events.length)).toThrow(RangeError);
  });

  test("preserves successful process status and failed assertion body as distinct input evidence", () => {
    const conflictTrace = RUN_TRACES.find((item) => item.id === "exit-zero")!;
    const event = conflictTrace.events[4]!;
    const request = buildReplayRequest(conflictTrace, 4);
    expect(event.exitCode).toBe(0);
    expect(event.body).toContain("AssertionError");
    expect(request.state).toEqual(
      expect.objectContaining({ currentEvent: replayEventEvidence(event) }),
    );
  });

  test("earlier summaries cannot use later judgments", () => {
    const results = {
      2: assessment(2, { newEvidence: 0.9 }),
      4: assessment(4, { contradiction: 0.95, replan: 0.9 }),
      5: assessment(5, { repetition: 0.9 }),
    };
    expect(summarizeReplay(results, 2)).toEqual({
      assessed: 1,
      evidenceSignals: 1,
      repetitionSignals: 0,
      conflictSignals: 0,
      replanSignals: 0,
      possibleStall: false,
      latestReplanIndex: undefined,
    });
    expect(summarizeReplay(results, 4).latestReplanIndex).toBe(4);
  });

  test("stall aggregation requires two strong repeat signals in the last three actual events", () => {
    const results = {
      1: assessment(1, { repetition: 0.99 }),
      4: assessment(4, { repetition: 0.8 }),
      5: assessment(5, { repetition: 0.75 }),
    };
    expect(summarizeReplay(results, 4).possibleStall).toBe(false);
    expect(summarizeReplay(results, 5).possibleStall).toBe(true);
    expect(summarizeReplay(results, 8).possibleStall).toBe(false);
  });

  test("missing answers do not become reassuring zero probabilities", () => {
    expect(readReplayJudgment(response)).toEqual({});
    expect(checkpointLabel(undefined).text).toBe("Not evaluated");
    expect(checkpointLabel({}).text).toBe("Not evaluated");
    expect(checkpointLabel({ contradiction: 0 }).text).toBe("Partial evaluation");
    expect(
      checkpointLabel({ newEvidence: 0, repetition: 0, contradiction: 0, replan: 0 }).text,
    ).toBe("No strong signal");
    expect(checkpointLabel({ contradiction: 0.9, newEvidence: 0.9 }).text).toBe("Inspect conflict");
  });
});
