import { useEffect, useMemo, useState } from "react";
import { appPath } from "../../lib/path";
import { ArrowDown, ArrowUp, ExternalLink, Square } from "lucide-react";
import {
  Button,
  CodeBlock,
  EvidenceDrawer,
  GenerationControl,
  Panel,
  PanelHeader,
  Probability,
  Segmented,
} from "../../components/ui";
import { keywordTerms, lexicalMatches } from "./analysis";
import { CODE_QUERIES, SOURCE_CONTEXT, SOURCE_FUNCTIONS } from "./source-data";
import { SEMANTIC_PRESETS, type SearchCorpus, type SearchFunction } from "./semantic-corpus";
import {
  rankSearchFunctions,
  SEARCH_BATCH_SIZE,
  SEARCH_CONCURRENCY,
  type SearchAttempt,
  type SearchSnapshot,
} from "./semantic-search";
import { useSearchElapsed, useSemanticSearch } from "./use-semantic-search";
import "./semantic-search.css";

export { buildCodeSearchRequest } from "./analysis";
export { buildSemanticSearchRequest, createSearchBatches } from "./semantic-search";

const FIXTURE_FUNCTIONS: SearchFunction[] = SOURCE_FUNCTIONS.map((fn) => ({
  ...fn,
  endLine: fn.startLine + fn.code.split("\n").length - 1,
  repository: "Authored Relay fixture",
  revision: "fixture/source-v1",
  sourceUrl: null,
  licenseUrl: null,
  kind: "function",
  imports: [],
}));

function duration(milliseconds: number) {
  return milliseconds < 1000
    ? `${Math.round(milliseconds)} ms`
    : `${(milliseconds / 1000).toFixed(2)} s`;
}

function useCorpus() {
  const [corpus, setCorpus] = useState<SearchCorpus | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void fetch(appPath("semantic-search/corpus.json"), { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("The public source corpus could not be loaded. Reload to try again.");
        const data = (await response.json()) as SearchCorpus;
        if (data.schema !== 1 || !Array.isArray(data.functions) || data.functions.length < 500)
          throw new Error("The public source corpus is invalid.");
        if (!abort.signal.aborted) setCorpus(data);
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted)
          setError(reason instanceof Error ? reason.message : "Could not load the source corpus.");
      });
    return () => abort.abort();
  }, []);
  return { corpus, error };
}

function writerSample(functions: SearchFunction[]) {
  const selected: SearchFunction[] = [];
  const repositories = [...new Set(functions.map((fn) => fn.repository))];
  for (const repository of repositories) {
    const pool = functions.filter((fn) => fn.repository === repository && fn.code.length <= 2_500);
    for (const fraction of [0.15, 0.45, 0.75]) {
      const fn = pool[Math.floor(pool.length * fraction)];
      if (fn && !selected.some((item) => item.id === fn.id)) selected.push(fn);
    }
  }
  return selected
    .slice(0, 9)
    .map(({ name, repository, path, code }) => ({ name, repository, path, code }));
}

function SearchProgress({
  snapshot,
  total,
  error,
}: {
  snapshot: SearchSnapshot;
  total: number;
  error: string | null;
}) {
  const elapsed = useSearchElapsed(snapshot);
  const assessed = Object.keys(snapshot.scores).length;
  const completedBatches = new Set(
    snapshot.attempts
      .filter((attempt) => attempt.candidateIds.every((id) => snapshot.scores[id] !== undefined))
      .map((attempt) => attempt.batchId),
  ).size;
  const status =
    snapshot.status === "idle"
      ? "Not evaluated"
      : snapshot.status === "running"
        ? "Evaluating"
        : snapshot.status === "paused"
          ? "Stopped"
          : snapshot.status === "complete"
            ? "Complete"
            : "Finished with unknowns";
  return (
    <div className="ss-progress" data-status={snapshot.status}>
      <div className="row wrap spread">
        <div className="row wrap" role="status" aria-live="polite" aria-atomic="true">
          <strong>{status}</strong>
          <span className="ss-assessed">
            {assessed.toLocaleString()} / {total.toLocaleString()} assessed
          </span>
          {snapshot.status !== "idle" && <span className="muted">{total - assessed} unknown</span>}
        </div>
        <div className="ss-timing">
          {snapshot.firstResultMs !== null && (
            <span>First result {duration(snapshot.firstResultMs)}</span>
          )}
          {snapshot.status !== "idle" && (
            <span className="mono">{duration(elapsed)} active time</span>
          )}
        </div>
      </div>
      <progress value={assessed} max={Math.max(total, 1)} aria-label="Functions assessed" />
      <div className="ss-progress-detail">
        <span>
          {snapshot.status === "idle"
            ? `${SEARCH_CONCURRENCY} concurrent requests · up to ${SEARCH_BATCH_SIZE} functions per batch`
            : `${completedBatches} / ${snapshot.batchCount} batches complete · ${snapshot.active} in flight · ${snapshot.update} returned`}
        </span>
        <span>Batched streaming · ranks update when real responses arrive</span>
      </div>
      {error && (
        <p className="ss-error" role="alert">
          {error}
        </p>
      )}
      {snapshot.status === "incomplete" && (
        <p className="ss-error" role="alert">
          Some batches failed or returned missing answers. Those functions remain unknown. Resume
          retries only batches with unknowns.
        </p>
      )}
    </div>
  );
}

function BatchEvidence({
  attempts,
  selectedId,
  onSelect,
}: {
  attempts: SearchAttempt[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const selected =
    attempts.find((attempt) => attempt.id === selectedId) ??
    [...attempts].reverse().find((attempt) => attempt.response) ??
    attempts.at(-1);
  if (!selected) return null;
  return (
    <div className="ss-batch-evidence">
      <div className="row wrap spread">
        <div className="row wrap ss-batch-select">
          <label className="field-label" htmlFor="ss-evidence-batch">
            Batch
          </label>
          <select
            id="ss-evidence-batch"
            className="select"
            value={selected.id}
            onChange={(event) => onSelect(event.target.value)}
          >
            {attempts.map((attempt) => (
              <option value={attempt.id} key={attempt.id}>
                #{attempt.batchIndex + 1} · {attempt.candidateIds.length} functions ·{" "}
                {attempt.status}
                {attempt.id !== `attempt-${attempt.batchIndex + 1}` ? ` · ${attempt.id}` : ""}
              </option>
            ))}
          </select>
          {selected.response && (
            <span className="small muted">
              {duration(selected.response.meta.providerMs)} provider · {selected.response.model}
            </span>
          )}
        </div>
        <div onClickCapture={() => onSelect(selected.id)}>
          <EvidenceDrawer key={selected.id} request={selected.request} data={selected.response} />
        </div>
      </div>
      {selected.error && <p className="ss-error">{selected.error}</p>}
    </div>
  );
}

function RankMovement({ value, rank }: { value: number | "new" | undefined; rank: number }) {
  if (value === "new")
    return (
      <span className="ss-movement ss-new" aria-label={`Newly assessed at rank ${rank}`}>
        new
      </span>
    );
  if (!value)
    return (
      <span className="ss-movement" aria-hidden="true">
        —
      </span>
    );
  return (
    <span
      className="ss-movement"
      aria-label={`${value > 0 ? "Up" : "Down"} ${Math.abs(value)} places since the preceding batch`}
    >
      {value > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      {Math.abs(value)}
    </span>
  );
}

export default function CodeSearchDemo() {
  const { corpus, error: corpusError } = useCorpus();
  const stream = useSemanticSearch();
  const { snapshot } = stream;
  const [dataset, setDataset] = useState("all");
  const [query, setQuery] = useState<string>(SEMANTIC_PRESETS[0].query);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"semantic" | "keyword">("semantic");
  const [editing, setEditing] = useState(false);
  const [followTop, setFollowTop] = useState(true);
  const [filter, setFilter] = useState("");
  const [shown, setShown] = useState(60);
  const [writer, setWriter] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const fixture = dataset === "fixture";
  const originalFunctions = useMemo(
    () =>
      fixture
        ? FIXTURE_FUNCTIONS
        : (corpus?.functions ?? []).filter((fn) => dataset === "all" || fn.repository === dataset),
    [corpus, dataset, fixture],
  );
  const functions = useMemo(
    () =>
      originalFunctions.map((fn) =>
        edits[fn.id] === undefined
          ? fn
          : {
              ...fn,
              code: edits[fn.id],
              startLine: 1,
              endLine: edits[fn.id].split("\n").length,
              edited: true,
            },
      ),
    [originalFunctions, edits],
  );
  const termsById = useMemo(
    () => new Map(functions.map((fn) => [fn.id, lexicalMatches(fn, query)])),
    [functions, query],
  );
  const rows = useMemo(
    () => rankSearchFunctions(functions, snapshot.scores, query, mode, termsById),
    [functions, snapshot.scores, query, mode, termsById],
  );
  const filteredRows = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase();
    return rows.filter(
      (row) =>
        !needle ||
        `${row.fn.name} ${row.fn.path} ${row.fn.repository}`.toLocaleLowerCase().includes(needle),
    );
  }, [filter, rows]);
  const selected =
    (followTop && !editing ? filteredRows[0]?.fn : functions.find((fn) => fn.id === selectedId)) ??
    rows[0]?.fn;
  const selectedRow = rows.find((row) => row.fn.id === selected?.id);
  const selectedOriginal = originalFunctions.find((fn) => fn.id === selected?.id);
  const probableCount = rows.filter(
    (row) => row.probability !== undefined && row.probability >= 0.65,
  ).length;
  const fingerprint = JSON.stringify({ query, dataset, corpus: corpus?.id, edits });
  const writerContext = useMemo(
    () => ({
      scope:
        "Representative sample only; the search will cover the selected corpus. These are complete function excerpts, not a full project.",
      provenance: fixture ? SOURCE_CONTEXT.provenance : corpus?.provenance,
      functions: writerSample(functions),
    }),
    [functions, fixture, corpus?.provenance],
  );
  const localEdits = Object.keys(edits).filter((id) =>
    originalFunctions.some((fn) => fn.id === id),
  ).length;

  function invalidate() {
    stream.reset();
    setInputError(null);
    setEvidenceId(null);
    setShown(60);
  }

  function changeQuery(value: string) {
    invalidate();
    setQuery(value);
    setWriter(null);
  }

  function changeDataset(value: string) {
    invalidate();
    setDataset(value);
    setSelectedId(null);
    setEditing(false);
    setFollowTop(true);
    setFilter("");
    setWriter(null);
  }

  async function analyze() {
    setInputError(null);
    setEvidenceId(null);
    setFollowTop(true);
    setEditing(false);
    setShown(60);
    try {
      await stream.start(query, functions, {
        provenance: fixture ? SOURCE_CONTEXT.provenance : corpus!.provenance,
        ...(fixture ? { contracts: SOURCE_CONTEXT } : {}),
      });
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "The search could not be started.");
    }
  }

  return (
    <div className="stack ss-demo">
      <Panel>
        <div className="ss-query-panel">
          <div className="row wrap spread">
            <label className="field-label" htmlFor="code-query">
              Query
            </label>
            <div className="ss-corpus-control">
              <label htmlFor="ss-corpus" className="field-label">
                Corpus
              </label>
              <select
                id="ss-corpus"
                className="select"
                value={dataset}
                onChange={(event) => changeDataset(event.target.value)}
              >
                <option value="all">
                  {corpus
                    ? `All public repositories · ${corpus.functions.length.toLocaleString()} functions`
                    : "Loading public repositories…"}
                </option>
                {corpus?.repositories.map((repository) => (
                  <option key={repository.id} value={repository.repository}>
                    {repository.name} · {repository.functions} functions
                  </option>
                ))}
                <option value="fixture">Authored fixture · 16 functions</option>
              </select>
            </div>
          </div>
          <div className="ss-query-row">
            <textarea
              id="code-query"
              className="textarea ss-query-input"
              rows={2}
              maxLength={2_000}
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
            />
            <div className="ss-run-controls">
              {snapshot.status === "running" ? (
                <Button variant="secondary" onClick={stream.stop}>
                  <Square size={12} />
                  Stop
                </Button>
              ) : (
                <Button
                  variant="primary"
                  disabled={query.trim().length < 4 || !functions.length}
                  onClick={() => void analyze()}
                >
                  {snapshot.status === "idle" ? "Analyze" : "Rerun"}
                </Button>
              )}
              {(snapshot.status === "paused" || snapshot.status === "incomplete") && (
                <Button variant="secondary" onClick={() => void stream.resume()}>
                  Resume
                </Button>
              )}
            </div>
          </div>
          <div className="ss-query-tools">
            <div className="ss-presets">
              {(fixture ? CODE_QUERIES : SEMANTIC_PRESETS).map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={query === preset.query}
                  className={query === preset.query ? "is-active" : ""}
                  onClick={() => changeQuery(preset.query)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {functions.length > 0 && (
              <GenerationControl
                task="code-query"
                inputKey={fingerprint}
                context={writerContext}
                prompt="Write one concise natural-language search criterion that locates functions by behavior across this corpus. The supplied functions are a small representative sample. Return only the criterion, no explanation or answer. Prefer a concrete behavior over names or keywords; it should separate matching functions from plausible counterexamples."
                label="Draft query"
                onGenerated={(text, response) => {
                  changeQuery(text.trim().slice(0, 2_000));
                  setWriter(`${response.provider} · ${response.model}`);
                }}
              />
            )}
          </div>
          {writer && <p className="small muted">Query drafted by {writer}.</p>}
        </div>
      </Panel>

      <SearchProgress
        snapshot={snapshot}
        total={functions.length}
        error={inputError ?? (fixture ? null : corpusError)}
      />
      <BatchEvidence
        attempts={snapshot.attempts}
        selectedId={evidenceId}
        onSelect={setEvidenceId}
      />

      <div className="ss-workspace">
        <Panel className="ss-results-panel">
          <PanelHeader
            title="Results"
            description={`${functions.length.toLocaleString()} candidates · ${probableCount} at ≥65%`}
            aside={
              <Segmented
                value={mode}
                onChange={(value) => {
                  setMode(value as "semantic" | "keyword");
                  setShown(60);
                }}
                options={[
                  { value: "semantic", label: "Jev" },
                  { value: "keyword", label: "Keyword" },
                ]}
                ariaLabel="Search ranking method"
              />
            }
          />
          <div className="ss-results-tools">
            <label htmlFor="ss-filter" className="sr-only">
              Filter function names or paths
            </label>
            <input
              id="ss-filter"
              className="input"
              type="search"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                setShown(60);
              }}
              placeholder="Filter names or paths…"
            />
            <p className="small muted">
              {mode === "semantic"
                ? "Jev match probability · new / rank change since the last batch"
                : `Exact word overlap · ${keywordTerms(query).length} query terms · no model needed`}
            </p>
          </div>
          <div
            className="ss-results"
            role="region"
            aria-label="Functions ranked by relevance"
            aria-busy={snapshot.status === "running"}
          >
            {filteredRows.slice(0, shown).map((row) => {
              const rank = rows.indexOf(row) + 1;
              return (
                <button
                  type="button"
                  key={row.fn.id}
                  className={`ss-result-row ${selected?.id === row.fn.id ? "is-selected" : ""}`}
                  data-function-id={row.fn.id}
                  aria-pressed={selected?.id === row.fn.id}
                  onClick={() => {
                    setSelectedId(row.fn.id);
                    setFollowTop(false);
                    setEditing(false);
                  }}
                >
                  <span className="ss-rank">{rank}</span>
                  <span className="ss-result-name">
                    <strong>{row.fn.name}</strong>
                    <span>
                      {row.fn.repository} · {row.fn.path}:{row.fn.startLine}
                    </span>
                  </span>
                  {mode === "semantic" ? (
                    <>
                      <RankMovement value={snapshot.movements[row.fn.id]} rank={rank} />
                      <Probability value={row.probability} compact />
                    </>
                  ) : (
                    <span className="ss-term-count">
                      {row.terms.length}
                      <small>terms</small>
                    </span>
                  )}
                </button>
              );
            })}
            {!filteredRows.length && (
              <p className="ss-empty">
                {functions.length
                  ? "No names or paths match this filter."
                  : corpusError
                    ? "Public corpus unavailable. The authored fixture is still available above."
                    : "Loading source corpus…"}
              </p>
            )}
          </div>
          <div className="ss-results-footer">
            <span>
              {Math.min(shown, filteredRows.length)} / {filteredRows.length.toLocaleString()} shown
            </span>
            {filteredRows.length > shown && (
              <Button size="sm" variant="ghost" onClick={() => setShown((count) => count + 100)}>
                Show 100 more
              </Button>
            )}
          </div>
        </Panel>

        {selected && (
          <Panel className="ss-source-panel">
            <PanelHeader
              title={selected.name}
              description={`${selected.repository} · ${selected.path}`}
              aside={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedId(selected.id);
                    setFollowTop(false);
                    setEditing(!editing);
                  }}
                >
                  {editing ? "View source" : "Edit source"}
                </Button>
              }
            />
            <div className="ss-source-meta">
              <div className="row wrap">
                {selected.edited ? (
                  <strong>Local edit · local line numbers</strong>
                ) : (
                  <span>
                    Lines {selected.startLine}–{selected.endLine}
                  </span>
                )}
                <code>{selected.revision.slice(0, selected.sourceUrl ? 7 : undefined)}</code>
                {selected.sourceUrl && (
                  <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                    {selected.edited ? "Original source" : "Pinned source"}
                    <ExternalLink size={11} />
                  </a>
                )}
                {selected.licenseUrl && (
                  <a href={selected.licenseUrl} target="_blank" rel="noreferrer">
                    MIT license
                  </a>
                )}
              </div>
              <label className="ss-follow">
                <input
                  type="checkbox"
                  checked={followTop && !editing}
                  disabled={editing}
                  onChange={(event) => {
                    setSelectedId(selected.id);
                    setFollowTop(event.target.checked);
                  }}
                />
                Follow top result
              </label>
            </div>
            {editing ? (
              <div className="ss-source-editor">
                <label className="field-label" htmlFor="ss-source-editor">
                  Replace this function’s source
                </label>
                <textarea
                  id="ss-source-editor"
                  className="textarea mono"
                  rows={18}
                  maxLength={24_000}
                  spellCheck={false}
                  value={selected.code}
                  onChange={(event) => {
                    invalidate();
                    setEdits((current) => ({ ...current, [selected.id]: event.target.value }));
                  }}
                />
                <p className="small muted">
                  Edits stop the current search and clear its judgments. The pinned link keeps the
                  original source.
                </p>
                {selected.edited && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      invalidate();
                      setEdits((current) => {
                        const next = { ...current };
                        delete next[selected.id];
                        return next;
                      });
                    }}
                  >
                    Restore this source
                  </Button>
                )}
              </div>
            ) : (
              <CodeBlock
                code={selected.code}
                language="typescript"
                startLine={selected.startLine}
              />
            )}
            <div className="ss-source-verdict">
              <div className="row wrap spread">
                <span className="field-label">Match</span>
                <Probability value={selectedRow?.probability} />
              </div>
              <div className="row wrap spread">
                <span className="small muted">
                  {selectedRow?.probability === undefined
                    ? "Unknown until this function receives a valid answer."
                    : "Probability from this function’s returned Jev answer."}
                </span>
                {snapshot.scoreAttempts[selected.id] && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setEvidenceId(snapshot.scoreAttempts[selected.id])}
                  >
                    Select its batch evidence
                  </button>
                )}
              </div>
              <div className="ss-keywords">
                <span className="small muted">Keyword overlap</span>
                <div className="row wrap">
                  {selectedRow?.terms.length ? (
                    selectedRow.terms.map((term) => <code key={term}>{term}</code>)
                  ) : (
                    <span className="small muted">None</span>
                  )}
                </div>
              </div>
              {(selected.imports.length > 0 || selected.notice) && (
                <details className="ss-source-context">
                  <summary>Imports & source notice</summary>
                  {selected.notice && <pre>{selected.notice}</pre>}
                  <pre>
                    {selected.imports.join("\n") || "No import statements in the source file."}
                  </pre>
                  <p className="small muted">
                    Batch evidence shows the exact subset of imports sent to Jev. Imported
                    implementations are not included.
                  </p>
                </details>
              )}
              {selected.edited && selectedOriginal && (
                <p className="small muted">
                  Original: {selectedOriginal.path}:{selectedOriginal.startLine}–
                  {selectedOriginal.endLine}
                </p>
              )}
            </div>
          </Panel>
        )}
      </div>

      <div className="ss-provenance">
        <p>
          {fixture
            ? "Authored synthetic TypeScript fixture. Results cover this snapshot only."
            : `${functions.length.toLocaleString()} real source excerpts · pinned MIT repositories · `}
          {!fixture && (
            <a href={appPath("semantic-search/NOTICE.md")} target="_blank" rel="noreferrer">
              Corpus method & licenses
            </a>
          )}
          {localEdits > 0 && ` · ${localEdits} local edit${localEdits === 1 ? "" : "s"}`}
        </p>
        <p>
          Every selected function is queued, with keyword overlap used only to choose processing
          order. Probabilities come from independent Jev batches and are not a whole-program proof.
        </p>
      </div>
    </div>
  );
}
