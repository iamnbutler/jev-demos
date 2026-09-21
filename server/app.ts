import { resolve, extname } from "node:path";
import type { GenerateRequest, JevRequest } from "../shared/api";
import { config, health, projectRoot } from "./config";
import { evaluateJev } from "./jev";
import { generate } from "./generation";
import { evaluationSchema, generationSchema, isAllowedRequest, ServiceError } from "./validation";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
let activeEvaluations = 0;
let activeGenerations = 0;

async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new ServiceError("Send JSON content.", 415);
  if (Number(request.headers.get("content-length")) > 300000)
    throw new ServiceError("Input is too large for this demo. Keep it under 300 KB.", 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 300000)
    throw new ServiceError("Input is too large for this demo. Keep it under 300 KB.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new ServiceError("Invalid JSON input.", 400);
  }
}

export async function handleRequest(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path.startsWith("/api/")) {
    if (!isAllowedRequest(request, config.publicOrigin))
      return json({ error: "This server accepts requests from its configured app only." }, 403);
    if (request.method === "GET" && path === "/api/health") return json(health);
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
    try {
      if (path === "/api/evaluate") {
        const parsed = evaluationSchema.safeParse(await readBody(request));
        if (!parsed.success)
          return json(
            {
              error: "Invalid evaluation request. Check the state and typed questions.",
              issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
            },
            400,
          );
        if (activeEvaluations >= 12)
          return json(
            { error: "Several evaluations are already running. Try again shortly." },
            429,
          );
        activeEvaluations++;
        try {
          return json(await evaluateJev(parsed.data as JevRequest));
        } finally {
          activeEvaluations--;
        }
      }
      if (path === "/api/generate") {
        const parsed = generationSchema.safeParse(await readBody(request));
        if (!parsed.success) return json({ error: "Invalid draft request." }, 400);
        if (activeGenerations >= 3)
          return json({ error: "Three drafts are already running. Try again shortly." }, 429);
        activeGenerations++;
        try {
          return json(await generate(parsed.data as GenerateRequest));
        } finally {
          activeGenerations--;
        }
      }
      return json({ error: "Not found." }, 404);
    } catch (error) {
      return json(
        {
          error:
            error instanceof ServiceError
              ? error.message
              : "The request could not be completed. Try again.",
        },
        error instanceof ServiceError ? error.status : 500,
      );
    }
  }
  if (request.method !== "GET" && request.method !== "HEAD")
    return json({ error: "Method not allowed." }, 405);
  const dist = resolve(projectRoot, "dist");
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (decoded.split("/").some((p) => p.startsWith(".") || p === "server" || p === "node_modules"))
    return new Response("Not found", { status: 404 });
  const filename = resolve(dist, `.${decoded}`);
  const extension = extname(filename);
  if (
    filename.startsWith(`${dist}/`) &&
    [".js", ".css", ".svg", ".png", ".ico", ".woff2", ".json", ".txt", ".md"].includes(extension)
  ) {
    const file = Bun.file(filename);
    if (await file.exists())
      return new Response(request.method === "HEAD" ? null : file, {
        headers: { "Content-Type": file.type, "X-Content-Type-Options": "nosniff" },
      });
    return new Response("Not found", { status: 404 });
  }
  const file = Bun.file(resolve(dist, "index.html"));
  if (!(await file.exists()))
    return new Response("Run bun dev for development, or bun run build before bun start.", {
      status: 503,
    });
  return new Response(request.method === "HEAD" ? null : file, {
    headers: { "Content-Type": "text/html", "X-Content-Type-Options": "nosniff" },
  });
}
