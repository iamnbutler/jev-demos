import { useState } from "react";
import {
  ArrowRight,
  CircleDot,
  EyeOff,
  FileText,
  Link2,
  Orbit,
  RotateCcw,
  Scan,
  Sparkles,
} from "lucide-react";
import type { GenerateResponse } from "../../../shared/api";
import {
  Badge,
  Button,
  EvaluationBar,
  GenerationControl,
  Panel,
  PanelHeader,
  Probability,
} from "../../components/ui";
import { getChoice, getNoul, useEvaluation } from "../../lib/jev";
import {
  buildDuplicateRequest,
  relationshipFor,
  relationshipLabels,
  type Relationship,
} from "./analysis";
import { draftPresets, reports } from "./data";
import "./duplicates.css";

const tones = {
  duplicate: "green",
  related: "blue",
  different: "neutral",
  unclear: "amber",
  unassessed: "neutral",
} as const;

export default function DuplicateDemo() {
  const [preset, setPreset] = useState("restart");
  const [title, setTitle] = useState(draftPresets[0].title);
  const [body, setBody] = useState(draftPresets[0].body);
  const [selected, setSelected] = useState("184");
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [generated, setGenerated] = useState<GenerateResponse | null>(null);
  const [generationPrompt, setGenerationPrompt] = useState(
    "Write a differently worded report about a stale preview session after restarting. Include a concrete trigger and recovery.",
  );
  const ev = useEvaluation();
  const current = reports.find((report) => report.id === selected)!;
  const ranked = [...reports].sort(
    (a, b) => (getNoul(ev.data, `same_${b.id}`) ?? 0) - (getNoul(ev.data, `same_${a.id}`) ?? 0),
  );
  const selection = getChoice(ev.data, `passage_${current.id}`)?.choice;
  const selectedPassage = selection?.startsWith("p")
    ? current.passages[Number(selection.slice(1))]
    : undefined;
  const matches = reports.filter(
    (report) => relationshipFor(ev.data, report.id) === "duplicate",
  ).length;
  const uncertain = reports.filter(
    (report) => relationshipFor(ev.data, report.id) === "unclear",
  ).length;

  function changeDraft(nextTitle: string, nextBody: string, nextPreset = "custom") {
    setTitle(nextTitle);
    setBody(nextBody);
    setPreset(nextPreset);
    setGenerated(null);
    setDismissed([]);
    ev.reset();
  }
  async function compare() {
    const result = await ev.run({
      ...buildDuplicateRequest({ id: preset, label: "", title, body }),
      cache: false,
    });
    if (result) {
      const first = [...reports].sort(
        (a, b) => (getNoul(result, `same_${b.id}`) ?? 0) - (getNoul(result, `same_${a.id}`) ?? 0),
      )[0];
      setSelected(first.id);
    }
  }
  function generateReport(text: string, response: GenerateResponse) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("The writer returned an unreadable report. Try another draft.");
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("title" in parsed) ||
      !("body" in parsed) ||
      typeof parsed.title !== "string" ||
      typeof parsed.body !== "string" ||
      parsed.body.length > 12000 ||
      parsed.title.length > 250
    )
      throw new Error("The draft did not match the report format. Try again.");
    changeDraft(parsed.title, parsed.body);
    setGenerated(response);
  }
  return (
    <div className="stack duplicate-demo">
      <div className="demo-toolbar">
        <div className="row wrap">
          <span className="small muted">Fern desktop · 12 example reports</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            changeDraft(draftPresets[0].title, draftPresets[0].body, "restart");
            setSelected("184");
          }}
        >
          <RotateCcw size={13} />
          Reset
        </Button>
      </div>
      <div className="duplicate-workspace">
        <Panel className="duplicate-compose">
          <PanelHeader title="Report" />
          <div className="duplicate-compose-body stack">
            <div className="field">
              <label className="field-label" htmlFor="duplicate-preset">
                Example
              </label>
              <select
                id="duplicate-preset"
                className="select"
                value={preset}
                onChange={(e) => {
                  const next = draftPresets.find((p) => p.id === e.target.value);
                  if (next) changeDraft(next.title, next.body, next.id);
                }}
              >
                {draftPresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                {preset === "custom" && <option value="custom">Your draft</option>}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="duplicate-title">
                Title
              </label>
              <input
                id="duplicate-title"
                className="input"
                value={title}
                maxLength={250}
                onChange={(e) => changeDraft(e.target.value, body)}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="duplicate-body">
                Description
              </label>
              <textarea
                id="duplicate-body"
                className="textarea"
                rows={6}
                maxLength={12000}
                value={body}
                onChange={(e) => changeDraft(title, e.target.value)}
              />
            </div>
            <Button
              variant="primary"
              loading={ev.loading}
              disabled={!title.trim() || body.trim().length < 10}
              onClick={compare}
            >
              <Scan size={15} />
              {ev.loading ? "Comparing…" : "Compare"}
              {!ev.loading && <ArrowRight size={14} />}
            </Button>
            {generated && (
              <p className="small muted">
                Drafted with {generated.model}.{" "}
                {ev.data ? "Assessed by Jev." : "Run Compare to assess it."}
              </p>
            )}
            <details className="duplicate-generate">
              <summary>
                <Sparkles size={12} /> Generate a report
              </summary>
              <div className="stack">
                <label className="field">
                  <span className="field-label">Prompt</span>
                  <textarea
                    className="textarea"
                    rows={3}
                    value={generationPrompt}
                    onChange={(e) => setGenerationPrompt(e.target.value)}
                    maxLength={3000}
                  />
                </label>
                <GenerationControl
                  task="report"
                  inputKey={JSON.stringify({ title, body, preset })}
                  context={{ project: "Fern desktop preview", reports }}
                  prompt={generationPrompt}
                  onGenerated={generateReport}
                  label="Draft"
                />
              </div>
            </details>
          </div>
        </Panel>
        <Panel className="duplicate-map-panel">
          <PanelHeader
            title="Relationships"
            description={
              ev.data
                ? `${matches} possible duplicates · ${uncertain} need more detail`
                : "Compare to see suggested relationships."
            }
            aside={
              <Badge tone={ev.data ? "green" : "neutral"}>
                {ev.data ? "Assessed" : "Not assessed"}
              </Badge>
            }
          />
          <div className="duplicate-graph">
            <svg
              viewBox="0 0 480 430"
              aria-label="Reports positioned by model probability of the same failure"
              role="group"
            >
              <circle cx="240" cy="214" r="80" className="duplicate-orbit" />
              <circle cx="240" cy="214" r="136" className="duplicate-orbit" />
              <circle cx="240" cy="214" r="173" className="duplicate-orbit outer" />
              {reports.map((report, index) => {
                const probability = getNoul(ev.data, `same_${report.id}`);
                const relation: Relationship = relationshipFor(ev.data, report.id);
                const angle = (index / reports.length) * Math.PI * 2 - Math.PI / 2;
                const closeness = probability ?? 0.12;
                const radius = 173 - closeness * 85;
                const x = 240 + Math.cos(angle) * radius;
                const y = 214 + Math.sin(angle) * radius;
                const hidden = dismissed.includes(report.id);
                return (
                  <g key={report.id}>
                    {ev.data && !hidden && relation !== "different" && (
                      <line
                        x1="240"
                        y1="214"
                        x2={x}
                        y2={y}
                        className={`duplicate-edge duplicate-${relation}`}
                      />
                    )}
                    <g
                      style={{ transform: `translate(${x}px, ${y}px)` }}
                      className={`duplicate-node duplicate-${relation} ${selected === report.id ? "selected" : ""} ${hidden ? "dismissed" : ""}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`Report ${report.id}: ${report.title}, ${relationshipLabels[relation]}`}
                      onClick={() => setSelected(report.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(report.id);
                        }
                      }}
                    >
                      <title>{report.title}</title>
                      <circle r={selected === report.id ? 26 : 23} />
                      <text className="duplicate-node-id" textAnchor="middle" dy="5">
                        #{report.id}
                      </text>
                    </g>
                  </g>
                );
              })}
              <g className="duplicate-center" transform="translate(240,214)">
                <circle r="41" />
                <circle r="47" />
                <text textAnchor="middle" y="6">
                  Draft
                </text>
              </g>
            </svg>
          </div>
          <p className="duplicate-map-selection">
            #{current.id} · {current.title}
          </p>
          <div className="duplicate-legend">
            <span>
              <i className="green" />
              Possible duplicate
            </span>
            <span>
              <i className="blue" />
              Related
            </span>
            <span>
              <i className="amber" />
              Unclear
            </span>
            <span>
              <i />
              Different / unassessed
            </span>
          </div>
          <div className="duplicate-map-note">
            <Orbit size={12} /> Closer = higher same-failure probability. Edges connect to the
            draft.
          </div>
        </Panel>
      </div>
      <EvaluationBar evaluation={ev} label="Jev" />
      <div className="duplicate-evidence-grid">
        <Panel>
          <PanelHeader
            title="Reports"
            description={
              ev.data ? "Sorted by same-failure probability." : "All reports are included."
            }
            aside={<Badge>{reports.length} sources</Badge>}
          />
          <div className="duplicate-corpus-list">
            {ranked.map((report) => {
              const relation = relationshipFor(ev.data, report.id);
              return (
                <button
                  type="button"
                  key={report.id}
                  className={`duplicate-report-row ${selected === report.id ? "selected" : ""}`}
                  onClick={() => setSelected(report.id)}
                >
                  <span className="mono duplicate-report-id">#{report.id}</span>
                  <span className="duplicate-report-copy">
                    <strong>{report.title}</strong>
                    <span>
                      {ev.data ? relationshipLabels[relation] : report.area}
                      {dismissed.includes(report.id) ? " · edge hidden" : ""}
                    </span>
                  </span>
                  <Probability compact value={getNoul(ev.data, `same_${report.id}`)} />
                </button>
              );
            })}
          </div>
        </Panel>
        <Panel>
          <PanelHeader
            title={
              <span className="row">
                <FileText size={14} /> Source #{current.id}
              </span>
            }
            aside={
              <Badge tone={tones[relationshipFor(ev.data, current.id)]}>
                {relationshipLabels[relationshipFor(ev.data, current.id)]}
              </Badge>
            }
          />
          <div className="duplicate-source">
            <h3>{current.title}</h3>
            <p className="duplicate-source-meta">
              {current.area} <span>·</span> {current.platform}
            </p>
            <p className="duplicate-source-body">{current.body}</p>
            {selectedPassage && (
              <div className="duplicate-passage">
                <span>
                  <Link2 size={12} /> Selected evidence
                </span>
                <blockquote>{selectedPassage}</blockquote>
              </div>
            )}
            <div className="duplicate-source-stats">
              <Probability value={getNoul(ev.data, `same_${current.id}`)} label="Same failure" />
              {getChoice(ev.data, `relationship_${current.id}`) && (
                <span className="small muted">
                  Choice confidence:{" "}
                  {Math.round(getChoice(ev.data, `relationship_${current.id}`)!.confidence * 100)}%
                </span>
              )}
            </div>
            {ev.data && relationshipFor(ev.data, current.id) !== "different" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setDismissed((previous) =>
                    previous.includes(current.id)
                      ? previous.filter((id) => id !== current.id)
                      : [...previous, current.id],
                  )
                }
              >
                {dismissed.includes(current.id) ? <RotateCcw size={13} /> : <EyeOff size={13} />}
                {dismissed.includes(current.id) ? "Restore suggested edge" : "Hide suggested edge"}
              </Button>
            )}
            <div className="duplicate-source-foot">
              <CircleDot size={13} />
              <p>Suggested relationships are local. No reports are merged.</p>
            </div>
          </div>
        </Panel>
      </div>
      <div className="surface-note">
        <FileText size={14} />
        <p>Fictional reports. Jev compares the draft with all 12 sources.</p>
      </div>
    </div>
  );
}
