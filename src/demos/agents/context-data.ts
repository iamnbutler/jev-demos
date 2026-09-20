export type TranscriptMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  body: string;
  toolCallId?: string;
};

export type ContextTurn = {
  id: string;
  title: string;
  kind: "instruction" | "exchange" | "note";
  messages: TranscriptMessage[];
  protected?: boolean;
  protectionReason?: string;
};

export const DEFAULT_CONTEXT_TASK =
  "Finish the webhook retry fix. Respect Retry-After, preserve the public response shape and idempotency key, and prove that cancellation prevents a pending delivery.";

function exchange(id: string, title: string, command: string, output: string): ContextTurn {
  return {
    id,
    title,
    kind: "exchange",
    messages: [
      {
        id: `${id}-call`,
        role: "assistant",
        toolCallId: id,
        body: `TOOL CALL · shell\n${command}`,
      },
      { id: `${id}-result`, role: "tool", toolCallId: id, body: output },
    ],
  };
}

/** Authored, synthetic material. These are not captures of an actual agent session. */
export const CONTEXT_TURNS: ContextTurn[] = [
  {
    id: "constraints",
    title: "Original requirements",
    kind: "instruction",
    protected: true,
    protectionReason: "Explicit user constraints are never removed by model ranking.",
    messages: [
      {
        id: "constraints-user",
        role: "user",
        body: 'Fix webhook retries without adding dependencies. Keep MAX_ATTEMPTS = 5. Every attempt must reuse the original idempotency key. Preserve the exported deliver() result union: { status: "delivered", attempts: number } | { status: "cancelled", attempts: number } | { status: "failed", attempts: number }. A cancelled delivery must never send again. Do not turn cancellation into a thrown error. The existing implementation is intentionally dependency-free.',
      },
    ],
  },
  exchange(
    "repo-shape",
    "Map the package",
    "pwd && rg --files packages/webhooks | head -25",
    "Exit code: 0\n/work/harbor\npackages/webhooks/package.json\npackages/webhooks/src/deliver.ts\npackages/webhooks/src/retry.ts\npackages/webhooks/src/http.ts\npackages/webhooks/src/signature.ts\npackages/webhooks/test/retry.test.ts\npackages/webhooks/test/deliver.test.ts\npackages/webhooks/test/signature.test.ts\npackages/webhooks/README.md\nThe package uses Bun tests and exports deliver() from src/deliver.ts.",
  ),
  exchange(
    "retry-source",
    "Read the original retry logic",
    "cat packages/webhooks/src/retry.ts",
    "Exit code: 0\nexport const MAX_ATTEMPTS = 5;\nexport function retryDelay(header: string | null, attempt: number): number {\n  const parsed = Number(header);\n  if (header !== null && Number.isFinite(parsed)) return parsed;\n  return Math.min(30_000, 250 * 2 ** attempt);\n}\nexport const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));\n// retryDelay returns milliseconds; Retry-After delta-seconds arrives as a string.\n// HTTP-date values currently fall back to exponential backoff.",
  ),
  exchange(
    "delivery-source",
    "Find delivery and cancellation behavior",
    "cat packages/webhooks/src/deliver.ts",
    'Exit code: 0\nexport async function deliver(job, { signal, fetcher = fetch }) {\n  let attempts = 0;\n  while (attempts < MAX_ATTEMPTS) {\n    if (signal?.aborted) return { status: "cancelled", attempts };\n    const response = await fetcher(job.url, {\n      method: "POST", body: job.body, signal,\n      headers: { "Idempotency-Key": job.idempotencyKey },\n    });\n    attempts++;\n    if (response.ok) return { status: "delivered", attempts };\n    if (response.status !== 429 && response.status < 500) break;\n    await sleep(retryDelay(response.headers.get("Retry-After"), attempts));\n  }\n  return { status: "failed", attempts };\n}\nThe check before each send avoids a second send after an abort, but sleep itself cannot be interrupted. An abort while fetch is in flight currently rejects the outer function.',
  ),
  exchange(
    "old-module-error",
    "Initial test setup error",
    "bun test packages/webhooks/test/retry.test.ts",
    'Exit code: 1\nerror: Cannot find module "@harbor/test-clock" from "packages/webhooks/test/retry.test.ts"\n0 tests ran.\nThis command ran before workspace dependencies were installed. It does not establish whether retry behavior is correct.',
  ),
  exchange(
    "install",
    "Restore workspace dependencies",
    "bun install --frozen-lockfile",
    "Exit code: 0\nbun install v1.4.0\nChecked 182 installs across 211 packages (no changes).\nLinked workspace package @harbor/test-clock at packages/test-clock.\nThe previous module resolution failure no longer reproduces after this command.",
  ),
  exchange(
    "baseline-tests",
    "Capture the actual failing assertions",
    "bun test packages/webhooks/test/retry.test.ts packages/webhooks/test/deliver.test.ts",
    'Exit code: 1\nPASS retryDelay uses exponential backoff without a header\nFAIL retryDelay respects delta-seconds\n  expected retryDelay("3", 1) to equal 3000\n  received 3\nFAIL cancellation while waiting resolves promptly\n  abort at t=50ms; deliver still pending at t=500ms\nPASS cancelled delivery does not make a second network request\nPASS attempts reuse the original Idempotency-Key\nPASS returns failed after five attempts\n4 passed, 2 failed. The cancellation fixture uses an AbortController and a fake clock, with no actual network.',
  ),
  {
    id: "design-note",
    title: "Old but important design decision",
    kind: "note",
    messages: [
      {
        id: "design-note-assistant",
        role: "assistant",
        body: "The baseline distinguishes two cancellation properties: no second send already passes; prompt completion while waiting fails. Make the wait abortable, remove its abort listener on both paths, and preserve the cancelled result union. Retry-After supports delta-seconds and HTTP-date; clamp past dates to zero. Do not regenerate job.idempotencyKey inside the loop. A green retryDelay test alone will not prove cancellation behavior.",
      },
    ],
  },
  exchange(
    "readme",
    "Read the package overview",
    "cat packages/webhooks/README.md",
    "Exit code: 0\n# Harbor webhooks\nSmall webhook sender for internal integrations.\nInstall with bun install. Run the package suite with bun test packages/webhooks/test.\nDelivery retries transient 429 and 5xx responses. Callers provide a stable idempotency key. The API returns a delivery status and count of attempted sends.\nDevelopment: keep changes inside packages/webhooks. No external services are required by the test fixtures.\nMaintainers: the platform integrations team.",
  ),
  exchange(
    "signature-detour",
    "Inspect an unrelated signature helper",
    "cat packages/webhooks/src/signature.ts",
    'Exit code: 0\nimport { createHmac, timingSafeEqual } from "node:crypto";\nexport function sign(body, key) {\n  return createHmac("sha256", key).update(body).digest("hex");\n}\nexport function verify(body, key, incoming) {\n  const expected = Buffer.from(sign(body, key), "hex");\n  const actual = Buffer.from(incoming, "hex");\n  return expected.length === actual.length && timingSafeEqual(expected, actual);\n}\nNo references to retryDelay, delivery attempts, timers, or AbortSignal appear in this file.',
  ),
  exchange(
    "reread-retry",
    "Read the same retry helper again",
    'sed -n "1,80p" packages/webhooks/src/retry.ts',
    "Exit code: 0\nexport const MAX_ATTEMPTS = 5;\nexport function retryDelay(header: string | null, attempt: number): number {\n  const parsed = Number(header);\n  if (header !== null && Number.isFinite(parsed)) return parsed;\n  return Math.min(30_000, 250 * 2 ** attempt);\n}\nexport const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));\nThis is the same file revision as the earlier retry-source read; no changes have been applied yet.",
  ),
  exchange(
    "header-fix",
    "Implement header units and dates",
    "apply_patch packages/webhooks/src/retry.ts",
    'Exit code: 0\nApplied patch:\n-export function retryDelay(header, attempt) {\n+export function retryDelay(header, attempt, now = Date.now()) {\n   const parsed = Number(header);\n-  if (header !== null && Number.isFinite(parsed)) return parsed;\n+  if (header !== null && header.trim() !== "" && Number.isFinite(parsed)) return Math.max(0, parsed * 1000);\n+  const date = header === null ? NaN : Date.parse(header);\n+  if (Number.isFinite(date)) return Math.max(0, date - now);\n   return Math.min(30_000, 250 * 2 ** attempt);\n }\nMAX_ATTEMPTS remains 5. No change to deliver() or sleep() yet.',
  ),
  exchange(
    "header-tests",
    "Confirm the focused parsing tests",
    "bun test packages/webhooks/test/retry.test.ts",
    "Exit code: 0\nPASS delta-seconds multiply by 1000\nPASS HTTP-date uses the supplied clock\nPASS past HTTP-date clamps to zero\nPASS missing header uses bounded backoff\nPASS invalid header uses bounded backoff\n5 passed, 0 failed.\nOnly retry.test.ts ran. This command did not execute deliver.test.ts and gives no evidence about prompt cancellation or network sends.",
  ),
  exchange(
    "wait-draft",
    "Draft an abortable wait",
    "apply_patch packages/webhooks/src/retry.ts",
    'Exit code: 0\nApplied patch replacing sleep():\nexport function sleep(ms, signal) {\n  return new Promise((resolve, reject) => {\n    const timer = setTimeout(resolve, ms);\n    signal?.addEventListener("abort", () => {\n      clearTimeout(timer);\n      reject(new DOMException("Aborted", "AbortError"));\n    });\n  });\n}\nThis draft rejects on cancellation, does not remove the listener after successful completion, and has not yet been connected to deliver().',
  ),
  exchange(
    "delivery-reread",
    "Locate the call site before wiring the wait",
    'rg -n "sleep|cancelled|Abort" packages/webhooks/src/deliver.ts packages/webhooks/test/deliver.test.ts',
    'Exit code: 0\nsrc/deliver.ts:4: if (signal?.aborted) return { status: "cancelled", attempts };\nsrc/deliver.ts:15: await sleep(retryDelay(response.headers.get("Retry-After"), attempts));\ntest/deliver.test.ts:42: test("cancelled delivery does not make a second network request", ...);\ntest/deliver.test.ts:63: test("cancellation while waiting resolves promptly", ...);\ntest/deliver.test.ts:88: test("an already aborted signal makes zero requests", ...);\nThe call site still omits the signal. Cancellation must return a normal status, according to the original user instruction.',
  ),
  exchange(
    "working-diff",
    "Inspect the current patch, not the original file",
    "git diff --stat && git diff -- packages/webhooks/src/retry.ts packages/webhooks/src/deliver.ts",
    "Exit code: 0\npackages/webhooks/src/retry.ts | 19 ++++++++++++++-----\n1 file changed, 14 insertions(+), 5 deletions(-)\nCurrent patch contains Retry-After parsing plus the abortable sleep draft. deliver.ts is unchanged.\nThe sleep draft still rejects on abort and leaves its listener attached after normal resolution.\nNo lockfile, dependency, signature, or public type changes.\nNo tests of the abortable sleep draft have been added or run yet.",
  ),
  exchange(
    "recent-status",
    "Record the last verification boundary",
    "git status --short && bun test packages/webhooks/test/retry.test.ts",
    "Exit code: 0\n M packages/webhooks/src/retry.ts\nPASS delta-seconds multiply by 1000\nPASS HTTP-date uses the supplied clock\nPASS past HTTP-date clamps to zero\nPASS missing header uses bounded backoff\nPASS invalid header uses bounded backoff\n5 passed, 0 failed.\nThis repeats the focused parsing suite. The deliver suite was last run at baseline and still needs to be rerun after the wait is wired.",
  ),
  {
    id: "latest-user",
    title: "Latest user direction",
    kind: "instruction",
    protected: true,
    protectionReason: "The latest user instruction stays in the retained context.",
    messages: [
      {
        id: "latest-user-message",
        role: "user",
        body: "Please finish the cancellation part, not just the header parsing. Keep the response shape we agreed on. I need a test showing the pending wait finishes promptly, the abort listener is cleaned up, and no extra delivery is sent after abort. Report exactly which tests ran; do not describe the focused retryDelay suite as the full package suite.",
      },
    ],
  },
];
