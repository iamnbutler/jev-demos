import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy, Pin, PinOff, ShieldCheck } from "lucide-react";
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
import { CONTEXT_TURNS, DEFAULT_CONTEXT_TASK, type ContextTurn } from "./context-data";
import {
  buildContextRequest,
  countCharacters,
  estimateTokens,
  readContextJudgments,
  renderContext,
  renderTurn,
  selectContext,
  type ContextJudgment,
  type RetentionReason,
} from "./context";
import "./agents.css";

const reasonLabels: Record<RetentionReason, string> = {
  protected: "Protected",
  pinned: "Pinned",
  selected: "Retained",
  budget: "Archived · budget",
  "low-signal": "Archived · low signal",
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

function ThreadTurn({
  turn,
  index,
  retained,
  reason,
  active,
  pinned,
  judgment,
  onPin,
}: {
  turn: ContextTurn;
  index: number;
  retained: boolean;
  reason: RetentionReason;
  active: boolean;
  pinned: boolean;
  judgment: ContextJudgment | undefined;
  onPin: (id: string) => void;
}) {
  const titleId = `context-title-${turn.id}`;
  const contentId = `context-content-${turn.id}`;
  const [disclosure, setDisclosure] = useState({ reason, expanded: reason !== "budget" });
  // Keep manual inspection until the retention reason changes, then restore that reason's default.
  if (disclosure.reason !== reason) setDisclosure({ reason, expanded: reason !== "budget" });
  const { expanded } = disclosure;
  return (
    <article
      id={`context-turn-${turn.id}`}
      className="agents-thread-turn"
      data-context-turn={turn.id}
      data-retained={retained}
      data-retention={reason}
      data-active={active}
      data-expanded={expanded}
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <header className="agents-thread-turn-header">
        <div className="agents-thread-turn-heading">
          <span className="agents-thread-number mono">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <h3 id={titleId}>
              <button
                type="button"
                className="agents-thread-toggle"
                aria-label={`${expanded ? "Collapse" : "Expand"} ${turn.title}`}
                aria-expanded={expanded}
                aria-controls={contentId}
                onClick={() => setDisclosure({ reason, expanded: !expanded })}
              >
                {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                <span>{turn.title}</span>
              </button>
            </h3>
            <p>
              {turn.kind === "exchange"
                ? "Call + result"
                : turn.kind === "instruction"
                  ? "User instruction"
                  : "Agent note"}{" "}
              · ~{estimateTokens(renderTurn(turn))} tokens
            </p>
          </div>
        </div>
        <div className="agents-thread-turn-actions">
          <Badge tone={turn.protected || pinned ? "purple" : retained ? "blue" : "neutral"}>
            {reasonLabels[reason]}
          </Badge>
          {turn.protected ? (
            <span className="agents-thread-protected" title={turn.protectionReason}>
              <ShieldCheck size={15} />
              <span className="sr-only">{turn.protectionReason}</span>
            </span>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`${pinned ? "Unpin" : "Pin"} ${turn.title}`}
              aria-pressed={pinned}
              onClick={() => onPin(turn.id)}
            >
              {pinned ? <PinOff size={14} /> : <Pin size={14} />}
              {pinned ? "Unpin" : "Pin"}
            </Button>
          )}
        </div>
      </header>
      <div id={contentId} className="agents-thread-turn-content" hidden={!expanded}>
        <div className="agents-thread-messages">
          {turn.messages.map((message) => (
            <div
              className="agents-chat-message"
              data-role={message.role}
              data-tool={Boolean(message.toolCallId)}
              key={message.id}
            >
              <div className="agents-chat-message-label">
                <strong>
                  {message.role === "tool"
                    ? "Tool result"
                    : message.toolCallId
                      ? "Assistant · tool call"
                      : message.role === "user"
                        ? "User"
                        : "Assistant"}
                </strong>
                {message.toolCallId && <span className="mono">{message.toolCallId}</span>}
              </div>
              <pre>{message.body}</pre>
            </div>
          ))}
        </div>
        <footer className="agents-thread-turn-footer">
          <div className="agents-thread-judgments">
            <Probability value={judgment?.relevant} label="P(relevant)" compact />
            <Probability value={judgment?.essential} label="P(essential)" compact />
          </div>
          {!retained && (
            <span className="agents-thread-recovery">
              Outside assembled context. Full source preserved.
            </span>
          )}
        </footer>
      </div>
    </article>
  );
}

export default function ContextDemo() {
  const ev = useEvaluation();
  const [task, setTask] = useState(DEFAULT_CONTEXT_TASK);
  const [budget, setBudget] = useState(1450);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState(CONTEXT_TURNS[0]!.id);
  const [preview, setPreview] = useState("thread");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [generatedBy, setGeneratedBy] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const threadScroll = useRef(0);
  const railTarget = useRef<{ id: string; top: number } | null>(null);
  const judgments = useMemo(() => readContextJudgments(ev.data, CONTEXT_TURNS), [ev.data]);
  const selection = useMemo(
    () => selectContext({ turns: CONTEXT_TURNS, task, budgetTokens: budget, judgments, pinnedIds }),
    [task, budget, judgments, pinnedIds],
  );
  const retainedIds = useMemo(
    () => new Set(selection.retained.map((turn) => turn.id)),
    [selection],
  );
  const fullText = renderContext(task, CONTEXT_TURNS);
  const rangeMax = Math.ceil(estimateTokens(fullText) / 64) * 64;
  const pairedTurns = CONTEXT_TURNS.filter((turn) => turn.kind === "exchange").length;
  const retainedCharactersPercent = Math.round(
    (selection.characters / countCharacters(fullText)) * 100,
  );

  useLayoutEffect(() => {
    if (preview === "thread" && threadRef.current)
      threadRef.current.scrollTop = threadScroll.current;
  }, [preview]);

  function changeTask(value: string) {
    setTask(value);
    setGeneratedBy(null);
    setCopied(false);
    setCopyError(null);
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
    setCopyError(null);
  }

  async function copyContext() {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(selection.text);
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyError("Copy failed. Open Assembled context to select the text.");
    }
  }

  function followThreadScroll() {
    const container = threadRef.current;
    if (!container || preview !== "thread") return;
    threadScroll.current = container.scrollTop;
    if (railTarget.current && Math.abs(container.scrollTop - railTarget.current.top) < 1) {
      setActiveId(railTarget.current.id);
      return;
    }
    railTarget.current = null;
    const focusLine =
      container.getBoundingClientRect().top + Math.min(80, container.clientHeight * 0.15);
    const cards = Array.from(container.querySelectorAll<HTMLElement>("[data-context-turn]"));
    const active = cards.find((card) => card.getBoundingClientRect().bottom > focusLine);
    if (active?.dataset.contextTurn) setActiveId(active.dataset.contextTurn);
  }

  function jumpToTurn(id: string) {
    const container = threadRef.current;
    const card = container?.querySelector<HTMLElement>(`[data-context-turn="${id}"]`);
    if (!container || !card) return;
    const top =
      container.scrollTop +
      card.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      16;
    container.scrollTo({ top, behavior: "auto" });
    threadScroll.current = container.scrollTop;
    railTarget.current = { id, top: container.scrollTop };
    setActiveId(id);
    card.focus({ preventScroll: true });
  }

  return (
    <div className="agents-context agents-context-workspace">
      <aside className="agents-context-sidebar" aria-label="Context controls">
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
                  setCopyError(null);
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
                Protected and pinned turns need ~{selection.protectedTokens.toLocaleString()}{" "}
                tokens. Increase the budget or unpin optional turns. This context does{" "}
                <strong>not</strong> fit.
              </div>
            ) : (
              <p className="small muted agents-no-margin">
                Estimate: Unicode characters ÷ 4, rounded up. Includes objective, labels, and
                separators.
              </p>
            )}
          </div>
        </Panel>

        <Panel className="agents-context-actions">
          <div className="agents-panel-body stack">
            <div className="row wrap">
              <Button
                variant="primary"
                loading={ev.loading}
                disabled={!task.trim()}
                onClick={() => void ev.run(buildContextRequest(task, CONTEXT_TURNS))}
              >
                {ev.loading ? "Evaluating…" : "Evaluate"}
              </Button>
              <Button onClick={() => void copyContext()}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy context"}
              </Button>
            </div>
            <EvaluationBar evaluation={ev} label="Relevance evaluation" />
            {copyError && (
              <p className="agents-copy-error" role="alert">
                {copyError}
              </p>
            )}
          </div>
          <details className="agents-policy-footer">
            <summary>Selection rules</summary>
            <p>
              Keep user constraints and manual pins. Eligible optional turns have P(relevant) ≥ 35%
              or P(essential) ≥ 60%; rank by 65% relevance + 35% essential evidence, then recency.
              Add whole turns only while the estimated budget fits. The complete source stays
              recoverable. Changing the budget makes no API calls.
            </p>
          </details>
        </Panel>
      </aside>

      <Panel className="agents-thread-panel">
        <PanelHeader
          title="Thread"
          description={
            <>
              Synthetic source · {CONTEXT_TURNS.length} turns · {pairedTurns} call/result pairs
            </>
          }
          aside={
            <div className="row wrap">
              <Badge tone="blue">{selection.retained.length} retained</Badge>
              <Badge>{selection.archived.length} recoverable</Badge>
            </div>
          }
        />
        <div className="agents-thread-toolbar">
          <Segmented
            value={preview}
            onChange={setPreview}
            ariaLabel="Context preview"
            options={[
              { value: "thread", label: "Full thread" },
              { value: "retained", label: "Assembled context" },
            ]}
          />
          {preview === "thread" ? (
            <div className="agents-thread-legend" aria-label="Retention legend">
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
            </div>
          ) : (
            <span className="agents-thread-output-count">
              {selection.characters.toLocaleString()} characters · ~
              {selection.estimatedTokens.toLocaleString()} tokens
            </span>
          )}
        </div>

        <div className="agents-thread-viewport" hidden={preview !== "thread"}>
          <div
            className="agents-thread-scroll"
            ref={threadRef}
            onScroll={followThreadScroll}
            role="region"
            aria-label="Complete source transcript"
            tabIndex={0}
          >
            {CONTEXT_TURNS.map((turn, index) => (
              <ThreadTurn
                key={turn.id}
                turn={turn}
                index={index}
                retained={retainedIds.has(turn.id)}
                reason={selection.reasons[turn.id]!}
                active={activeId === turn.id}
                pinned={pinnedIds.has(turn.id)}
                judgment={judgments[turn.id]}
                onPin={togglePin}
              />
            ))}
          </div>
          <nav className="agents-thread-rail" aria-label="Transcript overview">
            <span className="agents-thread-rail-label">Turn</span>
            <div className="agents-thread-rail-track">
              {CONTEXT_TURNS.map((turn, index) => (
                <button
                  type="button"
                  key={turn.id}
                  className="agents-thread-rail-marker"
                  data-retention={selection.reasons[turn.id]}
                  style={{ flexGrow: renderTurn(turn).length }}
                  aria-label={`Go to turn ${index + 1}: ${turn.title} (${reasonLabels[selection.reasons[turn.id]!]})`}
                  aria-current={activeId === turn.id ? "location" : undefined}
                  title={`${index + 1}. ${turn.title} — ${reasonLabels[selection.reasons[turn.id]!]}`}
                  onClick={() => jumpToTurn(turn.id)}
                >
                  {String(index + 1).padStart(2, "0")}
                </button>
              ))}
            </div>
            <span className="agents-thread-rail-end">End</span>
          </nav>
        </div>
        {preview === "retained" && (
          <div className="agents-context-output">
            {selection.overBudget && (
              <p className="agents-overflow">
                Protected and pinned turns exceed this budget. Increase it or remove optional pins
                before using this context.
              </p>
            )}
            <p className="agents-context-output-note">
              Retained source in chronological order. Calls and results stay paired.
            </p>
            <pre tabIndex={0} aria-label="Assembled context text">
              {selection.text}
            </pre>
          </div>
        )}
      </Panel>
    </div>
  );
}
