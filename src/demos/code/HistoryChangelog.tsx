import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { GenerateRequest, GenerateResponse, JevResponse } from "../../../shared/api";
import { Badge, Button, Panel, PanelHeader } from "../../components/ui";
import { useHealth } from "../../lib/health";
import { appPath } from "../../lib/path";
import type { HistoryCommit } from "./history-data";
import {
  canceledCommitIds,
  changelogContext,
  changelogMarkdown,
  CHANGELOG_CATEGORIES,
  groupChangelog,
  parseWrittenChangelog,
  type WrittenChangelog,
} from "./history-changelog";
import "./history-changelog.css";

export default function HistoryChangelog({
  commits,
  revision,
  data,
  onSource,
}: {
  commits: HistoryCommit[];
  revision: string;
  data: JevResponse | null;
  onSource: (id: string) => void;
}) {
  const { health } = useHealth();
  const [omitReverts, setOmitReverts] = useState(true);
  const [written, setWritten] = useState<WrittenChangelog | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [request, setRequest] = useState<GenerateRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const canceled = canceledCommitIds(commits);
  const excluded = omitReverts ? commits.filter((commit) => canceled.has(commit.id)) : [];
  const groups = groupChangelog(commits, data, omitReverts);
  const includedCount = groups.reduce((count, group) => count + group.commits.length, 0);

  useEffect(
    () => () => {
      sequence.current++;
      controller.current?.abort();
    },
    [],
  );

  function toggleReverts(value: boolean) {
    sequence.current++;
    controller.current?.abort();
    setOmitReverts(value);
    setWritten(null);
    setResult(null);
    setRequest(null);
    setError(null);
    setLoading(false);
    setCopied(null);
  }
  async function write() {
    if (!data || !groups.length) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const version = ++sequence.current;
    const input: GenerateRequest = {
      provider: "anthropic",
      task: "changelog",
      prompt:
        "Write an organized changelog from these Jev-classified patches. Preserve every category and cite every included commit. Return the requested JSON only.",
      context: changelogContext(groups, revision, excluded),
    };
    setRequest(input);
    setLoading(true);
    setError(null);
    setWritten(null);
    setResult(null);
    setCopied(null);
    try {
      const response = await fetch(appPath("api/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(190000)]),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The changelog could not be written.");
      if (version !== sequence.current || abort.signal.aborted) return;
      const validated = parseWrittenChangelog(body.text, groups);
      setWritten(validated);
      setResult(body);
    } catch (err) {
      if (!abort.signal.aborted && version === sequence.current)
        setError(err instanceof Error ? err.message : "The changelog could not be written.");
    } finally {
      if (version === sequence.current) setLoading(false);
    }
  }
  async function copy(tier: string) {
    try {
      await navigator.clipboard.writeText(
        changelogMarkdown(groups, tier === "written" ? written : null),
      );
      setCopied(tier);
    } catch {
      setCopied(null);
    }
  }
  const source = (sha: string) => {
    const commit = commits.find((item) => item.sha === sha);
    if (commit) onSource(commit.id);
  };
  return (
    <div className="stack history-changelog">
      <div className="row wrap spread">
        <label className="code-checkbox">
          <input
            type="checkbox"
            checked={omitReverts}
            onChange={(event) => toggleReverts(event.target.checked)}
          />
          <span>Omit explicit revert pairs</span>
        </label>
        <span className="small muted">
          {data
            ? `${includedCount} commits organized · ${excluded.length} cancel out`
            : "Categorize commits to populate both tiers."}
        </span>
      </div>
      <div className="history-changelog-columns">
        <Panel>
          <PanelHeader
            title="Jev only"
            description="Original commit messages, organized by patch."
            aside={
              data && (
                <Button size="sm" variant="ghost" onClick={() => void copy("grouped")}>
                  {copied === "grouped" ? <Check size={13} /> : <Copy size={13} />}Copy
                </Button>
              )
            }
          />
          <div className="history-changelog-body">
            {data ? (
              groups.map((group) => (
                <section key={group.category} className="history-changelog-group">
                  <h3>
                    {CHANGELOG_CATEGORIES.find((item) => item.id === group.category)!.label}
                    <span>{group.commits.length}</span>
                  </h3>
                  <ul>
                    {group.commits.map((commit) => (
                      <li key={commit.id}>
                        <button type="button" onClick={() => onSource(commit.id)}>
                          <span>{commit.message}</span>
                          <code>{commit.sha}</code>
                        </button>
                        <span className="history-changelog-path">{commit.path}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            ) : (
              <p className="muted">
                Jev assigns categories from the actual diffs. Original messages and source links
                stay intact.
              </p>
            )}
          </div>
        </Panel>
        <Panel>
          <PanelHeader
            title="Jev → fast writer"
            description="The same groups, rewritten as a changelog."
            aside={
              <Button
                size="sm"
                variant="primary"
                disabled={!data || !groups.length || !health?.anthropic.configured}
                loading={loading}
                onClick={() => void write()}
              >
                {loading ? "Writing…" : written ? "Rewrite with Haiku" : "Write with Haiku"}
              </Button>
            }
          />
          <div className="history-changelog-body">
            {error && (
              <p className="generation-error" role="alert">
                {error}
              </p>
            )}
            {written ? (
              written.sections.map((section) => (
                <section key={section.category} className="history-changelog-group">
                  <h3>
                    {CHANGELOG_CATEGORIES.find((item) => item.id === section.category)!.label}
                  </h3>
                  <ul>
                    {section.entries.map((entry, index) => (
                      <li key={`${section.category}-${index}`}>
                        <p>{entry.text}</p>
                        <div className="history-changelog-citations">
                          {entry.commits.map((sha) => (
                            <button
                              className="text-button mono"
                              key={sha}
                              type="button"
                              onClick={() => source(sha)}
                            >
                              {sha}
                            </button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            ) : (
              <p className="muted">
                {loading
                  ? "Writing from Jev's categories and their source patches…"
                  : data
                    ? "Ready. Haiku receives these categories, commit messages, and diffs."
                    : "Categorize first, then write with Haiku."}
              </p>
            )}
          </div>
          {result && (
            <div className="history-changelog-footer">
              <span>
                {result.model} · {(result.durationMs / 1000).toFixed(2)} s
              </span>
              <Button size="sm" variant="ghost" onClick={() => void copy("written")}>
                {copied === "written" ? <Check size={13} /> : <Copy size={13} />}Copy
              </Button>
            </div>
          )}
        </Panel>
      </div>
      {!!excluded.length && (
        <details className="history-changelog-details">
          <summary>{excluded.length} commits excluded as explicit revert pairs</summary>
          <div>
            {excluded.map((commit) => (
              <button
                type="button"
                className="text-button"
                key={commit.id}
                onClick={() => onSource(commit.id)}
              >
                <code>{commit.sha}</code> {commit.message}
              </button>
            ))}
          </div>
        </details>
      )}
      {request && (
        <details className="history-changelog-details">
          <summary>Inspect writer handoff {result && <Badge>{result.model}</Badge>}</summary>
          <pre>{JSON.stringify({ request, response: result }, null, 2)}</pre>
        </details>
      )}
      {data && (
        <p className="small muted">
          Low-confidence categories remain in Needs review. Source patches are the evidence; release
          notes are a draft.
        </p>
      )}
    </div>
  );
}
