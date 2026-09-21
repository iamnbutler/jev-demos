import type {
  GenerateRequest,
  GenerateResponse,
  GenerationProvider,
  JevRequest,
  JevResponse,
  Question,
} from "../shared/api";
import { buildActionsRequest } from "../src/demos/actions/analysis";
import { buildContextRequest } from "../src/demos/agents/context";
import { CONTEXT_TURNS, DEFAULT_CONTEXT_TASK } from "../src/demos/agents/context-data";
import { buildReplayRequest } from "../src/demos/agents/replay";
import { RUN_TRACES } from "../src/demos/agents/replay-data";
import { buildReviewRequest } from "../src/demos/code/analysis";
import {
  buildChangelogRequest,
  canceledCommitIds,
  changelogContext,
  groupChangelog,
  parseWrittenChangelog,
} from "../src/demos/code/history-changelog";
import { HISTORY_COMMITS, HISTORY_REVISIONS } from "../src/demos/code/history-data";
import { SEMANTIC_PRESETS, type SearchCorpus } from "../src/demos/code/semantic-corpus";
import { createSearchBatches, SEARCH_BATCH_SIZE } from "../src/demos/code/semantic-search";
import { SOURCE_FUNCTIONS } from "../src/demos/code/source-data";
import { buildDiscussionRequest } from "../src/demos/discussion/analysis";
import { buildDuplicateRequest } from "../src/demos/duplicates/analysis";

type ObjectValue = Record<string, unknown>;
type EvaluationResult = {
  name: string;
  model: string;
  answers: number;
  providerMs: number;
  totalMs: number;
  response: JevResponse;
};

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, label: string): ObjectValue {
  check(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object.`,
  );
  return value as ObjectValue;
}

function finite(value: unknown, label: string, maximum = Infinity): asserts value is number {
  check(
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum,
    `${label} is not a finite number in range.`,
  );
}

function nonempty(value: unknown, label: string): asserts value is string {
  check(
    typeof value === "string" && value.trim().length > 0,
    `${label} must be a nonempty string.`,
  );
}

function exactKeys(value: ObjectValue, expected: string[], label: string) {
  check(
    Object.keys(value).length === expected.length &&
      expected.every((key) => Object.hasOwn(value, key)),
    `${label} keys do not match the request.`,
  );
}

function distribution(value: unknown, keys: string[], label: string) {
  const probabilities = object(value, label);
  exactKeys(probabilities, keys, label);
  let total = 0;
  for (const probability of Object.values(probabilities)) {
    finite(probability, label, 1);
    total += probability;
  }
  // The provider rounds probabilities; permit rounding, not arbitrary weights.
  check(
    Math.abs(total - 1) <= 0.03 + Number.EPSILON,
    `${label} does not sum to approximately one.`,
  );
}

function answer(value: unknown, question: Question, id: string) {
  const result = object(value, `Answer ${id}`);
  check(result.type === question.type, `Answer ${id} has the wrong primitive type.`);
  if (question.type === "noul") {
    finite(result.noul, `Answer ${id}.noul`, 1);
    return;
  }
  finite(result.confidence, `Answer ${id}.confidence`, 1);
  if (question.type === "choice") {
    check(
      typeof result.choice === "string" && Object.hasOwn(question.criteria, result.choice),
      `Answer ${id} chose an unavailable option.`,
    );
    distribution(
      result.probabilities,
      Object.keys(question.criteria),
      `Answer ${id}.probabilities`,
    );
    return;
  }
  finite(result.score, `Answer ${id}.score`, question.criteria.length - 1);
  const indices = question.criteria.map((_, index) => String(index));
  distribution(result.probabilities, indices, `Answer ${id}.probabilities`);
  const legend = object(result.legend, `Answer ${id}.legend`);
  exactKeys(legend, indices, `Answer ${id}.legend`);
  check(
    indices.every((index) => typeof legend[index] === "string"),
    `Answer ${id} has an invalid legend.`,
  );
}

function usage(value: unknown) {
  const counts = object(value, "Usage");
  for (const key of ["input_tokens", "output_tokens"]) {
    finite(counts[key], `Usage ${key}`);
    check(Number.isInteger(counts[key]), `Usage ${key} must be an integer.`);
  }
}

function validateEvaluation(value: unknown, request: JevRequest): JevResponse {
  const response = object(value, "Evaluation response");
  nonempty(response.model, "Model");
  const answers = object(response.answers, "Answers");
  const ids = Object.keys(request.questions);
  exactKeys(answers, ids, "Answers");
  for (const [id, question] of Object.entries(request.questions)) answer(answers[id], question, id);
  const meta = object(response.meta, "Evaluation metadata");
  check(meta.cached === false, "Expected an uncached provider response.");
  check(meta.questionCount === ids.length, "Reported question count does not match the request.");
  nonempty(meta.requestId, "Request ID");
  nonempty(meta.at, "Evaluation timestamp");
  check(Number.isFinite(Date.parse(meta.at)), "Evaluation timestamp is invalid.");
  finite(meta.providerMs, "Provider duration");
  finite(meta.totalMs, "Server duration");
  usage(response.usage);
  return response as JevResponse;
}

function baseUrl(): URL {
  let url: URL;
  try {
    url = new URL(process.env.DEMO_URL || "http://127.0.0.1:4317");
  } catch {
    throw new Error("DEMO_URL must be a valid HTTP(S) URL.");
  }
  check(["http:", "https:"].includes(url.protocol), "DEMO_URL must use HTTP(S).");
  check(
    !url.username && !url.password && !url.search && !url.hash,
    "DEMO_URL must not contain credentials, a query, or a fragment.",
  );
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}

async function jsonRequest(url: URL, body?: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(190000),
    });
  } catch {
    throw new Error("Request failed or timed out. Start bun dev, or check DEMO_URL.");
  }
  // Never print provider bodies, request content, or credential-bearing errors.
  check(response.ok, `HTTP ${response.status} from ${url.pathname}.`);
  try {
    return await response.json();
  } catch {
    throw new Error("The local server returned non-JSON content.");
  }
}

async function requests(): Promise<{ name: string; request: JevRequest }[]> {
  const corpus: SearchCorpus = await Bun.file(
    new URL("../public/semantic-search/corpus.json", import.meta.url),
  ).json();
  check(corpus.schema === 1 && Array.isArray(corpus.functions), "Invalid public search corpus.");
  nonempty(corpus.provenance, "Public corpus provenance");
  // Exercise the demo's real batching/builder on at most 24 public excerpts.
  // Neither queue nor evaluate the rest of the 2,414-function corpus here.
  const batch = createSearchBatches(
    SEMANTIC_PRESETS[0].query,
    corpus.functions.slice(0, SEARCH_BATCH_SIZE),
    { provenance: corpus.provenance },
  )[0];
  check(batch && batch.candidateIds.length > 0, "The public corpus needs a search batch.");
  const trace = RUN_TRACES[0];
  const checkpoint = trace.events.findIndex(
    (event) => event.kind === "tool" && event.exitCode === 1,
  );
  check(checkpoint >= 0, "The replay fixture needs a failed tool-event checkpoint.");
  return [
    { name: "Workflows", request: buildActionsRequest() },
    { name: "Semantic", request: batch.request },
    { name: "Review", request: buildReviewRequest() },
    { name: "Duplicates", request: buildDuplicateRequest() },
    { name: "Discussion", request: buildDiscussionRequest() },
    { name: "History", request: buildChangelogRequest(HISTORY_COMMITS) },
    { name: "Context", request: buildContextRequest(DEFAULT_CONTEXT_TASK, CONTEXT_TURNS) },
    { name: "Replay", request: buildReplayRequest(trace, checkpoint) },
  ];
}

async function evaluate(base: URL, name: string, request: JevRequest): Promise<EvaluationResult> {
  const input = { ...request, cache: false };
  const started = performance.now();
  const result = validateEvaluation(await jsonRequest(new URL("api/evaluate", base), input), input);
  return {
    name,
    model: result.model,
    answers: Object.keys(result.answers).length,
    providerMs: result.meta.providerMs,
    totalMs: Math.round(performance.now() - started),
    response: result,
  };
}

async function generate(base: URL, input: GenerateRequest): Promise<GenerateResponse> {
  const result = object(await jsonRequest(new URL("api/generate", base), input), "Writer response");
  check(result.provider === input.provider, "Writer response names the wrong provider.");
  nonempty(result.model, "Writer model");
  nonempty(result.text, "Draft text");
  finite(result.durationMs, "Writer duration");
  usage(result.usage);
  return result as GenerateResponse;
}

async function writer(base: URL, provider: GenerationProvider): Promise<GenerateResponse> {
  const input: GenerateRequest = {
    provider,
    task: "code-query",
    prompt:
      "Write one short semantic search question about error recovery in these fictional snippets. Describe behavior without using function names.",
    context: {
      provenance: "Authored synthetic source snippets.",
      functions: SOURCE_FUNCTIONS.slice(0, 2),
    },
  };
  return generate(base, input);
}

async function changelogWriter(base: URL, history: JevResponse) {
  const canceled = canceledCommitIds(HISTORY_COMMITS);
  const excluded = HISTORY_COMMITS.filter((commit) => canceled.has(commit.id));
  const groups = groupChangelog(HISTORY_COMMITS, history, true);
  const revision = HISTORY_REVISIONS.find(
    (item) => item.lastCommitId === HISTORY_COMMITS.at(-1)?.id,
  );
  check(revision && groups.length, "The History response needs a matching revision and groups.");
  const result = await generate(base, {
    provider: "anthropic",
    task: "changelog",
    prompt:
      "Write an organized changelog from these Jev-classified patches. Preserve every category and cite every included commit. Return the requested JSON only.",
    context: changelogContext(groups, revision.label, excluded),
  });
  // The same parser as the UI checks category preservation, complete coverage,
  // exact commit citations, and exclusion of canceled/cross-category commits.
  const written = parseWrittenChangelog(result.text, groups);
  const citations = new Set(
    written.sections.flatMap((section) => section.entries.flatMap((entry) => entry.commits)),
  );
  return {
    model: result.model,
    durationMs: result.durationMs,
    categories: written.sections.length,
    commits: citations.size,
    excluded: excluded.length,
  };
}

async function main() {
  const args = new Set(Bun.argv.slice(2));
  if (args.has("--help")) {
    console.log(
      "Usage: bun scripts/live-check.ts [--writers]\nDEMO_URL defaults to http://127.0.0.1:4317.\nRuns eight uncached evaluations: one bounded public-source search batch plus authored demo inputs.\n--writers also checks configured OpenAI/Claude query writers and the Jev → Haiku changelog handoff, reusing the History evaluation.",
    );
    return;
  }
  check(
    [...args].every((arg) => arg === "--writers"),
    "Supported option: --writers. Use --help for usage.",
  );
  const base = baseUrl();
  const cases = await requests();
  console.log(
    `Live integration checks · ${base.origin}${base.pathname} · public source + authored inputs`,
  );
  console.log("Checks response contracts and timing; no expected model judgments.");
  const results = await Promise.allSettled(
    cases.map((item) => evaluate(base, item.name, item.request)),
  );
  let failed = 0;
  const successful = new Map<string, JevResponse>();
  for (const [index, result] of results.entries()) {
    const label = cases[index].name.padEnd(11);
    if (result.status === "rejected") {
      failed++;
      console.error(
        `FAIL ${label} ${result.reason instanceof Error ? result.reason.message : "Check failed."}`,
      );
      continue;
    }
    const check = result.value;
    successful.set(check.name, check.response);
    console.log(
      `PASS ${label} ${String(check.answers).padStart(2)} answers · ${check.model} · provider ${check.providerMs} ms · total ${check.totalMs} ms`,
    );
  }
  console.log(
    `${cases.length - failed}/${cases.length} evaluation contracts passed. Total time includes the local HTTP round trip.`,
  );

  if (args.has("--writers")) {
    const health = object(await jsonRequest(new URL("api/health", base)), "Health response");
    let anthropicConfigured = false;
    for (const provider of ["openai", "anthropic"] as const) {
      const status = object(health[provider], `${provider} health`);
      check(typeof status.configured === "boolean", `${provider} health is invalid.`);
      if (provider === "anthropic") anthropicConfigured = status.configured;
      if (!status.configured) {
        console.log(`SKIP writer ${provider}: no server credential configured.`);
        continue;
      }
      try {
        const result = await writer(base, provider);
        console.log(
          `PASS writer ${provider} · ${result.model} · ${result.durationMs} ms · ${result.text.length} characters`,
        );
      } catch (error) {
        failed++;
        console.error(
          `FAIL writer ${provider}: ${error instanceof Error ? error.message : "Check failed."}`,
        );
      }
    }
    const history = successful.get("History");
    if (!anthropicConfigured) {
      console.log("SKIP changelog handoff: no Anthropic server credential configured.");
    } else if (!history) {
      console.log("SKIP changelog handoff: the History evaluation did not pass.");
    } else {
      try {
        const result = await changelogWriter(base, history);
        console.log(
          `PASS changelog Jev → ${result.model} · ${result.durationMs} ms writer · ${result.categories} categories · ${result.commits} cited commits · ${result.excluded} canceled commits excluded · History first pass reused`,
        );
      } catch (error) {
        failed++;
        console.error(
          `FAIL changelog handoff: ${error instanceof Error ? error.message : "Check failed."}`,
        );
      }
    }
  }
  if (failed) process.exitCode = 1;
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Live checks failed.");
  process.exitCode = 1;
});
