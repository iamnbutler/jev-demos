import { useState } from "react";
import { Code2, Pencil } from "lucide-react";
import {
  Button,
  CodeBlock,
  EvaluationBar,
  GenerationControl,
  Panel,
  PanelHeader,
  Probability,
  Segmented,
} from "../../components/ui";
import { useEvaluation } from "../../lib/jev";
import { buildCodeSearchRequest, keywordTerms, rankFunctions } from "./analysis";
import { CODE_QUERIES, SOURCE_CONTEXT, SOURCE_FUNCTIONS, type SourceFunction } from "./source-data";
import "./code.css";

export { buildCodeSearchRequest } from "./analysis";

export default function CodeSearchDemo() {
  const ev = useEvaluation();
  const [query, setQuery] = useState(CODE_QUERIES[0].query);
  const [functions, setFunctions] = useState<SourceFunction[]>(SOURCE_FUNCTIONS);
  const [selectedId, setSelectedId] = useState(SOURCE_FUNCTIONS[0].id);
  const [mode, setMode] = useState<"semantic" | "keyword">("semantic");
  const [editing, setEditing] = useState(false);
  const [writer, setWriter] = useState<string | null>(null);
  const [evaluatedInput, setEvaluatedInput] = useState<string | null>(null);
  const fingerprint = JSON.stringify({ query, functions });
  const data = evaluatedInput === fingerprint ? ev.data : null;
  const rows = rankFunctions(functions, query, data, mode);
  const selected = functions.find((fn) => fn.id === selectedId) ?? functions[0];
  const selectedRow = rows.find((row) => row.fn.id === selected.id);
  const edits = functions.filter(
    (fn) => SOURCE_FUNCTIONS.find((original) => original.id === fn.id)?.code !== fn.code,
  ).length;
  const probableCount = rows.filter(
    (row) => row.probability !== undefined && row.probability >= 0.65,
  ).length;
  const knownCount = rows.filter((row) => row.probability !== undefined).length;

  function changeQuery(value: string) {
    setQuery(value);
    setWriter(null);
    setEvaluatedInput(null);
    ev.reset();
  }

  function changeCode(value: string) {
    setFunctions((current) =>
      current.map((fn) => (fn.id === selected.id ? { ...fn, code: value } : fn)),
    );
    setEvaluatedInput(null);
    ev.reset();
  }

  async function analyze() {
    setEvaluatedInput(fingerprint);
    const result = await ev.run(buildCodeSearchRequest(query, functions));
    if (result) {
      const ranked = rankFunctions(functions, query, result, "semantic");
      if (ranked[0]) setSelectedId(ranked[0].fn.id);
    }
  }

  return (
    <div className="stack code-demo">
      <Panel>
        <div className="code-query-panel">
          <label className="field-label" htmlFor="code-query">
            Query
          </label>
          <div className="code-query-row">
            <textarea
              id="code-query"
              className="textarea code-query-input"
              rows={2}
              maxLength={2_000}
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
            />
            <Button
              variant="primary"
              loading={ev.loading}
              disabled={query.trim().length < 4 || functions.every((fn) => !fn.code.trim())}
              onClick={() => void analyze()}
            >
              Analyze
            </Button>
          </div>
          <div className="code-query-tools">
            <div className="code-preset-row">
              {CODE_QUERIES.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={`code-preset ${query === preset.query ? "is-active" : ""}`}
                  aria-pressed={query === preset.query}
                  onClick={() => changeQuery(preset.query)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <GenerationControl
              task="code-query"
              inputKey={fingerprint}
              context={{ ...SOURCE_CONTEXT, functions }}
              prompt="Write one concise, interesting natural-language question for locating functions by behavior in this snapshot. Return only the question, with no explanation or answer. It should distinguish at least one matching function from a close counterexample."
              label="Draft query"
              onGenerated={(text, response) => {
                changeQuery(text.trim().slice(0, 2_000));
                setWriter(`${response.provider} · ${response.model}`);
              }}
            />
          </div>
          {writer && <p className="small muted">Query drafted by {writer}.</p>}
        </div>
      </Panel>

      <EvaluationBar evaluation={ev} label="Code search" />

      <div className="code-search-layout">
        <Panel className="code-result-panel">
          <PanelHeader
            title="Results"
            description={
              data
                ? `${knownCount}/${functions.length} assessed · ${probableCount} at ≥65%`
                : `${functions.length} functions · Not assessed`
            }
          />
          <div className="code-result-controls">
            <Segmented
              value={mode}
              onChange={(value) => setMode(value as "semantic" | "keyword")}
              options={[
                { value: "semantic", label: "Jev" },
                { value: "keyword", label: "Keyword" },
              ]}
              ariaLabel="Search ranking method"
            />
            <p className="small muted">
              {mode === "semantic"
                ? "Model probability of matching the query."
                : `Exact word overlap · ${keywordTerms(query).length} query terms.`}
            </p>
          </div>
          <div className="code-results" role="list" aria-label="Functions ranked by relevance">
            {rows.map((row, index) => (
              <button
                type="button"
                key={row.fn.id}
                className={`code-result-row ${selected.id === row.fn.id ? "is-selected" : ""}`}
                aria-pressed={selected.id === row.fn.id}
                onClick={() => {
                  setSelectedId(row.fn.id);
                  setEditing(false);
                }}
              >
                <span className="code-rank">{index + 1}</span>
                <span className="code-result-name">
                  <strong>{row.fn.name}</strong>
                  <span>{row.fn.path}</span>
                </span>
                {mode === "semantic" ? (
                  <Probability value={row.probability} compact />
                ) : (
                  <span className="code-term-count">
                    {row.terms.length}
                    <small>terms</small>
                  </span>
                )}
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="code-source-panel">
          <PanelHeader
            title={selected.name}
            description={`${selected.path}:${selected.startLine}`}
            aside={
              <Button variant="ghost" size="sm" onClick={() => setEditing(!editing)}>
                {editing ? <Code2 size={14} /> : <Pencil size={14} />}
                {editing ? "View source" : "Edit source"}
              </Button>
            }
          />
          {edits > 0 && (
            <div className="code-source-meta">
              {edits} edited function{edits === 1 ? "" : "s"} · {data ? "Assessed" : "Not assessed"}
            </div>
          )}
          {editing ? (
            <div className="code-source-editor">
              <label className="field-label" htmlFor="code-source-editor">
                Replace this function’s source
              </label>
              <textarea
                id="code-source-editor"
                className="textarea mono"
                rows={18}
                maxLength={24_000}
                spellCheck={false}
                value={selected.code}
                onChange={(event) => changeCode(event.target.value)}
              />
              <p className="small muted">
                Edits reset results. Line numbers refer to this snapshot.
              </p>
            </div>
          ) : (
            <CodeBlock code={selected.code} language="typescript" startLine={selected.startLine} />
          )}
          <div className="code-source-verdict">
            <div className="row spread">
              <span className="field-label">Match</span>
              <Probability value={selectedRow?.probability} />
            </div>
            <div className="code-keyword-evidence">
              <span className="small muted">Keyword overlap</span>
              <div className="row wrap">
                {selectedRow?.terms.length ? (
                  selectedRow.terms.map((term) => <code key={term}>{term}</code>)
                ) : (
                  <span className="small muted">None</span>
                )}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="code-provenance row wrap spread">
        <span>
          Authored TypeScript fixture · {functions.length} functions · Results cover this snapshot
          only.
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={!edits}
          onClick={() => {
            setFunctions(SOURCE_FUNCTIONS);
            setEditing(false);
            setEvaluatedInput(null);
            ev.reset();
          }}
        >
          Restore fixture
        </Button>
      </div>
    </div>
  );
}
