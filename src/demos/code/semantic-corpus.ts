import type { SourceFunction } from "./source-data";

export type SearchFunction = SourceFunction & {
  endLine: number;
  repository: string;
  revision: string;
  sourceUrl: string | null;
  licenseUrl: string | null;
  kind: string;
  imports: string[];
  notice?: string;
  edited?: boolean;
};

export type CorpusRepository = {
  id: string;
  name: string;
  repository: string;
  revision: string;
  sourceUrl: string;
  license: "MIT";
  licenseUrl: string;
  localLicense: string;
  functions: number;
  files: number;
};

export type SearchCorpus = {
  schema: 1;
  id: string;
  provenance: string;
  extraction: string;
  repositories: CorpusRepository[];
  functions: SearchFunction[];
};

// Commit IDs, rather than branches or tags, make the corpus reproducible.
export const CORPUS_REPOSITORIES = [
  {
    id: "hono",
    name: "Hono",
    repository: "honojs/hono",
    revision: "52febbcc30bc509d5e4987577e63906fe08fc471",
    roots: ["src"],
  },
  {
    id: "query",
    name: "TanStack Query",
    repository: "TanStack/query",
    revision: "47f27a48243792946bd74a51191021ec328de682",
    roots: ["packages"],
  },
  {
    id: "vite",
    name: "Vite",
    repository: "vitejs/vite",
    revision: "e9078f865cdff6bed77cd729214a7e2868f126b5",
    roots: ["packages/vite/src"],
  },
] as const;

export const SEMANTIC_PRESETS = [
  {
    label: "Catch & continue",
    query:
      "Catches an error and continues processing other items instead of failing the whole operation.",
  },
  {
    label: "Retry with backoff",
    query:
      "Retries a failed asynchronous operation after a delay, with a bounded or configurable retry policy.",
  },
  {
    label: "Prevent path traversal",
    query: "Rejects or sanitizes a file path to prevent access outside an allowed directory.",
  },
  {
    label: "Dispose resources",
    query:
      "Cleans up resources by closing connections, removing event listeners, or cancelling scheduled work.",
  },
  {
    label: "Cache invalidation",
    query:
      "Invalidates cached data or marks cached entries stale so that they will be recomputed or fetched again.",
  },
  {
    label: "Deduplicate work",
    query:
      "Reuses an existing in-flight promise or pending operation so concurrent callers do not repeat the same work.",
  },
] as const;
