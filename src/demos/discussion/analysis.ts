import type { JevRequest, JevResponse, Questions } from "../../../shared/api";
import { threads, type Post, type Thread } from "./data";

export const turnKinds = {
  proposal: "Proposal",
  objection: "Objection",
  decision: "Decision",
  reversal: "Reversal",
  question: "Open question",
  evidence: "New evidence",
  acknowledgment: "Acknowledgment",
  other: "Other / unclear",
} as const;
export type TurnKind = keyof typeof turnKinds;

export function buildDiscussionRequest(
  thread: Thread = threads[0],
  through = thread.posts.length,
): JevRequest {
  const posts = thread.posts.slice(0, through);
  const questions: Questions = {};
  for (const post of posts) {
    questions[`kind_${post.id}`] = {
      type: "choice",
      instructions: `What is the main role of post ${post.id} by ${post.author} in the supplied discussion? Classify what that post actually says. Praise, acknowledgment, collecting examples, and permission to explore do not decide the product behavior. A decision must explicitly commit to a concrete product or technical behavior.`,
      criteria: {
        proposal:
          "Suggests a concrete possibility or approach for consideration, without settling it.",
        objection: "Raises a material reason a proposed approach could fail or should not proceed.",
        decision:
          "Explicitly settles a specific product or technical behavior and commits the group to it.",
        reversal:
          "Explicitly replaces or withdraws a previously agreed product or technical decision.",
        question: "Asks for information or a still-unresolved decision.",
        evidence: "Reports a concrete observation, test result, or investigation finding.",
        acknowledgment:
          "Expresses agreement, enthusiasm, thanks, or next-discussion logistics without settling product behavior.",
        other: "The role is unclear or does not fit another option.",
      },
    };
    questions[`answered_${post.id}`] = {
      type: "noul",
      instructions: `If post ${post.id} raises a concern or question, do the later supplied posts explicitly address and resolve that specific concern? A general decision, thanks, or changing the subject does not resolve it. If no concern is raised, answer no.`,
      criteria: {
        true: "A later passage directly answers or resolves the specific concern.",
        false:
          "It is not explicitly resolved in the supplied later posts, or this post raises no concern.",
      },
    };
    questions[`explicit_${post.id}`] = {
      type: "noul",
      instructions: `Does post ${post.id} explicitly commit the group to a concrete product or technical behavior, including replacing an earlier decision? Exclude simple enthusiasm, intention to collect examples, and requests to investigate.`,
      criteria: {
        true: "Clear agreement or direction to implement a specific behavior.",
        false:
          "Only an idea, question, experiment result, acknowledgment, or exploration with no behavior settled.",
      },
    };
  }
  return { state: { title: thread.title, posts }, questions, tag: "discussion-timeline" };
}

export function kindFor(data: JevResponse | null, post: Post): TurnKind | undefined {
  const answer = data?.answers[`kind_${post.id}`];
  if (answer?.type !== "choice") return undefined;
  return answer.confidence >= 0.45 && Object.hasOwn(turnKinds, answer.choice)
    ? (answer.choice as TurnKind)
    : "other";
}

export function parseGeneratedThread(text: string): Thread {
  const object: unknown = JSON.parse(text);
  if (
    !object ||
    typeof object !== "object" ||
    !("title" in object) ||
    typeof object.title !== "string" ||
    object.title.length > 250 ||
    !("posts" in object) ||
    !Array.isArray(object.posts) ||
    object.posts.length < 2 ||
    object.posts.length > 20
  )
    throw new Error("Use a title and 2–20 posts.");
  const posts: Post[] = object.posts.map((p: unknown, index: number) => {
    if (
      !p ||
      typeof p !== "object" ||
      !("author" in p) ||
      typeof p.author !== "string" ||
      p.author.length > 80 ||
      !("body" in p) ||
      typeof p.body !== "string" ||
      p.body.length < 2 ||
      p.body.length > 6000 ||
      !("time" in p) ||
      typeof p.time !== "string" ||
      !Number.isFinite(Date.parse(p.time))
    )
      throw new Error("Each post needs an author, body, and valid timestamp.");
    return {
      id: `p${index + 1}`,
      author: p.author,
      body: p.body,
      time: new Date(p.time).toISOString(),
      role: "role" in p && typeof p.role === "string" ? p.role.slice(0, 80) : "Participant",
    };
  });
  posts.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  return { id: "custom", title: object.title, description: "Your supplied conversation.", posts };
}
