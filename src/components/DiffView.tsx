import { useEffect, useMemo, useState, type ReactNode } from "react";
import { File, FileDiff } from "@pierre/diffs/react";
import { preloadHighlighter } from "@pierre/diffs";
import type {
  DiffLineAnnotation,
  FileContents,
  FileDiffMetadata,
  LineAnnotation,
  SelectedLineRange,
} from "@pierre/diffs";
import "./diff-view.css";

export type SourceTone = "blue" | "purple" | "amber" | "red" | "neutral";
export type SourceMark = {
  start: number;
  end: number;
  side?: "additions" | "deletions";
  tone: SourceTone;
};
export type SourceNote = { id: string; line: number; content: ReactNode };
export type DiffNote = SourceNote & { side: "additions" | "deletions" };

const emptyMarks: SourceMark[] = [];
const emptyNotes: SourceNote[] = [];
const emptyDiffNotes: DiffNote[] = [];
let highlighterReady = false;
let highlighterPromise: Promise<void> | undefined;

function useSourceHighlighter() {
  const [ready, setReady] = useState(highlighterReady);
  const [error, setError] = useState(false);
  useEffect(() => {
    let current = true;
    // Preload before mounting: Diffs 1.4.3 can hydrate an empty <pre> during
    // React StrictMode's mount replay when its first highlight is still pending.
    highlighterPromise ??= preloadHighlighter({
      themes: ["github-light"],
      langs: ["typescript", "yaml", "json", "markdown"],
    }).then(() => {
      highlighterReady = true;
    });
    void highlighterPromise
      .then(() => {
        if (current) setReady(true);
      })
      .catch(() => {
        if (current) setError(true);
      });
    return () => {
      current = false;
    };
  }, []);
  return { ready, error };
}
const colors: Record<SourceTone, string> = {
  blue: "var(--blue)",
  purple: "var(--purple)",
  amber: "var(--amber)",
  red: "var(--red)",
  neutral: "var(--muted)",
};

// Diffs exposes source coordinates as data-line/data-column-number. Restrict a
// diff mark to its side's changed rows so old line 19 cannot mark new line 19.
function rangeCSS(marks: SourceMark[]) {
  return marks
    .flatMap((mark) => {
      if (!Number.isInteger(mark.start) || !Number.isInteger(mark.end) || mark.start < 1) return [];
      const side = mark.side
        ? `[data-line-type="change-${mark.side === "additions" ? "addition" : "deletion"}"]`
        : "";
      const rules: string[] = [];
      for (let line = mark.start; line <= mark.end; line++) {
        rules.push(
          `[data-line="${line}"]${side} { border-inline-start: 3px solid ${colors[mark.tone]}; }`,
          `[data-column-number="${line}"]${side} { color: ${colors[mark.tone]}; font-weight: 650; }`,
        );
      }
      return rules;
    })
    .join("\n");
}

const baseOptions = {
  theme: "github-light",
  themeType: "light" as const,
  preferredHighlighter: "shiki-js" as const,
  disableFileHeader: true,
  overflow: "scroll" as const,
  enableLineSelection: true,
  lineHoverHighlight: "number" as const,
};

function renderNote({ metadata }: LineAnnotation<SourceNote>) {
  return (
    <div className="diffview-note" data-note-id={metadata.id}>
      {metadata.content}
    </div>
  );
}

export function AnnotatedFile({
  name,
  code,
  language,
  notes = emptyNotes,
  marks = emptyMarks,
  selectedLines,
  className = "",
}: {
  name: string;
  code: string;
  language?: string;
  notes?: SourceNote[];
  marks?: SourceMark[];
  selectedLines?: SelectedLineRange | null;
  className?: string;
}) {
  const highlighter = useSourceHighlighter();
  const file = useMemo<FileContents>(
    () => ({ name, contents: code, lang: language }),
    [name, code, language],
  );
  const options = useMemo(() => ({ ...baseOptions, unsafeCSS: rangeCSS(marks) }), [marks]);
  const annotations = useMemo<LineAnnotation<SourceNote>[]>(
    () => notes.map((note) => ({ lineNumber: note.line, metadata: note })),
    [notes],
  );
  return (
    <div className={`diffview ${className}`}>
      {!highlighter.ready ? (
        <p className="diffview-loading">
          {highlighter.error
            ? "Source renderer could not load. Reload to retry."
            : "Loading source…"}
        </p>
      ) : (
        <File
          file={file}
          options={options}
          lineAnnotations={annotations}
          renderAnnotation={renderNote}
          selectedLines={selectedLines}
        />
      )}
    </div>
  );
}

export function DiffView({
  diff,
  notes = emptyDiffNotes,
  marks = emptyMarks,
  selectedLines,
}: {
  diff: FileDiffMetadata;
  notes?: DiffNote[];
  marks?: SourceMark[];
  selectedLines?: SelectedLineRange | null;
}) {
  const highlighter = useSourceHighlighter();
  const options = useMemo(
    () => ({
      ...baseOptions,
      diffStyle: "unified" as const,
      diffIndicators: "classic" as const,
      hunkSeparators: "metadata" as const,
      lineDiffType: "word-alt" as const,
      unsafeCSS: rangeCSS(marks),
    }),
    [marks],
  );
  const annotations = useMemo<DiffLineAnnotation<SourceNote>[]>(
    () => notes.map((note) => ({ side: note.side, lineNumber: note.line, metadata: note })),
    [notes],
  );
  return (
    <div className="diffview">
      {!highlighter.ready ? (
        <p className="diffview-loading">
          {highlighter.error
            ? "Source renderer could not load. Reload to retry."
            : "Loading source…"}
        </p>
      ) : (
        <FileDiff
          fileDiff={diff}
          options={options}
          lineAnnotations={annotations}
          renderAnnotation={renderNote}
          selectedLines={selectedLines}
        />
      )}
    </div>
  );
}
