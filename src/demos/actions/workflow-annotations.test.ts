import { expect, test } from "bun:test";
import type { JevResponse } from "../../../shared/api";
import { compareWorkflow, effectiveFacts, parseWorkflow } from "./analysis";
import { WORKFLOW_SCENES } from "./data";
import { workflowAnnotations } from "./workflow-annotations";

test("workflow differences retain exact candidate coordinates after inserted lines", () => {
  const yaml = "# new heading\n# another line\n" + WORKFLOW_SCENES[0].yaml;
  const parsed = parseWorkflow(yaml);
  const observations = compareWorkflow(parsed);
  const items = workflowAnnotations(yaml, parsed, observations, effectiveFacts(parsed), null);
  expect(items.length).toBe(observations.length);
  for (const item of items) {
    expect(item.line).toBe(item.observation!.candidate.line);
    expect(item.kind).toBe("exact");
    expect(item.probability).toBeUndefined();
  }
  const checkout = items.find((item) => item.title.includes("actions/checkout"))!;
  expect(yaml.split("\n")[checkout.line - 1]).toContain("actions/checkout@v3");
  const script = items.find((item) => item.id.startsWith("bun-script:"))!;
  expect(yaml.split("\n")[script.line - 1]).toContain("npm run test");
});

test("missing or stale model responses never produce invented probabilities", () => {
  const yaml = WORKFLOW_SCENES[0].yaml;
  const parsed = parseWorkflow(yaml);
  const response: JevResponse = {
    model: "test fixture",
    usage: { input_tokens: 0, output_tokens: 0 },
    meta: {
      requestId: "test",
      providerMs: 0,
      totalMs: 0,
      cached: false,
      questionCount: 2,
      at: "test",
    },
    answers: {
      intent_mismatch: { type: "noul", noul: 0.91 },
      documented_exception: { type: "noul", noul: 0.07 },
    },
  };
  const items = workflowAnnotations(yaml, parsed, [], effectiveFacts(parsed), response);
  expect(items.find((item) => item.id === "intent_mismatch")).toMatchObject({
    line: 0,
    probability: 0.91,
  });
  const exception = items.find((item) => item.id === "documented_exception")!;
  expect(yaml.split("\n")[exception.line - 1]).toContain("node-version");
  expect(items.some((item) => item.id === "reusable_setup")).toBe(false);
  expect(workflowAnnotations(yaml, parsed, [], effectiveFacts(parsed), null)).toEqual([]);
});

test("parser errors suppress model notes and retain reported source positions", () => {
  const yaml = WORKFLOW_SCENES[3].yaml;
  const parsed = parseWorkflow(yaml);
  const items = workflowAnnotations(yaml, parsed, [], [], null);
  expect(items.length).toBeGreaterThan(0);
  expect(items[0].line).toBe(parsed.errors[0].line);
  expect(items[0].kind).toBe("parse");
  expect(items[0].title).toContain(`${parsed.errors[0].line}:${parsed.errors[0].column}`);
});

test("a diagnostic beyond the rendered source remains file-level, never on a fabricated line", () => {
  const parsed = parseWorkflow("on: push\n");
  parsed.errors = [{ line: 8, column: 1, message: "Unexpected end" }];
  expect(workflowAnnotations("on: push\n", parsed, [], [], null)[0]).toMatchObject({
    line: 0,
    title: "YAML error · line 8:1",
  });
});
