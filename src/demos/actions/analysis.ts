import { isMap, isScalar, LineCounter, parseDocument } from "yaml";
import type { JevRequest, Questions } from "../../../shared/api";
import { CANDIDATE_PATH, REPOSITORY_FILES, REPOSITORY_NAME, WORKFLOW_SCENES } from "./data";
import type { RepositoryFile } from "./data";

export type FactKind = "action" | "local-action" | "runtime" | "install" | "permission" | "script";
export type SourceLocation = { file: string; line: number; value: string };
export type WorkflowFact = SourceLocation & {
  kind: FactKind;
  key: string;
  job: string;
  expression: boolean;
  inheritedAt?: SourceLocation;
};
export type ParseIssue = { message: string; line: number; column: number };
export type ParsedWorkflow = {
  file: string;
  name: string;
  jobs: string[];
  triggers: string[];
  facts: WorkflowFact[];
  errors: ParseIssue[];
};
export type Observation = {
  id: string;
  category: "refs" | "toolchain" | "permissions" | "coverage";
  title: string;
  detail: string;
  candidate: SourceLocation;
  references: SourceLocation[];
  unresolved?: boolean;
};

type PlainMap = Record<string, unknown>;
const isRecord = (value: unknown): value is PlainMap =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const asString = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
const isExpression = (value: string) => value.includes("${{");
const runtimeActions: Record<string, { runtime: string; input: string }> = {
  "actions/setup-node": { runtime: "Node", input: "node-version" },
  "oven-sh/setup-bun": { runtime: "Bun", input: "bun-version" },
  "actions/setup-python": { runtime: "Python", input: "python-version" },
  "denoland/setup-deno": { runtime: "Deno", input: "deno-version" },
};

export function parseWorkflow(
  content: string,
  file = CANDIDATE_PATH,
  composite = false,
): ParsedWorkflow {
  const result: ParsedWorkflow = {
    file,
    name: file,
    jobs: [],
    triggers: [],
    facts: [],
    errors: [],
  };
  if (content.length > 80_000) {
    result.errors.push({
      message: "This demo accepts workflow files up to 80,000 characters.",
      line: 1,
      column: 1,
    });
    return result;
  }
  const lineCounter = new LineCounter();
  const document = parseDocument(content, { lineCounter, prettyErrors: false, uniqueKeys: true });
  for (const error of document.errors) {
    const position = lineCounter.linePos(error.pos[0]);
    result.errors.push({ message: error.message, line: position.line, column: position.col });
  }
  if (result.errors.length) return result;
  if (!isMap(document.contents)) {
    result.errors.push({
      message: "Expected a YAML mapping at the top level.",
      line: 1,
      column: 1,
    });
    return result;
  }
  let value: unknown;
  try {
    value = document.toJS({ maxAliasCount: 50 });
  } catch {
    result.errors.push({ message: "Could not safely resolve YAML aliases.", line: 1, column: 1 });
    return result;
  }
  if (!isRecord(value)) return result;
  const lineAt = (path: (string | number)[]) => {
    // A resolved alias may not expose child AST nodes. In that case, cite
    // its use site rather than pretending the declaration came from line 1.
    for (let length = path.length; length > 0; length--) {
      const node = document.getIn(path.slice(0, length), true);
      if (node && typeof node === "object" && "range" in node && Array.isArray(node.range)) {
        return lineCounter.linePos(node.range[0] as number).line;
      }
    }
    return 1;
  };
  const add = (
    kind: FactKind,
    key: string,
    raw: unknown,
    path: (string | number)[],
    job = "workflow",
    lineOffset = 0,
  ) => {
    const text = asString(raw);
    if (!text) return;
    result.facts.push({
      kind,
      key,
      value: text,
      file,
      line: lineAt(path) + lineOffset,
      job,
      expression: isExpression(text),
    });
  };
  const permissions = (raw: unknown, path: (string | number)[], job = "workflow") => {
    if (typeof raw === "string") add("permission", "all", raw, path, job);
    else if (isRecord(raw)) {
      if (!Object.keys(raw).length) add("permission", "all", "none (empty mapping)", path, job);
      for (const [key, permission] of Object.entries(raw))
        add("permission", key, permission, [...path, key], job);
    }
  };
  const steps = (raw: unknown, path: (string | number)[], job: string) => {
    if (!Array.isArray(raw)) return;
    raw.forEach((step, index) => {
      if (!isRecord(step)) return;
      const base = [...path, index];
      const uses = asString(step.uses);
      if (uses.startsWith("./")) {
        add("local-action", uses, uses, [...base, "uses"], job);
      } else if (uses) {
        const split = uses.lastIndexOf("@");
        const action = split > -1 ? uses.slice(0, split) : uses;
        const ref = split > -1 ? uses.slice(split + 1) : "(no ref declared)";
        add("action", action, ref, [...base, "uses"], job);
        const runtime = runtimeActions[action.toLowerCase()];
        if (runtime && isRecord(step.with))
          add(
            "runtime",
            runtime.runtime,
            step.with[runtime.input],
            [...base, "with", runtime.input],
            job,
          );
      }
      const run = asString(step.run);
      if (!run) return;
      const node = document.getIn([...base, "run"], true);
      const blockOffset =
        isScalar(node) && (node.type === "BLOCK_LITERAL" || node.type === "BLOCK_FOLDED") ? 1 : 0;
      run.split("\n").forEach((commandLine, offset) => {
        // Deliberately a small command recognizer, not a shell interpreter.
        for (const fragment of commandLine.split(/\s+&&\s+/)) {
          const command = fragment.trim();
          if (!command || command.startsWith("#")) continue;
          if (/^(?:bun|npm|pnpm|yarn)\s+(?:install|ci|i)\b/.test(command)) {
            add("install", "dependencies", command, [...base, "run"], job, blockOffset + offset);
          }
          const script = command.match(
            /^(?:bun|npm|pnpm|yarn)\s+run(?:-script)?\s+([\w:.-]+)(?=\s|$)/,
          );
          if (script)
            add("script", script[1], command, [...base, "run"], job, blockOffset + offset);
        }
      });
    });
  };

  result.name = asString(value.name) || file;
  if (composite) {
    if (!isRecord(value.runs) || value.runs.using !== "composite") {
      result.errors.push({
        message: "Expected a composite action with runs.using: composite.",
        line: lineAt(["runs"]),
        column: 1,
      });
      return result;
    }
    steps(value.runs.steps, ["runs", "steps"], "composite");
    return result;
  }
  if (!isRecord(value.jobs) || Object.keys(value.jobs).length === 0) {
    result.errors.push({
      message: "Expected at least one job under a jobs mapping.",
      line: lineAt(["jobs"]),
      column: 1,
    });
  }
  if (typeof value.on === "string") result.triggers = [value.on];
  else if (Array.isArray(value.on))
    result.triggers = value.on.filter((entry): entry is string => typeof entry === "string");
  else if (isRecord(value.on)) result.triggers = Object.keys(value.on);
  else
    result.errors.push({
      message: "Expected an on trigger declaration.",
      line: lineAt(["on"]),
      column: 1,
    });
  if (result.errors.length) return result;
  permissions(value.permissions, ["permissions"]);
  for (const [job, raw] of Object.entries(value.jobs as PlainMap)) {
    result.jobs.push(job);
    if (!isRecord(raw)) {
      result.errors.push({
        message: `Job ${job} must be a mapping.`,
        line: lineAt(["jobs", job]),
        column: 1,
      });
      continue;
    }
    permissions(raw.permissions, ["jobs", job, "permissions"], job);
    if (typeof raw.uses === "string") {
      if (raw.uses.startsWith("./"))
        add("local-action", raw.uses, raw.uses, ["jobs", job, "uses"], job);
      else {
        const split = raw.uses.lastIndexOf("@");
        add(
          "action",
          split > -1 ? raw.uses.slice(0, split) : raw.uses,
          split > -1 ? raw.uses.slice(split + 1) : "(no ref declared)",
          ["jobs", job, "uses"],
          job,
        );
      }
    }
    steps(raw.steps, ["jobs", job, "steps"], job);
  }
  return result;
}

export function effectiveFacts(
  parsed: ParsedWorkflow,
  files: RepositoryFile[] = REPOSITORY_FILES,
): WorkflowFact[] {
  const expanded = [...parsed.facts];
  const visit = (fact: WorkflowFact, visited: Set<string>, depth: number) => {
    if (fact.kind !== "local-action" || !fact.key.startsWith("./") || depth > 4) return;
    const directory = fact.key.slice(2).replace(/\/$/, "");
    const local = files.find(
      (file) =>
        file.kind === "action" &&
        (file.path === `${directory}/action.yml` || file.path === `${directory}/action.yaml`),
    );
    if (!local || visited.has(local.path)) return;
    const next = new Set([...visited, local.path]);
    const action = parseWorkflow(local.content, local.path, true);
    for (const inherited of action.facts) {
      const copy = {
        ...inherited,
        job: fact.job,
        inheritedAt: fact.inheritedAt ?? { file: fact.file, line: fact.line, value: fact.value },
      };
      expanded.push(copy);
      visit(copy, next, depth + 1);
    }
  };
  for (const fact of parsed.facts) visit(fact, new Set(), 0);
  return expanded;
}

export function repositoryInventories(files: RepositoryFile[] = REPOSITORY_FILES) {
  return files
    .filter((file) => file.kind === "workflow")
    .map((file) => {
      const parsed = parseWorkflow(file.content, file.path);
      return { file, parsed, facts: effectiveFacts(parsed, files) };
    });
}

const location = (fact: WorkflowFact): SourceLocation => ({
  file: fact.file,
  line: fact.line,
  value: fact.value,
});
const uniqueLocations = (facts: SourceLocation[]) =>
  facts.filter(
    (fact, index) =>
      facts.findIndex(
        (other) =>
          other.file === fact.file && other.line === fact.line && other.value === fact.value,
      ) === index,
  );

function manifestScripts(files: RepositoryFile[]): Record<string, SourceLocation> {
  const manifest = files.find((file) => file.path === "package.json");
  if (!manifest) return {};
  try {
    const json: unknown = JSON.parse(manifest.content);
    if (!isRecord(json) || !isRecord(json.scripts)) return {};
    return Object.fromEntries(
      Object.entries(json.scripts)
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => {
          const line =
            manifest.content.split("\n").findIndex((text) => text.includes(`"${key}"`)) + 1;
          return [key, { file: manifest.path, line: Math.max(1, line), value: String(value) }];
        }),
    );
  } catch {
    return {};
  }
}

export function compareWorkflow(
  parsed: ParsedWorkflow,
  files: RepositoryFile[] = REPOSITORY_FILES,
): Observation[] {
  if (parsed.errors.length) return [];
  const candidateFacts = effectiveFacts(parsed, files);
  const peers = repositoryInventories(files);
  const peerFacts = peers.flatMap((peer) => peer.facts);
  const observations: Observation[] = [];
  for (const fact of candidateFacts) {
    if (fact.kind === "script" || fact.kind === "local-action") continue;
    const matches = peerFacts.filter((other) => other.kind === fact.kind && other.key === fact.key);
    const values = [...new Set(matches.map((other) => other.value))];
    if (values.includes(fact.value)) continue;
    const references = uniqueLocations(matches.map(location));
    const category =
      fact.kind === "action" ? "refs" : fact.kind === "permission" ? "permissions" : "toolchain";
    const title =
      fact.kind === "action"
        ? `${fact.key} ref ${values.length ? "differs" : "is new here"}`
        : fact.kind === "runtime"
          ? `${fact.key} version ${fact.expression ? "needs resolution" : "differs"}`
          : fact.kind === "permission"
            ? `${fact.key} permission differs`
            : "Dependency install differs";
    observations.push({
      id: `${fact.kind}:${fact.key}:${fact.job}:${fact.line}`,
      category,
      title,
      detail: fact.expression
        ? `“${fact.value}” is an expression. This demo keeps its literal value; it does not resolve matrix or event context.`
        : values.length
          ? `Candidate declares “${fact.value}”; the supplied repository declares ${values.map((value) => `“${value}”`).join(" or ")}. This is a difference, not a failure verdict.`
          : `“${fact.value}” has no matching declaration in the supplied workflows. The repository bundle may not be exhaustive.`,
      candidate: fact.inheritedAt ?? location(fact),
      references,
      unresolved: fact.expression,
    });
  }

  const scripts = manifestScripts(files);
  for (const fact of candidateFacts.filter((item) => item.kind === "script")) {
    const script = scripts[fact.key];
    if (!script) {
      observations.push({
        id: `unknown-script:${fact.job}:${fact.key}`,
        category: "coverage",
        title: `No supplied script named ${fact.key}`,
        detail: `The candidate invokes “${fact.key}”, but that script is absent from the supplied package.json. Workspace packages and generated scripts are not inspected.`,
        candidate: location(fact),
        references: [],
      });
      continue;
    }
    if (/(?:^|[;&|]\s*)bun\s/.test(script.value)) {
      const hasBun = candidateFacts.some(
        (other) =>
          other.job === fact.job && other.kind === "action" && other.key === "oven-sh/setup-bun",
      );
      if (!hasBun)
        observations.push({
          id: `bun-script:${fact.job}:${fact.key}`,
          category: "toolchain",
          title: `“${fact.key}” invokes Bun without declared setup`,
          detail:
            "This job calls a package script that invokes Bun, but no Bun setup action is declared in the supplied job or resolved local actions. The actual runner environment is unknown.",
          candidate: location(fact),
          references: [script],
        });
    }
  }
  for (const fact of candidateFacts.filter(
    (item) => item.kind === "local-action" && item.key.startsWith("./"),
  )) {
    const path = fact.key.slice(2).replace(/\/$/, "");
    if (
      files.some(
        (file) =>
          file.path === `${path}/action.yml` ||
          file.path === `${path}/action.yaml` ||
          file.path === path,
      )
    )
      continue;
    observations.push({
      id: `missing-local:${fact.job}:${fact.key}`,
      category: "refs",
      title: "Local action source is not supplied",
      detail: `The bundle has no source for “${fact.key}”. Its setup, inputs, and side effects cannot be inspected here.`,
      candidate: location(fact),
      references: [],
      unresolved: true,
    });
  }
  return observations.filter(
    (observation, index) =>
      observations.findIndex((other) => other.id === observation.id) === index,
  );
}

export function scriptCoverage(
  candidate: ParsedWorkflow,
  baseline: ParsedWorkflow,
  files: RepositoryFile[] = REPOSITORY_FILES,
) {
  const candidateScripts = new Set(
    effectiveFacts(candidate, files)
      .filter((fact) => fact.kind === "script")
      .map((fact) => fact.key),
  );
  return effectiveFacts(baseline, files)
    .filter((fact) => fact.kind === "script")
    .filter((fact, index, all) => all.findIndex((other) => other.key === fact.key) === index)
    .map((fact) => ({ ...fact, included: candidateScripts.has(fact.key) }));
}

export const PEER_QUESTION_IDS: Record<string, string> = {
  ".github/workflows/ci.yml": "peer_ci",
  ".github/workflows/docs.yml": "peer_docs",
  ".github/workflows/preview.yml": "peer_preview",
  ".github/workflows/publish.yml": "peer_publish",
};

export function buildActionsRequest(
  yaml = WORKFLOW_SCENES[0].yaml,
  purpose = WORKFLOW_SCENES[0].purpose,
  files: RepositoryFile[] = REPOSITORY_FILES,
): JevRequest {
  const parsed = parseWorkflow(yaml);
  if (parsed.errors.length)
    throw new Error("Resolve the YAML parsing error before semantic analysis.");
  const inventories = repositoryInventories(files);
  const facts = effectiveFacts(parsed, files);
  const questions: Questions = {
    candidate_role: {
      type: "choice",
      instructions:
        "Classify what the candidate YAML actually does, using its trigger and commands. Prefer actual implementation over its declared purpose. Choose one supplied role.",
      criteria: {
        validation: "Lint, typecheck, or test a proposed code change without publishing.",
        publish: "Publish a package to a registry.",
        documentation: "Build or validate documentation as its main purpose.",
        package_build: "Compile or bundle a package without registry publishing.",
        other: "A mixed, ambiguous, unsupported, or other purpose.",
      },
    },
    documented_exception: {
      type: "noul",
      instructions:
        "The candidate actually uses the specific Node/npm publishing exception documented in CONTRIBUTING.md for its intended publishing purpose. Answer false if it only uses a different runtime for ordinary checks, or if no publishing exception is needed. Judge the supplied policy and commands; do not invent other exceptions.",
    },
    reusable_setup: {
      type: "noul",
      instructions:
        "The supplied .github/actions/setup-project/action.yml is suitable for the dependency installation and package-toolchain work this candidate needs. It is suitable if already correctly used. Assess only those setup responsibilities: the action is not expected to replace additional publishing-specific setup or test/build commands. Do not assume unavailable inputs or capabilities.",
    },
    intent_mismatch: {
      type: "noul",
      instructions:
        "The candidate YAML misses or contradicts at least one concrete requirement in candidate.purpose, judged against the supplied commands, scripts, local action, and repository conventions. Differences with unrelated workflows alone do not establish a mismatch. Do not infer hidden runner settings, latest versions, or actual execution results.",
    },
  };
  for (const inventory of inventories) {
    const key = PEER_QUESTION_IDS[inventory.file.path];
    if (!key) continue;
    questions[key] = {
      type: "noul",
      instructions: `The workflow at ${inventory.file.path} performs a sufficiently similar main job to the candidate's declared purpose that its runtime, install, and required-command conventions are a meaningful comparison baseline. Shared syntax or a shared checkout action alone is not enough. Compare intended responsibilities, and preserve deliberate publishing versus validation distinctions.`,
    };
  }
  if (
    facts.some(
      (fact) =>
        fact.kind === "permission" && (fact.value === "write" || fact.value === "write-all"),
    )
  ) {
    questions.expanded_permissions_justified = {
      type: "noul",
      instructions:
        "Every explicitly declared write permission in the candidate has a specific need supported by its actual commands and supplied repository policy. Do not assume a write permission is justified merely because it appears in YAML. Judge stated intent and supplied evidence; this is not an effective-permissions or security audit.",
    };
  }
  return {
    tag: "actions-workflows",
    cache: false,
    state: {
      material:
        "Authored synthetic repository used for an interactive research demo. No workflows have been executed.",
      repository: {
        name: REPOSITORY_NAME,
        files: files.map(({ path, kind, purpose: filePurpose, content }) => ({
          path,
          kind,
          purpose: filePurpose,
          content,
        })),
      },
      candidate: {
        path: CANDIDATE_PATH,
        purpose,
        yaml,
        parsed: { name: parsed.name, jobs: parsed.jobs, triggers: parsed.triggers },
        facts,
      },
      literalDifferences: compareWorkflow(parsed, files),
      limits:
        "Exact action references and runtime versions are compared as declared strings. No latest-version lookup, remote resolution, shell execution, or permission/environment evaluation occurs. The command recognizer handles straightforward install and run-script lines. Missing external context stays unknown.",
    },
    questions,
  };
}
