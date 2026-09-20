export type ReviewLensId = "behavior" | "permissions" | "weaker_tests" | "error_handling";

export const REVIEW_LENSES: {
  id: ReviewLensId;
  label: string;
  description: string;
  statement: string;
}[] = [
  {
    id: "behavior",
    label: "Behavior",
    description: "Changes what the running application does",
    statement:
      "This hunk changes application runtime behavior, including failure behavior or externally observable results. A test, documentation, formatting, or name-only change is not itself a runtime behavior change.",
  },
  {
    id: "permissions",
    label: "Access control",
    description: "Changes who can read, write, or act",
    statement:
      "This hunk changes a runtime authorization or access-control rule: who may read, write, invoke an operation, or access a resource. Merely mentioning a role or editing a permissions test is not enough.",
  },
  {
    id: "weaker_tests",
    label: "Weaker tests",
    description: "Makes a previous guarantee less strict",
    statement:
      "This hunk weakens or removes an existing automated test guarantee, so an implementation that previously failed the test could now pass. Added tests and equivalent assertion rewrites do not qualify.",
  },
  {
    id: "error_handling",
    label: "Error handling",
    description: "Changes propagation, recovery, or retry",
    statement:
      "This hunk changes runtime handling of failures: propagation, catching, fallback, retry, timeout, or recovery. Error words in comments, data, or tests alone do not qualify.",
  },
];

export type ReviewHunk = {
  id: string;
  path: string;
  section: string;
  context: string;
  diff: string;
};

export const REVIEW_HUNKS: ReviewHunk[] = [
  {
    id: "batch_delivery",
    path: "src/webhooks/delivery.ts",
    section: "deliverBatch",
    context:
      "postJSON rejects on transport failures or non-success HTTP responses. The returned array is consumed by the API as successful delivery IDs.",
    diff: `@@ -24,5 +24,11 @@ export async function deliverBatch(endpoints, event) {
-  return await Promise.all(endpoints.map(async (endpoint) => {
-    await postJSON(endpoint.url, event);
-    return endpoint.id;
-  }));
+  const delivered = [];
+  for (const endpoint of endpoints) {
+    try {
+      await postJSON(endpoint.url, event);
+      delivered.push(endpoint.id);
+    } catch (error) {
+      logger.warn({ endpointId: endpoint.id, error }, "Delivery skipped");
+    }
+  }
+  return delivered;
 }`,
  },
  {
    id: "retry_role",
    path: "src/api/deliveries/retry.ts",
    section: "POST /deliveries/:id/retry",
    context:
      "requireRole permits the named role and higher roles in the same workspace. Hierarchy: viewer < member < maintainer < owner. enqueueRetry submits a delivery job.",
    diff: `@@ -18,5 +18,5 @@ export async function retryDelivery(request, deliveryId) {
   const actor = await authenticate(request);
-  await requireRole(actor, "maintainer");
+  await requireRole(actor, "member");
   const job = await enqueueRetry(deliveryId);
   return json(job, { status: 202 });
 }`,
  },
  {
    id: "retry_test",
    path: "tests/api/retry.test.ts",
    section: "rejects a viewer retry",
    context:
      "This is the only assertion in the test. The request uses a viewer account; status 403 is the authorization failure contract.",
    diff: `@@ -32,3 +32,3 @@ test("rejects a viewer retry", async () => {
   const response = await requestAs("viewer", "/deliveries/d1/retry");
-  expect(response.status).toBe(403);
+  expect(response.status).not.toBe(500);
 });`,
  },
  {
    id: "types_format",
    path: "src/webhooks/types.ts",
    section: "DeliveryResult",
    context: "Type formatting only; the same fields, types, and optionality are retained.",
    diff: `@@ -5,1 +5,5 @@
-export type DeliveryResult = { id: string; status: number; attempt: number };
+export type DeliveryResult = {
+  id: string;
+  status: number;
+  attempt: number;
+};`,
  },
  {
    id: "auth_rename",
    path: "src/auth/roles.ts",
    section: "canReadProject",
    context:
      "This is the whole function. Both arrays contain the same strings in the same order. The local constant is referenced nowhere else.",
    diff: `@@ -41,3 +41,3 @@ export function canReadProject(role: Role) {
-  const readableRoles = ["viewer", "member", "maintainer", "owner"];
-  return readableRoles.includes(role);
+  const readRoles = ["viewer", "member", "maintainer", "owner"];
+  return readRoles.includes(role);
 }`,
  },
  {
    id: "timeout",
    path: "src/http/post-json.ts",
    section: "postJSON",
    context:
      "AbortSignal.timeout aborts the fetch if its duration elapses. No caller-supplied timeout overrides this value.",
    diff: `@@ -9,6 +9,6 @@ export async function postJSON(url, body) {
   return await fetch(url, {
     method: "POST",
     body: JSON.stringify(body),
-    signal: AbortSignal.timeout(10_000),
+    signal: AbortSignal.timeout(4_000),
   });
 }`,
  },
  {
    id: "new_batch_test",
    path: "tests/webhooks/delivery.test.ts",
    section: "keeps the next endpoint alive",
    context: "A new test is added. No previous assertion or test is removed.",
    diff: `@@ -51,0 +52,7 @@
+test("keeps the next endpoint alive", async () => {
+  postJSON.mockRejectedValueOnce(new Error("offline"));
+  postJSON.mockResolvedValueOnce({ ok: true });
+  const delivered = await deliverBatch([endpointA, endpointB], event);
+  expect(delivered).toEqual([endpointB.id]);
+  expect(postJSON).toHaveBeenCalledTimes(2);
+});`,
  },
  {
    id: "fixture_text",
    path: "tests/fixtures/events.ts",
    section: "event labels",
    context:
      "This string is sample payload data shown in snapshot tests. It is not evaluated as code.",
    diff: `@@ -12,4 +12,4 @@ export const sampleEvent = {
   id: "evt_001",
-  title: "A normal event",
+  title: "try / catch / throw: debugging a webhook",
   type: "incident.created",
 };`,
  },
  {
    id: "empty_response",
    path: "src/api/deliveries/list.ts",
    section: "empty list response",
    context:
      "json produces an HTTP response. Consumers previously received 404 when a workspace had no delivery records.",
    diff: `@@ -27,4 +27,4 @@ export async function listDeliveries(workspaceId) {
   const deliveries = await db.deliveries.findMany({ workspaceId });
-  if (!deliveries.length) return json({ error: "Not found" }, { status: 404 });
+  if (!deliveries.length) return json({ deliveries: [] }, { status: 200 });
   return json({ deliveries });
 }`,
  },
  {
    id: "readme",
    path: "README.md",
    section: "local development",
    context: "Documentation-only wording. There are no executable commands in this hunk.",
    diff: `@@ -45,2 +45,2 @@ Local development
-Open the delivery dashboard to see your events.
+Open the delivery dashboard to inspect recent events and their attempts.
 The dashboard refreshes every five seconds.`,
  },
  {
    id: "backoff",
    path: "src/jobs/retry.ts",
    section: "retry delay",
    context:
      "attempt is zero-based and the resulting delay is used by the job scheduler before retrying a failed request.",
    diff: `@@ -14,2 +14,2 @@ export function nextRetryDelay(attempt: number) {
-  return 1_000;
+  return Math.min(60_000, 1_000 * 2 ** attempt);
 }`,
  },
  {
    id: "test_snapshot",
    path: "tests/webhooks/history.test.ts",
    section: "persists delivery history",
    context:
      "The removed expectation checked the full stored object. The replacement only checks its ID, leaving status, attempt, and endpoint unchecked.",
    diff: `@@ -19,7 +19,2 @@ test("persists delivery history", async () => {
-  expect(saved).toEqual({
-    id: "d1",
-    endpointId: "ep1",
-    status: 202,
-    attempt: 2,
-  });
+  expect(saved.id).toBe("d1");
 });`,
  },
];

export const REVIEW_CONTEXT = {
  project: "Relay",
  provenance: "Authored synthetic pull request; no genuine repository or customer data.",
  title: "Retry delivery failures without dropping the batch",
  baseRevision: "fixture/d34a9ce",
  headRevision: "fixture/f81b6a0",
  description:
    "Mixed changes to a webhook delivery service, API handlers, tests, and documentation.",
};
