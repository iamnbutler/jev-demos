import { useState } from "react";
import { ArrowUpRight, ChevronRight, GitCommitHorizontal, Undo2, Search } from "lucide-react";
import {
  Badge,
  Button,
  CodeBlock,
  EmptyState,
  EvaluationBar,
  Panel,
  PanelHeader,
  Probability,
  Segmented,
} from "../../components/ui";
import { useEvaluation } from "../../lib/jev";
import {
  buildHistoryRequest,
  commitsAtRevision,
  diffCounts,
  historyQuestionKey,
  readProbability,
  reversedPatches,
} from "./analysis";
import {
  HISTORY_COMMITS,
  HISTORY_CONTEXT,
  HISTORY_FACETS,
  HISTORY_REVISIONS,
  type HistoryFacetId,
} from "./history-data";
import "./code.css";

export { buildHistoryRequest } from "./analysis";

export default function HistoryDemo() {
  const ev = useEvaluation();
  const [revisionId, setRevisionId] = useState(HISTORY_REVISIONS[1].id);
  const [facet, setFacet] = useState<HistoryFacetId | "all">("all");
  const [mode, setMode] = useState<"semantic" | "message">("semantic");
  const [messageQuery, setMessageQuery] = useState("permission");
  const [selectedId, setSelectedId] = useState("c24");
  const [hideReversed, setHideReversed] = useState(false);
  const [threshold, setThreshold] = useState(0.65);
  const revision = HISTORY_REVISIONS.find((item) => item.id === revisionId) ?? HISTORY_REVISIONS[1];
  const included = commitsAtRevision(HISTORY_COMMITS, revision.lastCommitId);
  const reversed = reversedPatches(included);
  const filtered = included
    .filter((commit) => {
      if (hideReversed && reversed.has(commit.id)) return false;
      if (mode === "message")
        return commit.message.toLowerCase().includes(messageQuery.toLowerCase().trim());
      if (facet === "all") return true;
      const probability = readProbability(ev.data, historyQuestionKey(commit.id, facet));
      return probability === undefined || probability >= threshold;
    })
    .reverse();
  const selected = filtered.find((commit) => commit.id === selectedId) ?? filtered[0];
  const undoneBy = selected ? reversed.get(selected.id) : undefined;
  const revertsCommit = selected?.reverts
    ? included.find((commit) => commit.id === selected.reverts)
    : undefined;
  const unknownCount =
    facet === "all"
      ? 0
      : filtered.filter(
          (commit) => readProbability(ev.data, historyQuestionKey(commit.id, facet)) === undefined,
        ).length;
  const selectedCounts = selected ? diffCounts(selected.diff) : null;

  return (
    <div className="stack code-demo">
      <Panel>
        <div className="code-history-header">
          <div className="code-revision-control">
            <label htmlFor="history-revision" className="field-label">
              Revision
            </label>
            <select
              id="history-revision"
              className="select mono"
              value={revisionId}
              onChange={(event) => setRevisionId(event.target.value)}
            >
              {HISTORY_REVISIONS.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.label} · {item.sha}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="primary"
            loading={ev.loading}
            onClick={() => void ev.run(buildHistoryRequest())}
          >
            Analyze 24 commits
          </Button>
        </div>
        <div className="code-revision-strip">
          <span className="mono">{HISTORY_CONTEXT.baseRevision}</span>
          <span>→</span>
          <span className="mono">fixture/{revision.sha}</span>
          <span>
            · {included.length} commits · {reversed.size} patches reversed
          </span>
        </div>
      </Panel>

      <EvaluationBar evaluation={ev} label="Commit facets" />

      <div className="code-history-controls">
        <Segmented
          value={mode}
          onChange={(value) => setMode(value as "semantic" | "message")}
          options={[
            { value: "semantic", label: "Jev facets" },
            { value: "message", label: "Message search" },
          ]}
          ariaLabel="History search method"
        />
        <label className="code-checkbox">
          <input
            type="checkbox"
            checked={hideReversed}
            onChange={(event) => setHideReversed(event.target.checked)}
          />
          <span>Hide reversed patches</span>
        </label>
      </div>

      {mode === "semantic" ? (
        <div className="code-history-facets">
          <button
            className={`code-history-facet ${facet === "all" ? "is-active" : ""}`}
            type="button"
            aria-pressed={facet === "all"}
            onClick={() => setFacet("all")}
          >
            <span>All commits</span>
            <strong>{included.length}</strong>
          </button>
          {HISTORY_FACETS.map((item) => {
            const known = included.filter(
              (commit) =>
                readProbability(ev.data, historyQuestionKey(commit.id, item.id)) !== undefined,
            ).length;
            const count = included.filter(
              (commit) =>
                (readProbability(ev.data, historyQuestionKey(commit.id, item.id)) ?? -1) >=
                threshold,
            ).length;
            return (
              <button
                className={`code-history-facet ${facet === item.id ? "is-active" : ""}`}
                type="button"
                aria-pressed={facet === item.id}
                key={item.id}
                onClick={() => setFacet(item.id)}
                title={
                  known
                    ? `${known}/${included.length} assessed · ≥${Math.round(threshold * 100)}%`
                    : "Not assessed"
                }
              >
                <span>{item.label}</span>
                <strong>{known ? count : "—"}</strong>
              </button>
            );
          })}
        </div>
      ) : (
        <Panel>
          <div className="code-message-search">
            <Search size={18} />
            <label className="sr-only" htmlFor="history-message-search">
              Search commit messages
            </label>
            <input
              id="history-message-search"
              className="input"
              value={messageQuery}
              onChange={(event) => setMessageQuery(event.target.value)}
              placeholder="Search only the commit messages…"
            />
            <span className="small muted">Literal substring · {filtered.length} found</span>
          </div>
        </Panel>
      )}

      <div className="row wrap spread small muted">
        <span>
          {filtered.length} visible of {included.length} included commits
          {unknownCount ? ` · ${unknownCount} still unassessed` : ""}
          {hideReversed ? ` · ${reversed.size} reversed patches hidden` : ""}
        </span>
        {mode === "semantic" && (
          <label className="code-inline-threshold" htmlFor="history-threshold">
            Threshold ≥{Math.round(threshold * 100)}%
            <input
              id="history-threshold"
              className="code-range"
              type="range"
              min="0.35"
              max="0.95"
              step="0.05"
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))}
            />
          </label>
        )}
      </div>

      <div className="code-history-layout">
        <Panel className="code-timeline-panel">
          <PanelHeader title="Commits" description="Newest first" />
          {filtered.length ? (
            <div className="code-commit-list">
              {filtered.map((commit, index) => {
                const reversal = reversed.get(commit.id);
                const probability =
                  facet !== "all" && mode === "semantic"
                    ? readProbability(ev.data, historyQuestionKey(commit.id, facet))
                    : undefined;
                const showDate = index === 0 || filtered[index - 1].date !== commit.date;
                return (
                  <div key={commit.id}>
                    {showDate && (
                      <div className="code-commit-date">
                        {new Date(`${commit.date}T12:00:00Z`).toLocaleDateString("en", {
                          month: "short",
                          day: "numeric",
                          timeZone: "UTC",
                        })}
                      </div>
                    )}
                    <button
                      type="button"
                      className={`code-commit ${selected?.id === commit.id ? "is-selected" : ""} ${reversal ? "is-reversed" : ""}`}
                      aria-pressed={selected?.id === commit.id}
                      onClick={() => setSelectedId(commit.id)}
                    >
                      <span className="code-commit-node">
                        {commit.reverts ? <Undo2 size={15} /> : <GitCommitHorizontal size={15} />}
                      </span>
                      <span className="code-commit-content">
                        <strong>{commit.message}</strong>
                        <span>
                          <code>{commit.sha}</code> · {commit.author}
                          {reversal
                            ? ` · reversed by ${reversal.sha}`
                            : commit.reverts
                              ? " · explicit revert"
                              : ""}
                        </span>
                        <small>{commit.path}</small>
                      </span>
                      {facet !== "all" && mode === "semantic" ? (
                        <Probability value={probability} compact />
                      ) : (
                        <ChevronRight size={15} />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="code-history-empty">
              <EmptyState
                icon={<Search size={22} />}
                title={mode === "message" ? "No messages matched" : "No commits in focus"}
                description={
                  mode === "message"
                    ? "These messages conceal the substance of the patches. Try the Access control facet to inspect what changed."
                    : "No assessed commits meet this combination of filters."
                }
              />
              <Button
                variant="secondary"
                onClick={() => {
                  setMode("semantic");
                  setFacet("permissions");
                  setHideReversed(false);
                }}
              >
                Inspect access-control changes <ArrowUpRight size={14} />
              </Button>
            </div>
          )}
        </Panel>

        <Panel className="code-commit-detail">
          {selected ? (
            <>
              <PanelHeader
                title={selected.message}
                description={`${selected.sha} · ${selected.author} · ${selected.date}`}
              />
              <div className="code-commit-membership row wrap">
                <Badge tone="green">Included in {revision.label}</Badge>
                {undoneBy && <Badge tone="amber">Patch reversed later</Badge>}
                {selected.reverts && <Badge tone="purple">Reverts a prior patch</Badge>}
              </div>
              {undoneBy && (
                <div className="code-revert-notice">
                  <Undo2 size={16} />
                  <div>
                    <strong>Patch reversed</strong>
                    <p>
                      Reverted by{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(undoneBy.id);
                          setFacet("all");
                          setMode("semantic");
                          setHideReversed(false);
                        }}
                      >
                        {undoneBy.sha}
                      </button>
                      . The commit remains in this revision’s history.
                    </p>
                  </div>
                </div>
              )}
              {revertsCommit && (
                <div className="code-revert-notice">
                  <Undo2 size={16} />
                  <div>
                    <strong>Reversal of {revertsCommit.sha}</strong>
                    <p>
                      This patch undoes “{revertsCommit.message}.” Both commits are included in this
                      revision.
                    </p>
                  </div>
                </div>
              )}
              <div className="code-commit-facets">
                {HISTORY_FACETS.map((item) => (
                  <div key={item.id}>
                    <span>{item.label}</span>
                    <Probability
                      value={readProbability(ev.data, historyQuestionKey(selected.id, item.id))}
                      compact
                    />
                  </div>
                ))}
              </div>
              <div className="code-commit-file row spread">
                <code>{selected.path}</code>
                <span className="code-hunk-lines">
                  <span>+{selectedCounts?.added}</span>
                  <span>−{selectedCounts?.removed}</span>
                </span>
              </div>
              <CodeBlock code={selected.diff} language="diff" />
              {selected.context && (
                <div className="code-hunk-context">
                  <strong>Code contract</strong>
                  <p>{selected.context}</p>
                </div>
              )}
            </>
          ) : (
            <div className="code-history-empty">
              <EmptyState
                icon={<GitCommitHorizontal size={25} />}
                title="Select a commit"
                description="Change the filters to inspect a patch and its live semantic judgments."
              />
            </div>
          )}
        </Panel>
      </div>

      <div className="code-provenance">
        Authored linear history · Membership and reversals are exact; facets are Jev judgments.
        Revision presence does not imply deployment.
      </div>
    </div>
  );
}
