import { z } from "zod";

const instructions = z.union([z.string().min(1).max(10000), z.record(z.string(), z.unknown())]);
const question = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("noul"),
    instructions,
    criteria: z.object({ true: z.string(), false: z.string() }).optional(),
  }),
  z.object({
    type: z.literal("choice"),
    instructions,
    criteria: z
      .record(z.string(), z.string().nullable())
      .refine(
        (v) => Object.keys(v).length >= 2 && Object.keys(v).length <= 255,
        "Choice requires 2–255 options.",
      ),
  }),
  z.object({
    type: z.literal("score"),
    instructions,
    criteria: z.array(z.string().min(1)).min(2).max(10),
  }),
]);

export const evaluationSchema = z.object({
  state: z.unknown().refine((v) => v !== undefined && v !== null, "State is required."),
  questions: z
    .record(z.string().regex(/^[\w.-]{1,100}$/), question)
    .refine(
      (v) => Object.keys(v).length >= 1 && Object.keys(v).length <= 256,
      "Send between 1 and 256 questions.",
    ),
  cache: z.boolean().optional(),
  tag: z.string().max(80).optional(),
});

export const generationSchema = z.object({
  provider: z.enum(["openai", "anthropic"]),
  task: z.enum(["workflow", "report", "discussion", "code-query", "context-task"]),
  prompt: z.string().min(3).max(12000),
  context: z.unknown().optional(),
});

export class ServiceError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export function isLocalRequest(request: Request): boolean {
  const url = new URL(request.url);
  const allowedHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (!allowedHosts.has(url.hostname)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin);
    return (
      allowedHosts.has(source.hostname) &&
      ["http:", "https:"].includes(source.protocol) &&
      ["4317", "4318", String(url.port)].includes(source.port)
    );
  } catch {
    return false;
  }
}
