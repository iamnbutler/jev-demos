export type DemoId =
  | "actions"
  | "code-search"
  | "review"
  | "duplicates"
  | "discussion"
  | "history"
  | "context"
  | "replay";
export type Demo = { id: DemoId; title: string; shortTitle: string; description: string };
export const demos: Demo[] = [
  {
    id: "actions",
    title: "Workflow scanner",
    shortTitle: "Workflows",
    description: "Compare workflow intent, dependencies, and repository conventions.",
  },
  {
    id: "code-search",
    title: "Semantic Search",
    shortTitle: "Semantic Search",
    description: "Rank source functions as Jev evaluates them.",
  },
  {
    id: "review",
    title: "Review lenses",
    shortTitle: "Review lenses",
    description: "Decorate changed ranges with semantic review signals.",
  },
  {
    id: "duplicates",
    title: "Duplicate reports",
    shortTitle: "Duplicates",
    description: "Compare a report with possible duplicates.",
  },
  {
    id: "discussion",
    title: "Discussion timeline",
    shortTitle: "Discussion",
    description: "Find proposals, decisions, reversals, and open questions.",
  },
  {
    id: "history",
    title: "Commit history",
    shortTitle: "History",
    description: "Explore commits and build a changelog from their diffs.",
  },
  {
    id: "context",
    title: "Context selection",
    shortTitle: "Context",
    description: "Keep useful evidence within a context budget.",
  },
  {
    id: "replay",
    title: "Run replay",
    shortTitle: "Replay",
    description: "Inspect agent progress, repeated failures, and conflicting evidence.",
  },
];
