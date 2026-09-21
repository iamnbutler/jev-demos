import type { JevResponse } from "../../../shared/api";
import type { SourceTone } from "../../components/DiffView";
import type { Observation, ParsedWorkflow, WorkflowFact } from "./analysis";

export type WorkflowInlineItem = {
  id: string;
  line: number;
  kind: "exact" | "parse" | "judgment";
  title: string;
  detail: string;
  tone: SourceTone;
  observation?: Observation;
  probability?: number;
};

export function workflowAnnotations(
  yaml: string,
  parsed: ParsedWorkflow,
  observations: Observation[],
  facts: WorkflowFact[],
  response: JevResponse | null,
): WorkflowInlineItem[] {
  const lineCount = yaml.replace(/\r?\n$/, "").split(/\r?\n/).length;
  const sourceLine = (line: number) =>
    Number.isInteger(line) && line > 0 && line <= lineCount ? line : 0;
  const factLine = (fact: WorkflowFact | undefined) => {
    const location = fact?.inheritedAt ?? fact;
    return location?.file === parsed.file ? sourceLine(location.line) : 0;
  };
  if (parsed.errors.length)
    return parsed.errors.slice(0, 3).map((error, index) => ({
      id: `parse-${index}`,
      line: sourceLine(error.line),
      kind: "parse",
      title: `YAML error · line ${error.line}:${error.column}`,
      detail: error.message,
      tone: "red",
    }));

  const items: WorkflowInlineItem[] = observations.map((observation) => ({
    id: observation.id,
    line: observation.candidate.file === parsed.file ? sourceLine(observation.candidate.line) : 0,
    kind: "exact",
    title: observation.title,
    detail: observation.detail,
    tone:
      observation.id.startsWith("bun-script:") || observation.id.startsWith("unknown-script:")
        ? "red"
        : "amber",
    observation,
  }));

  function judgment(
    id: string,
    line: number,
    title: string,
    detail: string,
    tone: (value: number) => SourceTone,
  ) {
    const answer = response?.answers[id];
    if (
      answer?.type !== "noul" ||
      !Number.isFinite(answer.noul) ||
      answer.noul < 0 ||
      answer.noul > 1
    )
      return;
    items.push({
      id,
      line,
      kind: "judgment",
      title,
      detail,
      probability: answer.noul,
      tone: tone(answer.noul),
    });
  }

  judgment(
    "intent_mismatch",
    0,
    "Misses the stated intent",
    "Workflow-wide judgment against the intent, scripts, and supplied repository. It does not identify a particular failing line.",
    (value) => (value >= 0.65 ? "red" : value >= 0.35 ? "amber" : "blue"),
  );
  const node = facts.find((fact) => fact.kind === "runtime" && fact.key === "Node");
  if (node)
    judgment(
      "documented_exception",
      factLine(node),
      "Publishing exception applies",
      "Workflow-wide judgment anchored at the Node declaration. The documented exception covers Node/npm publishing, not ordinary validation.",
      (value) => (value >= 0.65 ? "blue" : "neutral"),
    );
  const setup =
    facts.find((fact) => fact.kind === "local-action") ??
    facts.find((fact) => fact.kind === "install") ??
    facts.find((fact) => fact.kind === "runtime");
  judgment(
    "reusable_setup",
    factLine(setup),
    "Shared setup fits",
    "Workflow-wide judgment about whether .github/actions/setup-project covers the package setup responsibilities. Additional publishing steps may still be required.",
    (value) => (value >= 0.65 ? "blue" : "neutral"),
  );
  const permission = facts.find(
    (fact) => fact.kind === "permission" && (fact.value === "write" || fact.value === "write-all"),
  );
  if (permission)
    judgment(
      "expanded_permissions_justified",
      factLine(permission),
      "Write scopes are justified",
      "Workflow-wide judgment about all declared write scopes, anchored at the first write permission. This is not an execution result.",
      (value) => (value < 0.35 ? "amber" : "blue"),
    );
  return items.sort(
    (a, b) => a.line - b.line || Number(a.kind === "judgment") - Number(b.kind === "judgment"),
  );
}
