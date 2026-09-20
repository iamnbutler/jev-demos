import { useRef, useState } from "react";
import {
  ArrowDown,
  Check,
  CircleHelp,
  FileText,
  Flag,
  Lightbulb,
  MessageCircle,
  Pencil,
  RotateCcw,
  Scan,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import type { GenerateResponse } from "../../../shared/api";
import {
  Badge,
  Button,
  EmptyState,
  EvaluationBar,
  GenerationControl,
  Panel,
  PanelHeader,
  Segmented,
} from "../../components/ui";
import { getChoice, getNoul, useEvaluation } from "../../lib/jev";
import {
  buildDiscussionRequest,
  kindFor,
  parseGeneratedThread,
  turnKinds,
  type TurnKind,
} from "./analysis";
import { threads, type Post } from "./data";
import "./discussion.css";

const kindStyles = {
  proposal: { tone: "blue", icon: Lightbulb },
  objection: { tone: "amber", icon: Flag },
  decision: { tone: "green", icon: Check },
  reversal: { tone: "purple", icon: Undo2 },
  question: { tone: "amber", icon: CircleHelp },
  evidence: { tone: "blue", icon: FileText },
  acknowledgment: { tone: "neutral", icon: MessageCircle },
  other: { tone: "neutral", icon: MessageCircle },
} as const;
const formatTime = (time: string) =>
  new Date(time).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

export default function DiscussionDemo() {
  const [thread, setThread] = useState(threads[0]);
  const [selected, setSelected] = useState("p5");
  const [filter, setFilter] = useState("all");
  const [through, setThrough] = useState(threads[0].posts.length);
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [generationPrompt, setGenerationPrompt] = useState(
    "An engineering team debates how to recover previews after a network outage. They make a decision, get surprising test evidence, and reverse part of the decision.",
  );
  const [generated, setGenerated] = useState<GenerateResponse | null>(null);
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const postElements = useRef(new Map<string, HTMLElement>());
  const ev = useEvaluation();
  const visible = thread.posts.slice(0, through);
  const kind = (post: Post) => kindFor(ev.data, post);
  const isDecision = (post: Post) =>
    ["decision", "reversal"].includes(kind(post) ?? "") &&
    (getNoul(ev.data, `explicit_${post.id}`) ?? 0) >= 0.6;
  const decisions = visible.filter(isDecision);
  const unanswered = visible.filter(
    (post) =>
      ["objection", "question"].includes(kind(post) ?? "") &&
      (getNoul(ev.data, `answered_${post.id}`) ?? 1) < 0.5,
  );
  const latest = decisions.at(-1);
  const trail = visible.filter((post) => {
    if (!ev.data) return true;
    if (filter === "decisions") return isDecision(post);
    if (filter === "unresolved") return unanswered.includes(post);
    return kind(post) !== "acknowledgment" && kind(post) !== "other";
  });

  function chooseThread(id: string) {
    const next = threads.find((item) => item.id === id);
    if (!next) return;
    setThread(next);
    setThrough(next.posts.length);
    setSelected(next.posts[0].id);
    setFilter("all");
    setGenerated(null);
    setEditing(null);
    ev.reset();
  }
  function focusPost(id: string) {
    setSelected(id);
    postElements.current.get(id)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "nearest",
    });
  }
  function receiveThread(text: string, response?: GenerateResponse) {
    const next = parseGeneratedThread(text);
    setThread(next);
    setThrough(next.posts.length);
    setSelected(next.posts[0].id);
    setFilter("all");
    setGenerated(response ?? null);
    setEditing(null);
    ev.reset();
  }
  function savePost(post: Post) {
    setThread((previous) => ({
      ...previous,
      posts: previous.posts.map((p) => (p.id === post.id ? { ...p, body: editBody } : p)),
    }));
    setEditing(null);
    setGenerated(null);
    ev.reset();
  }

  return (
    <div className="stack discussion-demo">
      <div className="demo-toolbar">
        <label className="row">
          <span className="field-label">Thread</span>
          <select
            className="select"
            aria-label="Example conversation"
            value={thread.id}
            onChange={(e) => chooseThread(e.target.value)}
          >
            {threads.map((item) => (
              <option value={item.id} key={item.id}>
                {item.title}
              </option>
            ))}
            {thread.id === "custom" && <option value="custom">{thread.title}</option>}
          </select>
        </label>
        <div className="row">
          <Button size="sm" variant="ghost" onClick={() => chooseThread("reversal")}>
            <RotateCcw size={13} />
            Reset
          </Button>
          <Button
            variant="primary"
            loading={ev.loading}
            onClick={() => ev.run({ ...buildDiscussionRequest(thread, through), cache: false })}
          >
            <Scan size={14} />
            {ev.loading ? "Analyzing…" : "Analyze"}
          </Button>
        </div>
      </div>
      <Panel className="discussion-overview">
        <div className="discussion-topic">
          <div>
            <h2>{thread.title}</h2>
            <p>
              {generated ? `Generated with ${generated.model}` : "Fictional thread"} ·{" "}
              {thread.posts.length} posts · {new Set(thread.posts.map((p) => p.author)).size} people
            </p>
          </div>
        </div>
        <div className="discussion-cutoff">
          <label htmlFor="discussion-through">
            Read through post <strong>{through}</strong> <span>of {thread.posts.length}</span>
          </label>
          <input
            id="discussion-through"
            type="range"
            min={2}
            max={thread.posts.length}
            step={1}
            value={through}
            onChange={(e) => {
              setThrough(Number(e.target.value));
              ev.reset();
              setEditing(null);
            }}
          />
          <span>Later posts are excluded.</span>
        </div>
      </Panel>
      <EvaluationBar evaluation={ev} label="Jev" />
      <div className="discussion-workspace">
        <div className="stack discussion-trail-column">
          <Panel>
            <PanelHeader
              title="Timeline"
              description={
                ev.data
                  ? `${decisions.length} explicit decisions / reversals · ${unanswered.length} open concerns`
                  : "Analyze to classify posts."
              }
            />
            <div className="discussion-filters">
              <Segmented
                ariaLabel="Timeline filter"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "Key turns" },
                  { value: "decisions", label: "Decisions" },
                  { value: "unresolved", label: "Still open" },
                ]}
              />
            </div>
            <div className="discussion-trail">
              {trail.length ? (
                trail.map((post, index) => {
                  const currentKind = kind(post);
                  const style = currentKind ? kindStyles[currentKind] : undefined;
                  const Icon = style?.icon ?? MessageCircle;
                  return (
                    <button
                      type="button"
                      key={post.id}
                      className={`discussion-turn ${selected === post.id ? "selected" : ""} ${currentKind ?? ""}`}
                      onClick={() => focusPost(post.id)}
                    >
                      <span className={`discussion-turn-dot ${style?.tone ?? "neutral"}`}>
                        <Icon size={12} />
                      </span>
                      <span className="discussion-turn-content">
                        <span className="discussion-turn-meta">
                          <strong>
                            {currentKind ? turnKinds[currentKind] : `Post ${index + 1}`}
                          </strong>
                          <span>{post.author.split(" ")[0]}</span>
                        </span>
                        <span className="discussion-turn-excerpt">
                          {post.body.length > 110 ? `${post.body.slice(0, 107)}…` : post.body}
                        </span>
                        <span className="discussion-turn-time">{formatTime(post.time)} UTC</span>
                      </span>
                    </button>
                  );
                })
              ) : (
                <EmptyState
                  icon={<Check size={19} />}
                  title={
                    filter === "decisions"
                      ? "No explicit decision found"
                      : filter === "unresolved"
                        ? "No open concern identified"
                        : "No key turn identified"
                  }
                  description={
                    filter === "decisions"
                      ? "Agreement and enthusiasm can stay just that. Inspect the thread to judge for yourself."
                      : "This is a model assessment of the supplied thread, not proof that all questions are settled."
                  }
                />
              )}
            </div>
          </Panel>
          {ev.data && (
            <Panel className="discussion-latest">
              <PanelHeader title="Latest decision" aside={<Flag size={14} />} />
              {latest ? (
                <div>
                  <Badge tone={kind(latest) === "reversal" ? "purple" : "green"}>
                    {kind(latest) === "reversal" ? "Revised decision" : "Decision"}
                  </Badge>
                  <p>{latest.body}</p>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => focusPost(latest.id)}
                  >
                    {latest.author} · Source <ArrowDown size={12} />
                  </button>
                </div>
              ) : (
                <div>
                  <p>
                    No passage cleared both the decision label and explicit-commitment check. The
                    discussion may still be open.
                  </p>
                </div>
              )}
            </Panel>
          )}
        </div>
        <Panel className="discussion-thread">
          <PanelHeader
            title="Source"
            description=""
            aside={
              <Badge>
                {through} of {thread.posts.length} posts
              </Badge>
            }
          />
          <div className="discussion-posts">
            {visible.map((post, index) => {
              const currentKind: TurnKind | undefined = kind(post);
              const resolved =
                ["question", "objection"].includes(currentKind ?? "") &&
                (getNoul(ev.data, `answered_${post.id}`) ?? 0) >= 0.5;
              return (
                <article
                  key={post.id}
                  ref={(element) => {
                    if (element) postElements.current.set(post.id, element);
                    else postElements.current.delete(post.id);
                  }}
                  className={`discussion-post ${selected === post.id ? "selected" : ""}`}
                >
                  <div className={`discussion-avatar avatar-${index % 5}`}>
                    {initials(post.author)}
                  </div>
                  <div className="discussion-post-main">
                    <div className="discussion-post-heading">
                      <strong>{post.author}</strong>
                      <span>{post.role}</span>
                      <time dateTime={post.time}>{formatTime(post.time)}</time>
                    </div>
                    {currentKind && (
                      <div className="discussion-post-badges">
                        <Badge tone={kindStyles[currentKind].tone}>{turnKinds[currentKind]}</Badge>
                        {resolved && <Badge tone="green">Addressed later</Badge>}
                        {unanswered.includes(post) && <Badge tone="amber">Still open</Badge>}
                      </div>
                    )}
                    {editing === post.id ? (
                      <div className="discussion-edit">
                        <label className="sr-only" htmlFor={`edit-${post.id}`}>
                          Edit post by {post.author}
                        </label>
                        <textarea
                          id={`edit-${post.id}`}
                          className="textarea"
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={5}
                          maxLength={6000}
                        />
                        <div className="row">
                          <Button
                            size="sm"
                            disabled={editBody.trim().length < 2}
                            onClick={() => savePost(post)}
                          >
                            <Check size={12} />
                            Save passage
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                            <X size={12} />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p>{post.body}</p>
                    )}
                    <div className="discussion-post-footer">
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          setEditing(post.id);
                          setEditBody(post.body);
                          setSelected(post.id);
                        }}
                      >
                        <Pencil size={10} />
                        Edit
                      </button>
                      {getChoice(ev.data, `kind_${post.id}`) && (
                        <span>
                          {Math.round(getChoice(ev.data, `kind_${post.id}`)!.confidence * 100)}%
                          choice confidence
                        </span>
                      )}
                      <span className="mono">#{index + 1}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </Panel>
      </div>
      <Panel className="discussion-new">
        <PanelHeader
          title={
            <span className="row">
              <Sparkles size={14} /> Generate or load a thread
            </span>
          }
          description=""
        />
        <div className="discussion-new-body">
          <label className="field">
            <span className="field-label">Prompt</span>
            <textarea
              className="textarea"
              rows={2}
              value={generationPrompt}
              maxLength={3000}
              onChange={(e) => setGenerationPrompt(e.target.value)}
            />
          </label>
          <GenerationControl
            task="discussion"
            inputKey={JSON.stringify({ thread, through })}
            prompt={generationPrompt}
            onGenerated={(text, response) => receiveThread(text, response)}
            label="Draft thread"
          />
          <details>
            <summary>Paste your own thread as JSON</summary>
            <p className="small muted">
              Use a title and 2–20 posts with author, role, time (ISO timestamp), and body.
            </p>
            <textarea
              className="textarea mono"
              aria-label="Thread JSON"
              value={paste}
              onChange={(e) => {
                setPaste(e.target.value);
                setPasteError(null);
              }}
              placeholder={
                '{"title":"A design discussion","posts":[{"author":"Maya","role":"Engineer","time":"2026-09-20T10:00:00Z","body":"I propose…"}]}'
              }
              rows={4}
              maxLength={120000}
            />
            <Button
              size="sm"
              disabled={!paste.trim()}
              onClick={() => {
                try {
                  receiveThread(paste);
                  setPasteError(null);
                } catch (error) {
                  setPasteError(
                    error instanceof Error ? error.message : "The JSON could not be read.",
                  );
                }
              }}
            >
              Load thread
            </Button>
            {pasteError && (
              <p className="generation-error" role="alert">
                {pasteError}
              </p>
            )}
          </details>
        </div>
      </Panel>
      <div className="surface-note">
        <FileText size={14} />
        <p>Fictional threads. Labels are Jev judgments; decisions link to original passages.</p>
      </div>
    </div>
  );
}
