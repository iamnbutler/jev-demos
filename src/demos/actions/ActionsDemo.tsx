import { useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import type { GenerateResponse } from "../../../shared/api";
import { AnnotatedFile, type SourceMark, type SourceNote } from "../../components/DiffView";
import {
  Badge,
  Button,
  CodeBlock,
  EvaluationBar,
  GenerationControl,
  Panel,
  PanelHeader,
  Probability,
  Segmented,
} from "../../components/ui";
import { getChoice, getNoul, useEvaluation } from "../../lib/jev";
import {
  buildActionsRequest,
  compareWorkflow,
  effectiveFacts,
  parseWorkflow,
  PEER_QUESTION_IDS,
  repositoryInventories,
  scriptCoverage,
} from "./analysis";
import type { Observation } from "./analysis";
import { CANDIDATE_PATH, REPOSITORY_FILES, REPOSITORY_NAME, WORKFLOW_SCENES } from "./data";
import { workflowAnnotations, type WorkflowInlineItem } from "./workflow-annotations";
import "./actions.css";

const roleNames: Record<string, string> = {
  validation: "Package validation",
  publish: "Registry publishing",
  documentation: "Documentation",
  package_build: "Package build",
  other: "Other / ambiguous",
};

const categories = [
  { value: "all", label: "All" },
  { value: "toolchain", label: "Toolchain" },
  { value: "refs", label: "Action refs" },
  { value: "permissions", label: "Permissions" },
  { value: "coverage", label: "Scripts" },
];

const sceneNames: Record<string, string> = {
  drift: "Copied CI",
  exception: "Publishing exception",
  aligned: "Aligned CI",
  invalid: "Invalid YAML",
};

function cleanGeneratedYaml(text: string) {
  const fenced = text.trim().match(/^```(?:ya?ml)?\s*\n([\s\S]*?)\n```$/i);
  return (fenced?.[1] ?? text.trim()) + "\n";
}

function sourceExcerpt(content: string, line: number) {
  const lines = content.replace(/\n$/, "").split("\n");
  const start = Math.max(0, line - 3);
  return { code: lines.slice(start, line + 2).join("\n"), startLine: start + 1 };
}

export default function ActionsDemo() {
  const evaluation = useEvaluation();
  const [mode, setMode] = useState("scan");
  const [editorView, setEditorView] = useState("annotated");
  const [sceneId, setSceneId] = useState(WORKFLOW_SCENES[0].id);
  const [yaml, setYaml] = useState(WORKFLOW_SCENES[0].yaml);
  const [purpose, setPurpose] = useState(WORKFLOW_SCENES[0].purpose);
  const [selectedPath, setSelectedPath] = useState(REPOSITORY_FILES[0].path);
  const [selectedObservation, setSelectedObservation] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const [generatedBy, setGeneratedBy] = useState<Pick<
    GenerateResponse,
    "provider" | "model"
  > | null>(null);
  const [editedSinceScan, setEditedSinceScan] = useState(false);
  const [scannedInput, setScannedInput] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLDivElement>(null);
  const evidenceTriggerRef = useRef<HTMLButtonElement | null>(null);

  const parsed = useMemo(() => parseWorkflow(yaml), [yaml]);
  const facts = useMemo(() => effectiveFacts(parsed), [parsed]);
  const observations = useMemo(() => compareWorkflow(parsed), [parsed]);
  const inventories = useMemo(() => repositoryInventories(), []);
  const selectedFile =
    REPOSITORY_FILES.find((file) => file.path === selectedPath) ?? REPOSITORY_FILES[0];
  const activeObservation = observations.find(
    (observation) => observation.id === selectedObservation,
  );
  const highlightedLines =
    activeObservation?.references
      .filter((reference) => reference.file === selectedPath)
      .map((reference) => reference.line) ?? [];
  const filteredObservations = observations.filter(
    (observation) => category === "all" || observation.category === category,
  );
  const currentInput = JSON.stringify([yaml, purpose]);
  const currentData = scannedInput === currentInput ? evaluation.data : null;
  const inlineItems = useMemo(
    () => workflowAnnotations(yaml, parsed, observations, facts, currentData),
    [yaml, parsed, observations, facts, currentData],
  );
  const inlineGroups = useMemo(() => {
    const groups = new Map<number, WorkflowInlineItem[]>();
    for (const item of inlineItems) groups.set(item.line, [...(groups.get(item.line) ?? []), item]);
    return [...groups.entries()];
  }, [inlineItems]);
  const lineMarks = useMemo<SourceMark[]>(() => {
    const priority = { red: 4, amber: 3, blue: 2, purple: 2, neutral: 1 };
    return inlineGroups
      .filter(([line]) => line > 0)
      .map(([line, items]) => ({
        start: line,
        end: line,
        tone: [...items].sort((a, b) => priority[b.tone] - priority[a.tone])[0].tone,
      }));
  }, [inlineGroups]);
  const roles = getChoice(currentData, "candidate_role");
  const sourcePeers = inventories
    .map((inventory) => ({
      ...inventory,
      probability: getNoul(currentData, PEER_QUESTION_IDS[inventory.file.path]),
    }))
    .sort((a, b) => (b.probability ?? -1) - (a.probability ?? -1));
  const selectedWorkflow = inventories.find((inventory) => inventory.file.path === selectedPath);
  const coverage = selectedWorkflow ? scriptCoverage(parsed, selectedWorkflow.parsed) : [];
  const triggerText = parsed.triggers.join(", ") || "Not parsed";
  const writePermission = facts.some(
    (fact) => fact.kind === "permission" && (fact.value === "write" || fact.value === "write-all"),
  );
  const judgmentCards = [
    {
      key: "intent_mismatch",
      title: "Misses the intent",
      description: "A stated requirement is absent or contradicted.",
    },
    {
      key: "documented_exception",
      title: "Publishing exception applies",
      description: "Node/npm use follows the written publishing policy.",
    },
    {
      key: "reusable_setup",
      title: "Shared setup fits",
      description: "The local action covers the required package setup.",
    },
    ...(writePermission
      ? [
          {
            key: "expanded_permissions_justified",
            title: "Write scopes are justified",
            description: "Each write permission has a supported purpose.",
          },
        ]
      : []),
  ];

  function invalidate() {
    if (scannedInput !== null || evaluation.loading) setEditedSinceScan(true);
    setScannedInput(null);
    setSelectedObservation(null);
    evaluation.reset();
  }

  function changeYaml(value: string) {
    invalidate();
    setSceneId("custom");
    setYaml(value);
  }

  function loadScene(id: string) {
    const next = WORKFLOW_SCENES.find((item) => item.id === id);
    if (!next) return;
    invalidate();
    setSceneId(next.id);
    setYaml(next.yaml);
    setPurpose(next.purpose);
    setGeneratedBy(null);
    setCategory("all");
    setEditorView("annotated");
  }

  function revealObservation(observation: Observation, trigger?: HTMLButtonElement) {
    if (selectedObservation === observation.id) {
      setSelectedObservation(null);
      return;
    }
    setSelectedObservation(observation.id);
    if (observation.references[0]) setSelectedPath(observation.references[0].file);
    if (trigger && observation.references[0]) {
      evidenceTriggerRef.current = trigger;
      requestAnimationFrame(() => {
        if (!sourceRef.current) return;
        sourceRef.current.scrollTop = Math.max(0, (observation.references[0].line - 5) * 22);
        sourceRef.current.scrollIntoView({ block: "center" });
      });
    }
    const editor = editorRef.current;
    if (editor && observation.candidate.file === CANDIDATE_PATH) {
      const lines = yaml.split("\n");
      const start =
        lines.slice(0, observation.candidate.line - 1).join("\n").length +
        (observation.candidate.line > 1 ? 1 : 0);
      editor.setSelectionRange(start, start + (lines[observation.candidate.line - 1]?.length ?? 0));
      editor.scrollTop = Math.max(0, (observation.candidate.line - 5) * 22);
      if (gutterRef.current) gutterRef.current.scrollTop = editor.scrollTop;
    }
  }

  async function scan() {
    if (parsed.errors.length || !purpose.trim()) return;
    setScannedInput(currentInput);
    setEditedSinceScan(false);
    setEditorView("annotated");
    await evaluation.run(buildActionsRequest(yaml, purpose));
  }

  function useGenerated(text: string, response: GenerateResponse) {
    invalidate();
    setSceneId("custom");
    setGeneratedBy({ provider: response.provider, model: response.model });
    setYaml(cleanGeneratedYaml(text));
    setEditorView("annotated");
  }

  const inlineNotes: SourceNote[] = inlineGroups.map(([line, items]) => ({
    id: `workflow-line-${line}`,
    line,
    content: (
      <div className="actions-inline-group">
        {items.map((item) => (
          <details
            className={`actions-inline-item actions-tone-${item.tone}`}
            key={item.id}
            data-workflow-note={item.id}
            open={item.kind === "parse" ? true : undefined}
          >
            <summary>
              <span className="actions-inline-kind">
                {item.kind === "judgment" ? "Jev" : item.kind === "parse" ? "Parser" : "Exact"}
              </span>
              <strong>{item.title}</strong>
              {item.probability !== undefined && (
                <span className="actions-inline-probability">
                  {Math.round(item.probability * 100)}%
                </span>
              )}
            </summary>
            <div className="actions-inline-detail">
              <p>{item.detail}</p>
              {item.kind === "judgment" && (
                <span className="actions-inline-scope">P(true) · workflow-wide assessment</span>
              )}
              {item.observation && (
                <div className="actions-inline-values">
                  <span>
                    Candidate: <code>{item.observation.candidate.value}</code>
                  </span>
                  {item.observation.references.length > 0 && (
                    <span>
                      Repository:{" "}
                      <code>
                        {[
                          ...new Set(
                            item.observation.references.map((reference) => reference.value),
                          ),
                        ].join(" / ")}
                      </code>
                    </span>
                  )}
                </div>
              )}
              {item.observation?.references.length ? (
                <button
                  type="button"
                  className="actions-inline-source"
                  onClick={(event) => revealObservation(item.observation!, event.currentTarget)}
                >
                  Compare source <ArrowRight size={13} />
                  <code>
                    {item.observation.references[0].file.split("/").pop()}:
                    {item.observation.references[0].line}
                  </code>
                </button>
              ) : null}
            </div>
          </details>
        ))}
      </div>
    ),
  }));

  return (
    <div className="actions-demo stack">
      <div className="actions-toolbar">
        <div className="row wrap">
          <label className="field-label" htmlFor="actions-scene">
            Example
          </label>
          <select
            id="actions-scene"
            className="select actions-scene"
            value={sceneId}
            onChange={(event) => loadScene(event.target.value)}
          >
            {WORKFLOW_SCENES.map((item) => (
              <option value={item.id} key={item.id}>
                {sceneNames[item.id]}
              </option>
            ))}
            {sceneId === "custom" && <option value="custom">Edited workflow</option>}
          </select>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "scan", label: "Scan" },
              { value: "compose", label: "Compose" },
            ]}
            ariaLabel="Actions demo mode"
          />
        </div>
        <div className="row wrap">
          {editedSinceScan && <Badge tone="amber">Edited · scan again</Badge>}
          <Button
            variant="primary"
            onClick={() => void scan()}
            loading={evaluation.loading}
            disabled={parsed.errors.length > 0 || !purpose.trim()}
          >
            {currentData ? "Rescan with Jev" : "Scan with Jev"}
          </Button>
        </div>
      </div>
      <p className="actions-provenance">Synthetic repository · workflows are not executed</p>
      {(evaluation.loading || evaluation.request || evaluation.error) && (
        <EvaluationBar evaluation={evaluation} label="Jev" />
      )}

      <div className="actions-workbench">
        <Panel className="actions-candidate">
          <PanelHeader
            title="Candidate"
            aside={
              <Badge tone={parsed.errors.length ? "red" : "neutral"}>
                {parsed.errors.length
                  ? "Parse error"
                  : `Parsed · ${parsed.jobs.length} ${parsed.jobs.length === 1 ? "job" : "jobs"}`}
              </Badge>
            }
          />
          <div className="actions-intent">
            <label className="field-label" htmlFor="actions-purpose">
              Intent
            </label>
            <textarea
              id="actions-purpose"
              className="textarea actions-purpose"
              rows={3}
              value={purpose}
              onChange={(event) => {
                invalidate();
                setPurpose(event.target.value);
                setSceneId("custom");
              }}
            />
            {mode === "compose" && (
              <div className="actions-generation">
                <GenerationControl
                  task="workflow"
                  context={{ repository: REPOSITORY_FILES, currentCandidate: yaml, purpose }}
                  prompt={`Write one GitHub Actions workflow YAML file for this purpose: ${purpose}\nUse the supplied repository policy, scripts, and existing local setup action where appropriate. Existing versions are reference values, not claims about latest releases. Keep deliberate publishing exceptions. Return only complete YAML with no markdown fences. Do not propose schedules or run any workflow.`}
                  onGenerated={useGenerated}
                  label="Draft workflow"
                />
                <p className="small muted">
                  The writer drafts YAML; Scan sends it to Jev for a separate evaluation.
                </p>
              </div>
            )}
          </div>
          <div className="actions-editor-heading">
            <div>
              <span className="mono">candidate.yml</span>
              {editorView === "annotated" && (
                <span className="actions-source-legend">
                  Exact differences · Jev assesses the workflow
                </span>
              )}
              {generatedBy && (
                <span className="actions-draft-label">Drafted by {generatedBy.model}</span>
              )}
            </div>
            <Segmented
              value={editorView}
              onChange={setEditorView}
              ariaLabel="Workflow source view"
              options={[
                { value: "annotated", label: "Annotations" },
                { value: "edit", label: "Edit YAML" },
              ]}
            />
          </div>
          {editorView === "annotated" ? (
            <div className="actions-annotated-source">
              <AnnotatedFile
                name={CANDIDATE_PATH}
                code={yaml}
                language="yaml"
                notes={inlineNotes}
                marks={lineMarks}
              />
            </div>
          ) : (
            <div className="actions-editor-wrap">
              <div ref={gutterRef} className="actions-editor-gutter" aria-hidden="true">
                {yaml.split("\n").map((_, index) => (
                  <span
                    key={index}
                    className={
                      parsed.errors.some((error) => error.line === index + 1)
                        ? "actions-line-error"
                        : activeObservation?.candidate.line === index + 1
                          ? "actions-line-selected"
                          : ""
                    }
                  >
                    {index + 1}
                  </span>
                ))}
              </div>
              <textarea
                aria-label="Candidate workflow YAML"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="actions-code-editor"
                ref={editorRef}
                value={yaml}
                wrap="off"
                onChange={(event) => changeYaml(event.target.value)}
                onScroll={(event) => {
                  if (gutterRef.current)
                    gutterRef.current.scrollTop = event.currentTarget.scrollTop;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Tab" && !event.shiftKey) {
                    event.preventDefault();
                    const start = event.currentTarget.selectionStart;
                    const end = event.currentTarget.selectionEnd;
                    changeYaml(yaml.slice(0, start) + "  " + yaml.slice(end));
                    requestAnimationFrame(() =>
                      editorRef.current?.setSelectionRange(start + 2, start + 2),
                    );
                  }
                }}
              />
            </div>
          )}
          {parsed.errors.length > 0 && editorView === "edit" && (
            <div className="actions-parse-errors" role="alert">
              {parsed.errors.slice(0, 3).map((error, index) => (
                <p key={index}>
                  <strong>
                    Line {error.line}:{error.column}
                  </strong>{" "}
                  {error.message}
                </p>
              ))}
              <p>Fix the YAML before scanning with Jev.</p>
            </div>
          )}
          <div className="actions-candidate-footer">
            <span>
              on: <code>{triggerText}</code>
            </span>
            <span>
              {editorView === "edit"
                ? "Tab: indent · Shift+Tab: leave"
                : "Expand a note for evidence · percentages are P(true)"}
            </span>
          </div>
        </Panel>

        <Panel className="actions-repository">
          <PanelHeader
            title="Repository"
            aside={<span className="small muted">{REPOSITORY_NAME}</span>}
          />
          <nav className="actions-file-list" aria-label="Supplied repository files">
            {REPOSITORY_FILES.map((file) => (
              <button
                type="button"
                className={`actions-file ${selectedPath === file.path ? "actions-file-selected" : ""}`}
                onClick={() => {
                  setSelectedPath(file.path);
                  setSelectedObservation(null);
                }}
                key={file.path}
                aria-pressed={selectedPath === file.path}
                title={file.path}
              >
                {file.label}
              </button>
            ))}
          </nav>
          <div className="actions-source-title">
            <span className="mono">{selectedFile.path}</span>
          </div>
          <p className="actions-file-purpose">{selectedFile.purpose}</p>
          <div className="actions-source-code" ref={sourceRef}>
            <AnnotatedFile
              name={selectedFile.path}
              code={selectedFile.content}
              language={
                selectedFile.kind === "manifest"
                  ? "json"
                  : selectedFile.kind === "policy"
                    ? "markdown"
                    : "yaml"
              }
              marks={highlightedLines.map((line) => ({ start: line, end: line, tone: "blue" }))}
              selectedLines={
                highlightedLines[0]
                  ? { start: highlightedLines[0], end: highlightedLines[0] }
                  : null
              }
            />
          </div>
          {activeObservation && (
            <div className="actions-source-evidence">
              <strong>{activeObservation.title}</strong>
              <p>{activeObservation.detail}</p>
              <span className="actions-inline-scope">
                Candidate line {activeObservation.candidate.line} · source line{" "}
                {highlightedLines[0] ?? "unavailable"}
              </span>
              {evidenceTriggerRef.current && (
                <button
                  type="button"
                  className="actions-inline-source"
                  onClick={() => {
                    evidenceTriggerRef.current?.focus({ preventScroll: true });
                    evidenceTriggerRef.current?.scrollIntoView({ block: "center" });
                  }}
                >
                  Back to candidate line {activeObservation.candidate.line}
                </button>
              )}
            </div>
          )}
          {coverage.length > 0 && !parsed.errors.length && (
            <div className="actions-coverage">
              <span className="field-label">Candidate script coverage</span>
              <div className="row wrap">
                {coverage.map((fact) => (
                  <span
                    className={`actions-coverage-item ${fact.included ? "actions-coverage-present" : ""}`}
                    key={fact.key}
                  >
                    {fact.included && <Check size={13} />}
                    <code>{fact.key}</code>
                    <span>{fact.included ? "present" : "absent"}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <details className="actions-audit">
        <summary>Comparison inventory and workflow judgments</summary>
        <div className="actions-results">
          <Panel className="actions-observations">
            <PanelHeader
              title="Differences"
              aside={<span className="small muted">{observations.length} observations</span>}
            />
            <div className="actions-result-tabs">
              <Segmented
                value={category}
                onChange={setCategory}
                options={categories}
                ariaLabel="Difference category"
              />
            </div>
            {parsed.errors.length > 0 ? (
              <p className="actions-empty">Fix the YAML to compare declarations.</p>
            ) : filteredObservations.length === 0 ? (
              <p className="actions-empty">
                {observations.length
                  ? "No differences in this category."
                  : "No differing declarations. Intent is evaluated separately."}
              </p>
            ) : (
              <div className="actions-observation-list">
                {filteredObservations.map((observation) => (
                  <div className="actions-observation-item" key={observation.id}>
                    <button
                      type="button"
                      className={`actions-observation ${selectedObservation === observation.id ? "actions-observation-selected" : ""}`}
                      onClick={() => revealObservation(observation)}
                      aria-expanded={selectedObservation === observation.id}
                    >
                      <span className="actions-observation-body">
                        <span className="actions-observation-heading">
                          <strong>{observation.title}</strong>
                          {observation.unresolved && <Badge tone="amber">Unresolved</Badge>}
                        </span>
                        <span className="actions-observation-values">
                          <span>
                            Candidate: <code>{observation.candidate.value}</code>
                          </span>
                          {observation.references.length > 0 && (
                            <span>
                              Source:{" "}
                              <code>
                                {[
                                  ...new Set(
                                    observation.references.map((reference) => reference.value),
                                  ),
                                ].join(" / ")}
                              </code>
                            </span>
                          )}
                        </span>
                        <span className="actions-evidence-link">
                          <code>candidate.yml:{observation.candidate.line}</code>
                          <ArrowRight size={13} />
                          <code>
                            {observation.references[0]
                              ? `${observation.references[0].file.split("/").pop()}:${observation.references[0].line}`
                              : "Source not supplied"}
                          </code>
                        </span>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                    {selectedObservation === observation.id && (
                      <div className="actions-observation-evidence">
                        <p>{observation.detail}</p>
                        <div className="actions-evidence-excerpt">
                          <span className="actions-excerpt-label">
                            Candidate · line {observation.candidate.line}
                          </span>
                          <CodeBlock
                            {...sourceExcerpt(yaml, observation.candidate.line)}
                            highlightLines={[observation.candidate.line]}
                            language="yaml"
                          />
                        </div>
                        {observation.references[0] && (
                          <div className="actions-evidence-excerpt">
                            <span className="actions-excerpt-label">
                              {observation.references[0].file} · line{" "}
                              {observation.references[0].line}
                            </span>
                            <CodeBlock
                              {...sourceExcerpt(
                                REPOSITORY_FILES.find(
                                  (file) => file.path === observation.references[0].file,
                                )?.content ?? "",
                                observation.references[0].line,
                              )}
                              highlightLines={[observation.references[0].line]}
                              language="yaml"
                            />
                          </div>
                        )}
                        {observation.references.length > 1 && (
                          <span className="small muted">
                            First of {observation.references.length} source locations.
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="actions-panel-note">
              Local YAML parsing and literal comparisons, not full Actions validation.
            </p>
          </Panel>

          <Panel className="actions-judgments">
            <PanelHeader
              title="Jev judgments"
              aside={
                <Badge tone={currentData ? "blue" : "neutral"}>
                  {currentData ? "Live response" : "Not evaluated"}
                </Badge>
              }
            />
            {!currentData ? (
              <p className="actions-empty">
                {evaluation.loading
                  ? "Evaluating…"
                  : editedSinceScan
                    ? "The workflow changed. Scan again."
                    : "Scan to evaluate intent, peers, and exceptions."}
              </p>
            ) : (
              <>
                <div className="actions-role">
                  <span className="muted">Role</span>
                  <strong>
                    {roles ? (roleNames[roles.choice] ?? roles.choice) : "Not returned"}
                  </strong>
                  {roles && <Probability value={roles.confidence} label="Confidence" compact />}
                </div>
                <div className="actions-peer-heading">
                  <strong>Comparable workflows</strong>
                  <span>Probability</span>
                </div>
                <div className="actions-peer-list">
                  {sourcePeers.map((peer) => (
                    <button
                      type="button"
                      key={peer.file.path}
                      className={`actions-peer ${selectedPath === peer.file.path ? "actions-peer-selected" : ""}`}
                      onClick={() => {
                        setSelectedPath(peer.file.path);
                        setSelectedObservation(null);
                      }}
                    >
                      <code>{peer.file.label}</code>
                      <Probability value={peer.probability} compact />
                    </button>
                  ))}
                </div>
                <div className="actions-judgment-heading">
                  <strong>Statement</strong>
                  <span>P(true)</span>
                </div>
                <div className="actions-judgment-list">
                  {judgmentCards.map((card) => (
                    <div className="actions-judgment" key={card.key}>
                      <div>
                        <strong>{card.title}</strong>
                        <p>{card.description}</p>
                      </div>
                      <Probability value={getNoul(currentData, card.key)} compact />
                    </div>
                  ))}
                </div>
              </>
            )}
            <p className="actions-panel-note">
              Probabilities assess the supplied evidence; they are not execution results.
            </p>
          </Panel>
        </div>
      </details>
    </div>
  );
}
