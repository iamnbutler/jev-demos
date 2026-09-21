import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Check,
  ChevronDown,
  Code2,
  Copy,
  LoaderCircle,
  Sparkles,
  X,
} from "lucide-react";
import type {
  GenerateResponse,
  GenerationProvider,
  GenerationTask,
  JevRequest,
  JevResponse,
} from "../../shared/api";
import type { Evaluation } from "../lib/jev";
import { useHealth } from "../lib/health";
import { appPath } from "../lib/path";

export function Panel({ children, className = "", ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={`panel ${className}`} {...rest}>
      {children}
    </section>
  );
}
export function PanelHeader({
  title,
  description,
  aside,
}: {
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="panel-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {aside && <div className="panel-header-aside">{aside}</div>}
    </div>
  );
}
export function Button({
  children,
  className = "",
  variant = "secondary",
  size = "md",
  loading = false,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      className={`button button-${variant} button-${size} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <LoaderCircle size={15} className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "amber" | "red" | "blue" | "purple";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Probability({
  value,
  label,
  compact = false,
}: {
  value: number | undefined;
  label?: string;
  compact?: boolean;
}) {
  const number = value === undefined ? undefined : Math.min(1, Math.max(0, value));
  return (
    <div
      className={`probability ${compact ? "probability-compact" : ""}`}
      title={
        number === undefined ? "Not assessed" : `Model probability: ${(number * 100).toFixed(1)}%`
      }
    >
      {label && <span className="probability-label">{label}</span>}
      <span className="probability-track">
        <span style={{ width: `${(number ?? 0) * 100}%` }} />
      </span>
      <span className="probability-value mono">
        {number === undefined ? "—" : `${Math.round(number * 100)}%`}
      </span>
    </div>
  );
}
export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function Segmented({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: ReactNode }[];
  ariaLabel: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          aria-pressed={value === option.value}
          className={value === option.value ? "selected" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
function milliseconds(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function EvaluationBar({
  evaluation,
  label = "Live Jev evaluation",
}: {
  evaluation: Evaluation;
  label?: string;
}) {
  const { data, error, loading, request } = evaluation;
  return (
    <div className={`evaluation-bar ${error ? "evaluation-error" : ""}`} aria-live="polite">
      <div className="row wrap">
        {loading ? (
          <LoaderCircle size={14} className="spin" />
        ) : error ? (
          <AlertCircle size={14} />
        ) : (
          <Activity size={14} />
        )}
        <strong>
          {loading
            ? "Jev is evaluating…"
            : error
              ? "Evaluation unavailable"
              : data
                ? data.meta.cached
                  ? "Cached Jev result"
                  : "Evaluated live"
                : label}
        </strong>
        {data && (
          <>
            <span className="evaluation-dot">·</span>
            <span>{data.meta.questionCount} judgments</span>
            <span className="evaluation-dot">·</span>
            <span title="Elapsed provider HTTP request, including any retry">
              {milliseconds(data.meta.providerMs)} provider{data.meta.cached ? " (original)" : ""}
            </span>
            <span className="evaluation-dot">·</span>
            <span>{milliseconds(data.meta.totalMs)} total</span>
          </>
        )}
        {!data && !error && !loading && <span className="muted">Not evaluated</span>}
      </div>
      {error && <p>{error}</p>}
      {request && !loading && <EvidenceDrawer request={request} data={data} />}
    </div>
  );
}

export function EvidenceDrawer({
  request,
  data,
}: {
  request: JevRequest | null;
  data: JevResponse | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState("state");
  const [copied, setCopied] = useState(false);
  const titleId = useId();
  const content = JSON.stringify(
    tab === "state" ? request?.state : tab === "questions" ? request?.questions : data,
    null,
    2,
  );
  return (
    <>
      <button
        type="button"
        className="text-button evidence-button"
        onClick={() => {
          setCopied(false);
          dialog.current?.showModal();
        }}
      >
        <Code2 size={13} /> Inspect evaluation <ArrowUpRight size={12} />
      </button>
      <dialog ref={dialog} className="evidence-dialog" aria-labelledby={titleId}>
        <div className="panel-header">
          <div>
            <h2 id={titleId}>Evaluation</h2>
            <p>Exact input, questions, and answers.</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Close evaluation"
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </Button>
        </div>
        <div className="evidence-toolbar">
          <Segmented
            ariaLabel="Evaluation details"
            value={tab}
            onChange={setTab}
            options={[
              { value: "state", label: "Input state" },
              { value: "questions", label: "Questions" },
              { value: "answers", label: "Answers & timing" },
            ]}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(content);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy JSON"}
          </Button>
        </div>
        <pre className="evidence-json">{content}</pre>
        <div className="evidence-footer">
          <span>{data?.model ?? "No successful response yet"}</span>
          <span>
            {data
              ? `${data.usage.input_tokens.toLocaleString()} input tokens · ${new Date(data.meta.at).toLocaleTimeString()}`
              : ""}
          </span>
        </div>
      </dialog>
    </>
  );
}

export function GenerationControl({
  task,
  context,
  prompt,
  inputKey,
  onGenerated,
  label = "Draft",
}: {
  task: GenerationTask;
  context?: unknown;
  prompt: string;
  inputKey?: string | number;
  onGenerated: (text: string, response: GenerateResponse) => void;
  label?: string;
}) {
  const { health } = useHealth();
  const [provider, setProvider] = useState<GenerationProvider>("openai");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const version = JSON.stringify({ context, prompt, task, inputKey });
  const inputVersion = useRef(version);
  useLayoutEffect(() => {
    inputVersion.current = version;
  }, [version]);
  useEffect(() => () => controller.current?.abort(), []);
  const available = health?.[provider]?.configured;
  async function generateDraft() {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const capturedVersion = version;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(appPath("api/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, context, prompt, provider }),
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(190000)]),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Draft could not be generated.");
      if (inputVersion.current !== capturedVersion) {
        setError("The input changed while drafting. Generate again to use the new input.");
        return;
      }
      onGenerated(result.text, result);
    } catch (err) {
      if (!abort.signal.aborted)
        setError(err instanceof Error ? err.message : "Draft could not be generated.");
    } finally {
      if (!abort.signal.aborted) setLoading(false);
    }
  }
  return (
    <div className="generation-control">
      <div className="generation-buttons">
        <label className="generation-select">
          <span className="sr-only">Writing provider</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as GenerationProvider)}
            disabled={loading}
          >
            <option value="openai">
              OpenAI{health && !health.openai.configured ? " (no key)" : ""}
            </option>
            <option value="anthropic">
              Claude{health && !health.anthropic.configured ? " (no key)" : ""}
            </option>
          </select>
          <ChevronDown size={12} />
        </label>
        <Button
          size="sm"
          variant="secondary"
          loading={loading}
          disabled={!available || !prompt.trim()}
          onClick={generateDraft}
        >
          {!loading && <Sparkles size={14} />}
          {loading ? "Drafting…" : label}
        </Button>
      </div>
      {error && (
        <p className="generation-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const syntaxPattern =
  /(\/\/.*$|#.*$|'[^']*'|"[^"\\]*(?:\\.[^"\\]*)*"|`[^`]*`|\b(?:export|async|await|function|return|const|let|if|else|throw|new|try|catch|finally|import|from|type|interface|true|false|null|undefined|class|extends)\b|\b\d+(?:\.\d+)?\b)/g;
function syntax(line: string) {
  return line.split(syntaxPattern).map((part, index) => {
    const kind = /^(\/\/|#)/.test(part)
      ? "comment"
      : /^['"`]/.test(part)
        ? "string"
        : /^\d/.test(part)
          ? "number"
          : /^(export|async|await|function|return|const|let|if|else|throw|new|try|catch|finally|import|from|type|interface|true|false|null|undefined|class|extends)$/.test(
                part,
              )
            ? "keyword"
            : "";
    return kind ? (
      <span key={`${index}-${part}`} className={`syntax-${kind}`}>
        {part}
      </span>
    ) : (
      part
    );
  });
}
export function CodeBlock({
  code,
  language,
  startLine = 1,
  highlightLines = [],
}: {
  code: string;
  language?: string;
  startLine?: number;
  highlightLines?: number[];
}) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <div className="code-block" data-language={language}>
      <pre>
        {lines.map((line, index) => (
          <div
            key={`${index}-${line}`}
            className={`code-line ${highlightLines.includes(index + startLine) ? "code-highlight" : ""} ${line.startsWith("+") && !line.startsWith("+++") ? "code-added" : line.startsWith("-") && !line.startsWith("---") ? "code-removed" : ""}`}
          >
            <span className="line-number" aria-hidden="true">
              {index + startLine}
            </span>
            <code>{syntax(line) || "\u00a0"}</code>
          </div>
        ))}
      </pre>
    </div>
  );
}
