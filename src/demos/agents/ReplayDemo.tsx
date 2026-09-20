import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Clock3, Pause, Play, RotateCcw, Square } from "lucide-react";
import { Badge, Button, EvaluationBar, Panel, PanelHeader, Probability } from "../../components/ui";
import { useEvaluation } from "../../lib/jev";
import { RUN_TRACES } from "./replay-data";
import {
  buildReplayRequest,
  checkpointLabel,
  readReplayJudgment,
  REPLAY_SIGNALS,
  SIGNAL_LABELS,
  summarizeReplay,
  type ReplayAssessment,
  type ReplaySignal,
} from "./replay";
import "./agents.css";

const signalDescriptions: Record<ReplaySignal, string> = {
  newEvidence: "A new observation, source change, or useful failure.",
  repetition: "A failed approach repeated without a relevant change.",
  contradiction: "A claim or behavior conflicts with visible evidence.",
  replan: "A change of approach or evidence check is warranted.",
};

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function ReplayDemo() {
  const ev = useEvaluation();
  const [traceId, setTraceId] = useState(RUN_TRACES[0]!.id);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [assessments, setAssessments] = useState<Record<number, ReplayAssessment>>({});
  const [scanning, setScanning] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const scanVersion = useRef(0);
  const trace = RUN_TRACES.find((item) => item.id === traceId)!;
  const event = trace.events[playhead]!;
  const current = assessments[playhead];
  const summary = summarizeReplay(assessments, playhead);
  const checkpoint = checkpointLabel(current?.judgment);
  const busy = scanning || ev.loading;
  const selectedEvaluation = {
    ...ev,
    data: current?.response ?? null,
    request: current?.request ?? (activeIndex === playhead ? ev.request : null),
    loading: activeIndex === playhead && ev.loading,
    error: activeIndex === playhead ? ev.error : null,
  };

  useEffect(
    () => () => {
      scanVersion.current++;
    },
    [],
  );

  useEffect(() => {
    if (!playing || playhead >= trace.events.length - 1) return;
    const timer = window.setTimeout(() => {
      setPlayhead((index) => Math.min(index + 1, trace.events.length - 1));
      if (playhead + 1 === trace.events.length - 1) setPlaying(false);
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [playing, playhead, trace.events.length]);

  function changeTrace(value: string) {
    scanVersion.current++;
    ev.reset();
    setTraceId(value);
    setAssessments({});
    setPlayhead(0);
    setPlaying(false);
    setScanning(false);
    setActiveIndex(null);
    setScanProgress(0);
  }

  async function evaluateStep(index: number, version: number) {
    const request = buildReplayRequest(trace, index);
    setActiveIndex(index);
    setAssessments((items) => {
      const next = { ...items };
      delete next[index];
      return next;
    });
    const response = await ev.run(request);
    if (!response || scanVersion.current !== version) return false;
    setAssessments((items) => ({
      ...items,
      [index]: { index, request, response, judgment: readReplayJudgment(response) },
    }));
    return true;
  }

  async function evaluateCurrent() {
    setPlaying(false);
    const version = ++scanVersion.current;
    await evaluateStep(playhead, version);
  }

  async function scanRun() {
    const version = ++scanVersion.current;
    setPlaying(false);
    setScanning(true);
    setScanProgress(0);
    setAssessments({});
    for (let index = 0; index < trace.events.length; index++) {
      if (scanVersion.current !== version) break;
      setPlayhead(index);
      const succeeded = await evaluateStep(index, version);
      if (!succeeded) break;
      setScanProgress(index + 1);
    }
    if (scanVersion.current === version) setScanning(false);
  }

  function stopScan() {
    scanVersion.current++;
    ev.reset();
    setScanning(false);
  }

  function jumpTo(index: number) {
    setPlaying(false);
    setPlayhead(index);
  }

  return (
    <div className="stack agents-replay">
      <Panel>
        <div className="agents-replay-controls">
          <label className="agents-run-selector">
            <span className="field-label">Run</span>
            <select
              className="select"
              value={traceId}
              disabled={busy}
              onChange={(e) => changeTrace(e.target.value)}
            >
              {RUN_TRACES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <div className="row wrap">
            <Button
              variant="primary"
              loading={ev.loading && !scanning}
              disabled={scanning}
              onClick={() => void evaluateCurrent()}
            >
              Evaluate event
            </Button>
            <Button
              loading={scanning}
              disabled={ev.loading && !scanning}
              onClick={() => void scanRun()}
            >
              {scanning ? `Scanning ${scanProgress}/${trace.events.length}` : "Scan run"}
            </Button>
            {scanning && (
              <Button size="sm" variant="ghost" onClick={stopScan}>
                <Square size={12} />
                Stop
              </Button>
            )}
          </div>
        </div>
        <p className="agents-run-provenance">
          Synthetic trace · {trace.events.length} events · each evaluation sees the current event
          and its past.
        </p>
      </Panel>

      <Panel className="agents-playback-panel">
        <PanelHeader
          title="Events"
          description={trace.task}
          aside={<Badge tone={checkpoint.tone}>{checkpoint.text}</Badge>}
        />
        <div className="agents-playback-toolbar">
          <div className="row">
            <Button
              size="sm"
              disabled={busy}
              aria-label={playing ? "Pause trace playback" : "Play trace playback"}
              onClick={() => {
                if (!playing && playhead === trace.events.length - 1) setPlayhead(0);
                setPlaying((value) => !value);
              }}
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
              {playing ? "Pause" : "Play"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || playhead === 0}
              aria-label="Previous event"
              onClick={() => jumpTo(playhead - 1)}
            >
              <ArrowLeft size={15} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || playhead === trace.events.length - 1}
              aria-label="Next event"
              onClick={() => jumpTo(playhead + 1)}
            >
              <ArrowRight size={15} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              aria-label="Rewind to the first event"
              onClick={() => jumpTo(0)}
            >
              <RotateCcw size={14} />
            </Button>
          </div>
          <label className="agents-playhead-slider">
            <span className="sr-only">Replay event</span>
            <input
              className="agents-range"
              type="range"
              min="0"
              max={trace.events.length - 1}
              value={playhead}
              disabled={busy}
              onChange={(e) => jumpTo(Number(e.target.value))}
            />
            <span className="mono">
              {String(playhead + 1).padStart(2, "0")} / {trace.events.length}
            </span>
          </label>
          <span className="agents-replay-clock">
            <Clock3 size={14} />
            {formatTime(event.at)} <span className="muted">source time</span>
          </span>
        </div>
        <div className="agents-signal-matrix-wrap">
          <table className="agents-signal-matrix">
            <caption className="sr-only">
              Jev probability for each signal at every visible event. An em dash means not evaluated
              or beyond the playhead.
            </caption>
            <thead>
              <tr>
                <th scope="col">Event</th>
                {trace.events.map((item, index) => (
                  <th
                    scope="col"
                    key={item.id}
                    className={index === playhead ? "agents-matrix-current" : ""}
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => jumpTo(index)}
                      aria-label={`Go to event ${index + 1}`}
                      aria-pressed={index === playhead}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {REPLAY_SIGNALS.map((signal) => (
                <tr key={signal}>
                  <th scope="row">{SIGNAL_LABELS[signal]}</th>
                  {trace.events.map((item, index) => {
                    const value =
                      index <= playhead ? assessments[index]?.judgment[signal] : undefined;
                    return (
                      <td
                        key={item.id}
                        className={`${index === playhead ? "agents-matrix-current" : ""} ${index > playhead ? "agents-matrix-future" : ""}`}
                      >
                        <span
                          className={`agents-matrix-value agents-signal-${signal} ${value === undefined ? "agents-matrix-empty" : ""}`}
                          style={{ "--agents-signal-strength": value ?? 0 } as React.CSSProperties}
                          title={
                            value === undefined
                              ? index > playhead
                                ? "Beyond the playhead"
                                : "Not evaluated"
                              : `P(${SIGNAL_LABELS[signal]}) = ${(value * 100).toFixed(1)}%`
                          }
                        >
                          {value === undefined ? "—" : `${Math.round(value * 100)}%`}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="agents-matrix-caption">
          <span>Model probabilities through event {playhead + 1}.</span>
          <span>Future events are excluded.</span>
        </div>
      </Panel>

      <div className="agents-replay-detail-grid">
        <Panel className="agents-event-panel">
          <PanelHeader
            title={
              <>
                <span className="agents-event-number">{String(playhead + 1).padStart(2, "0")}</span>
                {event.title}
              </>
            }
            description={
              <span>
                {event.kind === "tool"
                  ? "Tool"
                  : event.kind === "user"
                    ? "User instruction"
                    : `Agent ${event.kind}`}{" "}
                · {formatTime(event.at)}
              </span>
            }
          />
          {(event.exitCode !== undefined || event.declaredStatus) && (
            <div className="agents-event-status">
              {event.exitCode !== undefined ? (
                <>
                  <Badge tone={event.exitCode === 0 ? "green" : "red"}>
                    Recorded exit code: {event.exitCode}
                  </Badge>
                  <span>Process status; inspect the body for the result.</span>
                </>
              ) : event.declaredStatus ? (
                <>
                  <Badge tone="blue">Declared: {event.declaredStatus}</Badge>
                  <span>Check the claim against the evidence.</span>
                </>
              ) : null}
            </div>
          )}
          {event.command && (
            <div className="agents-event-command">
              <span>$</span>
              <code>{event.command}</code>
            </div>
          )}
          <pre className="agents-event-body" tabIndex={0}>
            {event.body}
          </pre>
          <div className="agents-prefix-footer">
            <span>
              Model input: {playhead} prior event{playhead === 1 ? "" : "s"} + this event. Later
              events are omitted.
            </span>
          </div>
          <EvaluationBar evaluation={selectedEvaluation} label="Event evaluation" />
        </Panel>

        <Panel className="agents-checkpoint-panel">
          <PanelHeader title="Signals" />
          <div className="agents-signal-cards">
            {REPLAY_SIGNALS.map((signal) => (
              <div className={`agents-signal-card agents-signal-${signal}`} key={signal}>
                <Probability value={current?.judgment[signal]} label={SIGNAL_LABELS[signal]} />
                <p>{signalDescriptions[signal]}</p>
              </div>
            ))}
          </div>
          <div className="agents-temporal-summary">
            <span className="agents-eyebrow">Through event {playhead + 1}</span>
            <div className="agents-summary-grid">
              <div>
                <strong>
                  {summary.assessed}/{playhead + 1}
                </strong>
                <span>events assessed</span>
              </div>
              <div>
                <strong>{summary.evidenceSignals}</strong>
                <span>evidence signals</span>
              </div>
              <div>
                <strong>{summary.conflictSignals}</strong>
                <span>conflict signals</span>
              </div>
              <div>
                <strong>{summary.replanSignals}</strong>
                <span>replan signals</span>
              </div>
            </div>
            {summary.possibleStall && (
              <div className="agents-stall-notice">
                <Badge tone="amber">Possible stall</Badge>
                <span>P(repetition) ≥ 70% in at least two of the last three events.</span>
              </div>
            )}
            <p className="small muted">
              Counts: P(signal) ≥ 70%. Unassessed events excluded. Playback makes no API calls.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
