import { useMemo, useState } from "react";
import { Check, Copy, Pin, PinOff, ShieldCheck } from "lucide-react";
import {
  Badge,
  Button,
  EvaluationBar,
  GenerationControl,
  Panel,
  PanelHeader,
  Probability,
  Segmented,
} from "../../components/ui";
import { useEvaluation } from "../../lib/jev";
import { CONTEXT_TURNS, DEFAULT_CONTEXT_TASK } from "./context-data";
import {
  buildContextRequest,
  countCharacters,
  estimateTokens,
  readContextJudgments,
  renderContext,
  renderTurn,
  selectContext,
  type RetentionReason,
} from "./context";
import "./agents.css";

const reasonLabels: Record<RetentionReason, string> = {
  protected: "Protected",
  pinned: "Pinned",
  selected: "Retained",
  budget: "Outside budget",
  "low-signal": "Low signal",
  unassessed: "Not evaluated",
};

const taskPresets = [
  { label: "Finish the fix", task: DEFAULT_CONTEXT_TASK },
  {
    label: "Audit cancellation",
    task: "Audit the cancellation behavior in the current patch. Identify contract violations, cleanup gaps, untested assumptions, and the most useful existing test evidence.",
  },
  {
    label: "Prepare a handoff",
    task: "Prepare a precise handoff for another engineer: what changed, what remains unfinished, which errors are stale, and exactly which tests have and have not run.",
  },
];

export default function ContextDemo() {
  const ev = useEvaluation();
  const [task, setTask] = useState(DEFAULT_CONTEXT_TASK);
  const [budget, setBudget] = useState(1450);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState("design-note");
  const [filter, setFilter] = useState("all");
  const [preview, setPreview] = useState("source");
  const [copied, setCopied] = useState(false);
  const [generatedBy, setGeneratedBy] = useState<string | null>(null);
  const judgments = useMemo(() => readContextJudgments(ev.data, CONTEXT_TURNS), [ev.data]);
  const selection = useMemo(
    () => selectContext({ turns: CONTEXT_TURNS, task, budgetTokens: budget, judgments, pinnedIds }),
    [task, budget, judgments, pinnedIds],
  );
  const fullText = renderContext(task, CONTEXT_TURNS);
  const fullTokens = estimateTokens(fullText);
  const rangeMax = Math.ceil(fullTokens / 64) * 64;
  const selectedTurn = CONTEXT_TURNS.find((turn) => turn.id === selectedId)!;
  const selectedReason = selection.reasons[selectedId]!;
  const selectedRetained = selection.retained.some((turn) => turn.id === selectedId);
  const shownTurns = CONTEXT_TURNS.filter(
    (turn) =>
      filter === "all" ||
      (filter === "retained" ? selection.retained : selection.archived).some(
        (item) => item.id === turn.id,
      ),
  );
  const pairedTurns = CONTEXT_TURNS.filter((turn) => turn.kind === "exchange").length;
  const retainedCharactersPercent = Math.round(
    (selection.characters / countCharacters(fullText)) * 100,
  );

  function changeTask(value: string) {
    setTask(value);
    setGeneratedBy(null);
    setCopied(false);
    ev.reset();
  }

  function togglePin(id: string) {
    setPinnedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setCopied(false);
  }

  async function copyContext() {
    try {
      await navigator.clipboard.writeText(selection.text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="stack agents-context">
      <div className="agents-context-controls">
        <Panel>
          <PanelHeader title="Objective" />
          <div className="agents-panel-body stack">
            <label className="field">
              <span className="sr-only">Current objective</span>
              <textarea
                className="textarea agents-task-input"
                value={task}
                onChange={(event) => changeTask(event.target.value)}
              />
            </label>
            <div className="row wrap">
              {taskPresets.map((preset) => (
                <Button
                  key={preset.label}
                  size="sm"
                  variant={task === preset.task ? "secondary" : "ghost"}
                  onClick={() => changeTask(preset.task)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <div className="spread row wrap">
              <Button
                variant="primary"
                loading={ev.loading}
                disabled={!task.trim()}
                onClick={() => void ev.run(buildContextRequest(task, CONTEXT_TURNS))}
              >
                {ev.loading ? "Evaluating…" : "Evaluate"}
              </Button>
              <GenerationControl
                task="context-task"
                label="Draft objective"
                prompt="Write a different, useful next-step objective for the agent working on this transcript. Focus on existing evidence or unfinished work. Do not invent new observations, executed tests, or requirements that conflict with the original user. Return only one to three sentences of plain text."
                context={{ currentObjective: task, transcript: CONTEXT_TURNS }}
                onGenerated={(text, result) => {
                  changeTask(text);
                  setGeneratedBy(`${result.provider} · ${result.model}`);
                }}
              />
            </div>
            {generatedBy && (
              <p className="small muted agents-no-margin">
                Draft: {generatedBy}. Evaluate to update the judgments.
              </p>
            )}
          </div>
        </Panel>

        <Panel className="agents-budget-panel">
          <PanelHeader
            title="Budget"
            aside={
              <Badge tone={selection.overBudget ? "red" : "green"}>
                {selection.overBudget ? "Over budget" : "Within budget"}
              </Badge>
            }
          />
          <div className="agents-panel-body stack">
            <div className="agents-budget-numbers">
              <div>
                <strong>{selection.estimatedTokens.toLocaleString()}</strong>
                <span>retained · est. tokens</span>
              </div>
              <span className="agents-budget-divider">/</span>
              <div>
                <strong>{budget.toLocaleString()}</strong>
                <span>budget · est. tokens</span>
              </div>
            </div>
            <label className="field">
              <span className="sr-only">Estimated context token budget</span>
              <input
                className="agents-range"
                type="range"
                min="64"
                max={rangeMax}
                step="1"
                value={budget}
                onChange={(event) => {
                  setBudget(Number(event.target.value));
                  setCopied(false);
                }}
              />
              <span className="agents-range-labels">
                <span>64</span>
                <span>{rangeMax.toLocaleString()}</span>
              </span>
            </label>
            <div className="agents-budget-meta">
              <span>
                <strong>{selection.characters.toLocaleString()}</strong> exact characters
              </span>
              <span>
                <strong>{retainedCharactersPercent}%</strong> of source
              </span>
            </div>
            {selection.overBudget ? (
              <div className="agents-overflow" role="status">
                <span>
                  Protected and pinned turns need ~{selection.protectedTokens.toLocaleString()}{" "}
                  tokens. Increase the budget or unpin optional turns. This context does{" "}
                  <strong>not</strong> fit.
                </span>
              </div>
            ) : (
              <p className="small muted agents-no-margin">
                Estimate: Unicode characters ÷ 4, rounded up. Includes objective, labels, and
                separators.
              </p>
            )}
          </div>
        </Panel>
      </div>

      <EvaluationBar evaluation={ev} label="Relevance evaluation" />

      <Panel>
        <PanelHeader
          title="Transcript"
          description={
            <>
              Synthetic source · {CONTEXT_TURNS.length} turns · {pairedTurns} call/result pairs
            </>
          }
          aside={
            <div className="row">
              <Badge tone="blue">{selection.retained.length} retained</Badge>
              <Badge>{selection.archived.length} recoverable</Badge>
            </div>
          }
        />
        <div className="agents-retention-map" aria-label="Source turns and retention status">
          {CONTEXT_TURNS.map((turn, index) => {
            const reason = selection.reasons[turn.id]!;
            return (
              <button
                type="button"
                key={turn.id}
                className={`agents-retention-segment agents-retention-${reason} ${selectedId === turn.id ? "agents-retention-active" : ""}`}
                style={{ flexGrow: renderTurn(turn).length }}
                title={`${index + 1}. ${turn.title} — ${reasonLabels[reason]}`}
                aria-label={`Inspect turn ${index + 1}, ${turn.title}, ${reasonLabels[reason]}`}
                aria-pressed={selectedId === turn.id}
                onClick={() => {
                  setSelectedId(turn.id);
                  setPreview("source");
                }}
              >
                <span>{index + 1}</span>
              </button>
            );
          })}
        </div>
        <div className="agents-retention-legend">
          <span>
            <i className="agents-key agents-key-protected" />
            Protected / pinned
          </span>
          <span>
            <i className="agents-key agents-key-retained" />
            Retained
          </span>
          <span>
            <i className="agents-key agents-key-archived" />
            Recoverable
          </span>
          <span className="muted">Oldest → newest</span>
        </div>
        <div className="agents-context-board">
          <div className="agents-source-column">
            <div className="agents-source-toolbar">
              <span className="agents-eyebrow">Source</span>
              <Segmented
                value={filter}
                onChange={setFilter}
                ariaLabel="Transcript turn filter"
                options={[
                  { value: "all", label: "All" },
                  { value: "retained", label: "Retained" },
                  { value: "archived", label: "Recoverable" },
                ]}
              />
            </div>
            <div className="agents-turn-list">
              {shownTurns.map((turn) => {
                const index = CONTEXT_TURNS.indexOf(turn);
                const reason = selection.reasons[turn.id]!;
                const retained = selection.retained.some((item) => item.id === turn.id);
                return (
                  <div
                    key={turn.id}
                    className={`agents-turn-row ${selectedId === turn.id ? "agents-turn-selected" : ""}`}
                  >
                    <button
                      type="button"
                      className="agents-turn-select"
                      aria-pressed={selectedId === turn.id}
                      onClick={() => {
                        setSelectedId(turn.id);
                        setPreview("source");
                      }}
                    >
                      <span className={`agents-turn-number ${retained ? "agents-turn-kept" : ""}`}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="agents-turn-label">
                        <strong>{turn.title}</strong>
                        <span>
                          {turn.kind === "exchange"
                            ? "Call + result"
                            : turn.kind === "instruction"
                              ? "User instruction"
                              : "Agent note"}{" "}
                          · ~{estimateTokens(renderTurn(turn))} tokens
                        </span>
                        <small className={retained ? "agents-kept-label" : ""}>
                          {reasonLabels[reason]}
                        </small>
                      </span>
                    </button>
                    {turn.protected ? (
                      <span className="agents-protected-icon" title={turn.protectionReason}>
                        <ShieldCheck size={15} />
                        <span className="sr-only">Protected instruction</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={`agents-pin-button ${pinnedIds.has(turn.id) ? "agents-is-pinned" : ""}`}
                        aria-label={`${pinnedIds.has(turn.id) ? "Unpin" : "Pin"} ${turn.title}`}
                        aria-pressed={pinnedIds.has(turn.id)}
                        title={
                          pinnedIds.has(turn.id) ? "Unpin this turn" : "Always retain this turn"
                        }
                        onClick={() => togglePin(turn.id)}
                      >
                        <Pin size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
              {shownTurns.length === 0 && (
                <p className="agents-list-empty">No turns in this view.</p>
              )}
            </div>
          </div>

          <div className="agents-preview-column">
            <div className="agents-preview-toolbar">
              <Segmented
                value={preview}
                onChange={setPreview}
                ariaLabel="Context preview"
                options={[
                  { value: "source", label: "Source turn" },
                  { value: "retained", label: "Assembled context" },
                ]}
              />
              {preview === "retained" && (
                <Button size="sm" variant="ghost" onClick={() => void copyContext()}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied" : "Copy text"}
                </Button>
              )}
            </div>
            {preview === "source" ? (
              <div className="agents-turn-detail">
                <div className="spread row wrap">
                  <div>
                    <span className="agents-eyebrow">
                      Turn {CONTEXT_TURNS.indexOf(selectedTurn) + 1}
                    </span>
                    <h3>{selectedTurn.title}</h3>
                  </div>
                  <Badge tone={selectedRetained ? "blue" : "neutral"}>
                    {reasonLabels[selectedReason]}
                  </Badge>
                </div>
                <div className="agents-turn-probabilities">
                  <Probability
                    value={judgments[selectedId]?.relevant}
                    label="P(relevant to objective)"
                  />
                  <Probability
                    value={judgments[selectedId]?.essential}
                    label="P(unique essential evidence)"
                  />
                </div>
                {selectedTurn.protected ? (
                  <div className="agents-source-note">{selectedTurn.protectionReason}</div>
                ) : (
                  <div className="agents-source-note">
                    <span>
                      {selectedRetained
                        ? "Retained. Source remains available."
                        : "Excluded from context. Pin to restore the whole turn."}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => togglePin(selectedTurn.id)}>
                      {pinnedIds.has(selectedTurn.id) ? <PinOff size={14} /> : <Pin size={14} />}
                      {pinnedIds.has(selectedTurn.id) ? "Unpin" : "Pin"}
                    </Button>
                  </div>
                )}
                <div className="agents-message-stack">
                  {selectedTurn.messages.map((message) => (
                    <div className="agents-message" key={message.id}>
                      <div className="agents-message-header">
                        <span>{message.role}</span>
                        {message.toolCallId && <span className="mono">{message.toolCallId}</span>}
                      </div>
                      <pre>{message.body}</pre>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="agents-assembled">
                <div className="agents-assembled-caption">
                  <span>
                    Source order · paired calls/results · {selection.characters.toLocaleString()}{" "}
                    characters
                  </span>
                </div>
                <pre tabIndex={0}>{selection.text}</pre>
              </div>
            )}
          </div>
        </div>
        <details className="agents-policy-footer">
          <summary>Selection rules</summary>
          <p>
            Keep user constraints and manual pins. Eligible optional turns have P(relevant) ≥ 35% or
            P(essential) ≥ 60%; rank by 65% relevance + 35% essential evidence, then recency. Add
            whole turns only while the estimated budget fits. The complete source stays recoverable.
            Changing the budget makes no API calls.
          </p>
        </details>
      </Panel>
    </div>
  );
}
