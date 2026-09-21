import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import { Badge, Button, EvaluationBar, Panel, Segmented } from "../../components/ui";
import { DiffView, type DiffNote } from "../../components/DiffView";
import { useEvaluation } from "../../lib/jev";
import { buildReviewRequest, diffCounts } from "./analysis";
import { LENS_TONES, parseReviewDiff, rangeLabel, reviewDecoration } from "./review-decoration";
import { REVIEW_CONTEXT, REVIEW_HUNKS, REVIEW_LENSES, type ReviewLensId } from "./review-data";
import "./review.css";

export { buildReviewRequest } from "./analysis";

const parsedDiffs = new Map(REVIEW_HUNKS.map((hunk) => [hunk.id, parseReviewDiff(hunk)]));
const totals = REVIEW_HUNKS.reduce(
  (sum, hunk) => {
    const counts = diffCounts(hunk.diff);
    return { added: sum.added + counts.added, removed: sum.removed + counts.removed };
  },
  { added: 0, removed: 0 },
);

export default function ReviewDemo() {
  const ev = useEvaluation();
  const [lenses, setLenses] = useState<ReviewLensId[]>(() => REVIEW_LENSES.map((lens) => lens.id));
  const [threshold, setThreshold] = useState(0.65);
  const [mode, setMode] = useState("decorate");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const assessed = useMemo(
    () =>
      REVIEW_HUNKS.map((hunk) => ({ hunk, ...reviewDecoration(hunk, ev.data, lenses, threshold) })),
    [ev.data, lenses, threshold],
  );
  const matchCount = assessed.filter((item) => item.matches).length;
  const visible = assessed.filter(
    (item) => mode !== "filter" || !ev.data || !lenses.length || item.matches || item.unknown,
  );

  function toggleLens(id: ReviewLensId) {
    setLenses((current) =>
      current.includes(id) ? current.filter((lens) => lens !== id) : [...current, id],
    );
  }

  return (
    <div className="stack review-demo">
      <div className="review-heading">
        <div>
          <h2>{REVIEW_CONTEXT.title}</h2>
          <p className="review-provenance">
            Synthetic PR · 12 hunks · <span className="review-added">+{totals.added}</span>{" "}
            <span className="review-removed">−{totals.removed}</span>
          </p>
        </div>
        <Button
          variant="primary"
          loading={ev.loading}
          onClick={() => void ev.run(buildReviewRequest())}
        >
          Analyze 12 hunks
        </Button>
      </div>

      {(ev.loading || ev.request || ev.error) && (
        <EvaluationBar evaluation={ev} label="Review lenses" />
      )}

      <div className="review-controls">
        <div className="review-lenses" role="group" aria-label="Review lenses">
          {REVIEW_LENSES.map((lens) => {
            const count = assessed.filter((item) =>
              item.active.some((active) => active.id === lens.id),
            ).length;
            return (
              <button
                key={lens.id}
                type="button"
                className={`review-lens review-tone-${LENS_TONES[lens.id]} ${lenses.includes(lens.id) ? "is-active" : ""}`}
                aria-pressed={lenses.includes(lens.id)}
                title={lens.description}
                onClick={() => toggleLens(lens.id)}
              >
                <span className="review-dot" aria-hidden="true" />
                {lens.label}
                {ev.data && lenses.includes(lens.id) && (
                  <span className="review-lens-count">{count}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="review-view-options">
          <label className="review-threshold" htmlFor="review-threshold">
            Mark at
            <select
              id="review-threshold"
              className="select"
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))}
            >
              {[0.5, 0.65, 0.8, 0.9, 0.95].map((value) => (
                <option key={value} value={value}>
                  {Math.round(value * 100)}%
                </option>
              ))}
            </select>
          </label>
          <Segmented
            value={mode}
            onChange={setMode}
            ariaLabel="Review display"
            options={[
              { value: "decorate", label: "Decorate" },
              { value: "filter", label: "Filter" },
            ]}
          />
        </div>
      </div>
      <p className="review-scope">
        {ev.data ? `${matchCount} of 12 hunks marked. ` : "Analyze to mark matching changes. "}
        Scores ≥10%, highest first. Checks appear only for Yes answers.
        {mode === "filter" && ev.data
          ? ` ${12 - visible.length} hunks hidden; unknown judgments stay visible.`
          : ""}
      </p>

      <div className="review-hunks">
        {visible.map((item) => {
          const { hunk, active, anchor, visibleJudgments, yesChecks, marks, ranges, unknown } =
            item;
          const inlineJudgments = visibleJudgments.filter((judgment) => judgment.selected);
          const open = !collapsed[hunk.id];
          const diff = parsedDiffs.get(hunk.id)!;
          const counts = diffCounts(hunk.diff);
          const tone = active[0]?.tone ?? "neutral";
          const notes: DiffNote[] =
            ev.data && anchor && (inlineJudgments.length > 0 || yesChecks.length > 0)
              ? [
                  {
                    id: hunk.id,
                    ...anchor,
                    content: (
                      <div
                        className={`review-annotation review-tone-${tone}`}
                        data-hunk-annotation={hunk.id}
                      >
                        <div className="review-annotation-head">
                          <strong title="Jev judges the whole hunk; marks cover its changed lines.">
                            Jev · hunk judgment
                          </strong>
                          <span>{ranges.map(rangeLabel).join(" · ")}</span>
                        </div>
                        {inlineJudgments.length > 0 && (
                          <div className="review-inline-scores">
                            {inlineJudgments.map((judgment) => (
                              <span
                                key={judgment.id}
                                data-review-lens={judgment.id}
                                className={`review-score review-tone-${judgment.tone} ${judgment.probability !== undefined && judgment.probability >= threshold ? "is-marked" : ""}`}
                              >
                                <span className="review-dot" aria-hidden="true" />
                                {judgment.label}
                                <strong>
                                  {judgment.probability === undefined
                                    ? "Unknown"
                                    : `${Math.round(judgment.probability * 100)}%`}
                                </strong>
                              </span>
                            ))}
                          </div>
                        )}
                        {yesChecks.length > 0 && (
                          <div className="review-yes-checks" role="list" aria-label="Yes checks">
                            {yesChecks.map((check) => (
                              <span
                                key={check.id}
                                className={`review-yes-check review-check-${check.tone}`}
                                data-review-check={check.id}
                                role="listitem"
                                title={`Jev: Yes · ${Math.round(check.confidence * 100)}% confidence. ${check.statement}`}
                              >
                                {check.tone === "neutral" ? (
                                  <Check size={13} aria-hidden="true" />
                                ) : (
                                  <TriangleAlert size={14} aria-hidden="true" />
                                )}
                                <span className="sr-only">Yes: </span>
                                {check.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ),
                  },
                ]
              : [];
          return (
            <Panel
              key={hunk.id}
              className={`review-hunk review-tone-${tone}`}
              data-review-hunk={hunk.id}
            >
              <button
                type="button"
                className="review-hunk-heading"
                aria-expanded={open}
                aria-controls={`review-hunk-${hunk.id}`}
                onClick={() => setCollapsed((current) => ({ ...current, [hunk.id]: open }))}
              >
                {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                <span className="review-hunk-path">
                  <strong>{hunk.path}</strong>
                  <small>{hunk.section}</small>
                </span>
                <span className="review-line-count">
                  <span className="review-added">+{counts.added}</span>{" "}
                  <span className="review-removed">−{counts.removed}</span>
                </span>
                {!ev.data ? (
                  <Badge tone="neutral">Unassessed</Badge>
                ) : active.length ? (
                  <span className="review-hunk-label">
                    <span className="review-dot" aria-hidden="true" />
                    {active[0].label}
                  </span>
                ) : (
                  <Badge tone="neutral">
                    {unknown ? "Unknown" : lenses.length ? "Below threshold" : "No lens selected"}
                  </Badge>
                )}
              </button>
              {open && (
                <div id={`review-hunk-${hunk.id}`}>
                  <DiffView diff={diff} notes={notes} marks={marks} />
                  <details className="review-evidence">
                    <summary>
                      Context{ev.data && visibleJudgments.length > 0 ? " and scores" : ""}
                    </summary>
                    <p>{hunk.context}</p>
                    {ev.data && visibleJudgments.length > 0 && (
                      <dl className="review-all-judgments">
                        {visibleJudgments.map((judgment) => (
                          <div key={judgment.id}>
                            <dt title={judgment.statement}>{judgment.label}</dt>
                            <dd>
                              {judgment.probability === undefined
                                ? "Unknown"
                                : `${Math.round(judgment.probability * 100)}%`}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    <p className="review-revisions">
                      {REVIEW_CONTEXT.baseRevision} → {REVIEW_CONTEXT.headRevision}
                    </p>
                  </details>
                </div>
              )}
            </Panel>
          );
        })}
        {!visible.length && (
          <p className="review-empty">
            No hunks meet the selected lenses and threshold. Switch to Decorate to see all changes.
          </p>
        )}
      </div>
    </div>
  );
}
