import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Badge,
  Button,
  CodeBlock,
  EvaluationBar,
  Panel,
  PanelHeader,
  Probability,
} from "../../components/ui";
import { useEvaluation } from "../../lib/jev";
import {
  buildReviewRequest,
  diffCounts,
  readProbability,
  reviewQuestionKey,
  strongestProbability,
} from "./analysis";
import { REVIEW_CONTEXT, REVIEW_HUNKS, REVIEW_LENSES, type ReviewLensId } from "./review-data";
import "./code.css";

export { buildReviewRequest } from "./analysis";

export default function ReviewDemo() {
  const ev = useEvaluation();
  const [lenses, setLenses] = useState<ReviewLensId[]>(["behavior"]);
  const [threshold, setThreshold] = useState(0.65);
  const [foldOthers, setFoldOthers] = useState(true);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const counts = REVIEW_HUNKS.reduce(
    (sum, hunk) => {
      const hunkCounts = diffCounts(hunk.diff);
      return { added: sum.added + hunkCounts.added, removed: sum.removed + hunkCounts.removed };
    },
    { added: 0, removed: 0 },
  );
  const assessed = REVIEW_HUNKS.map((hunk) => {
    const values = lenses.map((lens) => readProbability(ev.data, reviewQuestionKey(hunk.id, lens)));
    const probability = strongestProbability(values);
    return {
      hunk,
      probability,
      unknown: values.some((value) => value === undefined),
      matches: !lenses.length || (probability !== undefined && probability >= threshold),
    };
  });
  const focusedCount = assessed.filter((item) => item.matches).length;
  const unknownCount = assessed.filter((item) => item.unknown).length;

  function toggleLens(id: ReviewLensId) {
    setLenses((current) =>
      current.includes(id) ? current.filter((lens) => lens !== id) : [...current, id],
    );
    setOverrides({});
  }

  return (
    <div className="stack code-demo">
      <Panel>
        <div className="code-review-summary">
          <div className="code-review-title">
            <h2>{REVIEW_CONTEXT.title}</h2>
            <p className="mono muted small">
              {REVIEW_CONTEXT.baseRevision} → {REVIEW_CONTEXT.headRevision}
            </p>
          </div>
          <div className="code-diff-totals">
            <span>+{counts.added}</span>
            <span>−{counts.removed}</span>
          </div>
          <Button
            variant="primary"
            loading={ev.loading}
            onClick={() => {
              setOverrides({});
              void ev.run(buildReviewRequest());
            }}
          >
            Analyze 12 hunks
          </Button>
        </div>
      </Panel>

      <EvaluationBar evaluation={ev} label="Review lenses" />

      <div className="code-review-layout">
        <Panel className="code-lens-panel">
          <PanelHeader title="Lenses" />
          <div className="code-lens-list">
            {REVIEW_LENSES.map((lens) => {
              const known = REVIEW_HUNKS.filter(
                (hunk) =>
                  readProbability(ev.data, reviewQuestionKey(hunk.id, lens.id)) !== undefined,
              ).length;
              const matches = REVIEW_HUNKS.filter(
                (hunk) =>
                  (readProbability(ev.data, reviewQuestionKey(hunk.id, lens.id)) ?? -1) >=
                  threshold,
              ).length;
              return (
                <button
                  key={lens.id}
                  type="button"
                  className={`code-lens ${lenses.includes(lens.id) ? "is-active" : ""}`}
                  aria-pressed={lenses.includes(lens.id)}
                  onClick={() => toggleLens(lens.id)}
                >
                  <span className="code-lens-check" aria-hidden="true">
                    {lenses.includes(lens.id) ? "✓" : ""}
                  </span>
                  <span>
                    <strong>{lens.label}</strong>
                    <small>{lens.description}</small>
                  </span>
                  <span className="code-lens-count">{known ? matches : "—"}</span>
                </button>
              );
            })}
          </div>
          <div className="code-lens-options">
            <label className="field-label code-threshold-label" htmlFor="review-threshold">
              <span>Threshold</span>
              <strong>{Math.round(threshold * 100)}%</strong>
            </label>
            <input
              id="review-threshold"
              className="code-range"
              type="range"
              min="0.35"
              max="0.95"
              step="0.05"
              value={threshold}
              onChange={(event) => {
                setThreshold(Number(event.target.value));
                setOverrides({});
              }}
            />
            <p className="small muted">Any selected lens. Unknown results stay visible.</p>
            <label className="code-checkbox">
              <input
                type="checkbox"
                checked={foldOthers}
                onChange={(event) => {
                  setFoldOthers(event.target.checked);
                  setOverrides({});
                }}
              />
              <span>Fold other hunks</span>
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFoldOthers(false);
                setOverrides({});
              }}
            >
              Expand all hunks
            </Button>
          </div>
        </Panel>

        <div className="stack code-hunks">
          <div className="code-hunks-heading row spread wrap">
            <span>
              <strong>{ev.data ? focusedCount : "—"}</strong> hunks in focus
              {unknownCount > 0 && ev.data ? (
                <span className="muted"> · {unknownCount} with unknown selected judgments</span>
              ) : null}
            </span>
            <span className="muted small">
              {lenses.length ? "Any selected lens" : "All hunks"} · source order preserved
            </span>
          </div>
          {assessed.map(({ hunk, probability, matches, unknown }, index) => {
            const automaticOpen = !foldOthers || (ev.data ? matches || unknown : index < 2);
            const open = overrides[hunk.id] ?? automaticOpen;
            const hunkCounts = diffCounts(hunk.diff);
            return (
              <Panel
                key={hunk.id}
                className={`code-hunk ${ev.data && matches && lenses.length ? "is-focused" : ""}`}
              >
                <button
                  type="button"
                  className="code-hunk-heading"
                  aria-expanded={open}
                  aria-controls={`review-hunk-${hunk.id}`}
                  onClick={() => setOverrides((current) => ({ ...current, [hunk.id]: !open }))}
                >
                  {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="code-hunk-path">
                    <strong>{hunk.path}</strong>
                    <small>{hunk.section}</small>
                  </span>
                  <span className="code-hunk-lines">
                    <span>+{hunkCounts.added}</span>
                    <span>−{hunkCounts.removed}</span>
                  </span>
                  {!ev.data || unknown ? (
                    <Badge tone="neutral">{ev.data ? "Some unknown" : "Unassessed"}</Badge>
                  ) : (
                    <Badge tone={matches && lenses.length ? "blue" : "neutral"}>
                      {lenses.length ? (matches ? "In focus" : "Below threshold") : "Visible"}
                    </Badge>
                  )}
                </button>
                {open && (
                  <div id={`review-hunk-${hunk.id}`}>
                    <div className="code-hunk-scores">
                      {REVIEW_LENSES.map((lens) => (
                        <div
                          className={lenses.includes(lens.id) ? "is-selected" : ""}
                          key={lens.id}
                        >
                          <span>{lens.label}</span>
                          <Probability
                            value={readProbability(ev.data, reviewQuestionKey(hunk.id, lens.id))}
                            compact
                          />
                        </div>
                      ))}
                    </div>
                    <CodeBlock code={hunk.diff} language="diff" />
                    <div className="code-hunk-context">
                      <strong>Code contract</strong>
                      <p>{hunk.context}</p>
                    </div>
                  </div>
                )}
                {!open && (
                  <div className="code-folded-note">
                    <span>Folded · click to inspect</span>
                    {lenses.length > 0 && probability !== undefined && (
                      <span>Strongest selected lens: {Math.round(probability * 100)}%</span>
                    )}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      </div>
      <div className="code-provenance">
        Authored diff · 12 hunks · Facets are Jev judgments; line counts are exact.
      </div>
    </div>
  );
}
