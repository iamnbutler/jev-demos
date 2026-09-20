export type HistoryFacetId = "behavior" | "migration" | "permissions" | "tests";

export const HISTORY_FACETS: {
  id: HistoryFacetId;
  label: string;
  statement: string;
}[] = [
  {
    id: "behavior",
    label: "Product behavior",
    statement:
      "The commit changes an observable behavior of the running application. Tests, documentation, formatting, and a storage schema change without an application behavior change are not sufficient by themselves. Reverts can change runtime behavior.",
  },
  {
    id: "migration",
    label: "Data migrations",
    statement:
      "The commit introduces or changes a database schema migration or a migration of existing persisted data. A runtime database query alone is not a migration.",
  },
  {
    id: "permissions",
    label: "Access control",
    statement:
      "The commit changes a runtime access-control rule or how that rule is enforced, affecting who can read or modify a resource. Permission tests alone are not a runtime rule change.",
  },
  {
    id: "tests",
    label: "Tests",
    statement:
      "The commit adds, modifies, or removes automated tests or test assertions. A comment claiming that something was tested is not enough.",
  },
];

export type HistoryCommit = {
  id: string;
  sha: string;
  message: string;
  author: string;
  date: string;
  path: string;
  diff: string;
  context?: string;
  reverts?: string;
};

export const HISTORY_COMMITS: HistoryCommit[] = [
  {
    id: "c01",
    sha: "a1c04f2",
    message: "tidy up",
    author: "Alex",
    date: "2026-09-01",
    path: "src/api/events/list.ts",
    diff: `@@ -17,2 +17,2 @@ export async function listEvents(query) {
-  const limit = Number(query.limit) || 20;
+  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
   return db.events.findMany({ take: limit });`,
  },
  {
    id: "c02",
    sha: "b2d18e3",
    message: "small polish",
    author: "Sam",
    date: "2026-09-01",
    path: "src/ui/EmptyState.tsx",
    diff: `@@ -9,2 +9,2 @@ export function EmptyState() {
-  return <p>No data.</p>;
+  return <p>No deliveries yet. Send your first event to get started.</p>;
 }`,
  },
  {
    id: "c03",
    sha: "c3e29d4",
    message: "prep for next step",
    author: "Alex",
    date: "2026-09-02",
    path: "migrations/0018_delivery_latency.sql",
    diff: `@@ -0,0 +1,3 @@
+ALTER TABLE deliveries ADD COLUMN latency_ms INTEGER;
+CREATE INDEX deliveries_endpoint_created
+  ON deliveries(endpoint_id, created_at DESC);`,
  },
  {
    id: "c04",
    sha: "d4f30c5",
    message: "cover edge case",
    author: "Mika",
    date: "2026-09-02",
    path: "tests/api/events.test.ts",
    diff: `@@ -42,0 +43,5 @@
+test("caps a requested page size", async () => {
+  await seedEvents(150);
+  const response = await client.get("/events?limit=9999");
+  expect(response.body.events).toHaveLength(100);
+});`,
  },
  {
    id: "c05",
    sha: "e5a41b6",
    message: "follow-up",
    author: "Sam",
    date: "2026-09-03",
    path: "src/api/projects/delete.ts",
    context:
      "requireMember accepted every workspace member. requireOwner requires ownership of the project.",
    diff: `@@ -12,3 +12,3 @@ export async function deleteProject(actor, projectId) {
-  await requireMember(actor, projectId);
+  await requireOwner(actor, projectId);
   await db.projects.delete(projectId);
 }`,
  },
  {
    id: "c06",
    sha: "f6b52a7",
    message: "cleanup",
    author: "Mika",
    date: "2026-09-03",
    path: "src/ui/Button.tsx",
    diff: `@@ -5,1 +5,5 @@
-type Props = { disabled?: boolean; children: ReactNode; onClick: () => void };
+type Props = {
+  disabled?: boolean;
+  children: ReactNode;
+  onClick: () => void;
+};`,
  },
  {
    id: "c07",
    sha: "a7c63b8",
    message: "more reliable",
    author: "Alex",
    date: "2026-09-04",
    path: "src/jobs/retry.ts",
    diff: `@@ -8,2 +8,2 @@ export function retryDelay(attempt) {
-  return 1000;
+  return Math.min(60_000, 1000 * 2 ** attempt);
 }`,
  },
  {
    id: "c08",
    sha: "b8d74c9",
    message: "docs",
    author: "Sam",
    date: "2026-09-04",
    path: "docs/local-development.md",
    diff: `@@ -8,1 +8,3 @@ Local development
 Run the development server.
+
+The seeded workspace contains example webhook deliveries.`,
  },
  {
    id: "c09",
    sha: "c9e85d0",
    message: "unblock dashboard",
    author: "Mika",
    date: "2026-09-05",
    path: "src/api/secrets/list.ts",
    context:
      "A viewer has read-only dashboard access. A maintainer can manage webhook secrets. listSecrets returns secret values.",
    diff: `@@ -14,2 +14,2 @@ export async function listSecrets(actor, workspaceId) {
-  await requireRole(actor, workspaceId, "maintainer");
+  await requireRole(actor, workspaceId, "viewer");
   return db.secrets.findMany({ workspaceId });`,
  },
  {
    id: "c10",
    sha: "dae96f1",
    message: "fixtures",
    author: "Alex",
    date: "2026-09-05",
    path: "tests/api/secrets.test.ts",
    diff: `@@ -0,0 +1,4 @@
+test("does not expose secrets to a viewer", async () => {
+  const response = await requestAs("viewer", "/secrets");
+  expect(response.status).toBe(403);
+});`,
  },
  {
    id: "c11",
    sha: "ebfa702",
    message: "finish the plumbing",
    author: "Sam",
    date: "2026-09-06",
    path: "src/webhooks/delivery.ts",
    diff: `@@ -29,3 +29,5 @@ export async function deliver(endpoint, event) {
+  const started = performance.now();
   const response = await postJSON(endpoint.url, event);
+  const latencyMs = Math.round(performance.now() - started);
-  await db.deliveries.insert({ status: response.status });
+  await db.deliveries.insert({ status: response.status, latencyMs });
 }`,
  },
  {
    id: "c12",
    sha: "fc0b813",
    message: "back this out",
    author: "Mika",
    date: "2026-09-06",
    path: "src/api/secrets/list.ts",
    reverts: "c09",
    context:
      "Explicit fixture revert of c09; its patch is reversed. The selected revision once again requires maintainer access.",
    diff: `@@ -14,2 +14,2 @@ export async function listSecrets(actor, workspaceId) {
-  await requireRole(actor, workspaceId, "viewer");
+  await requireRole(actor, workspaceId, "maintainer");
   return db.secrets.findMany({ workspaceId });`,
  },
  {
    id: "c13",
    sha: "ad1c924",
    message: "preparation",
    author: "Alex",
    date: "2026-09-07",
    path: "migrations/0019_archive.sql",
    diff: `@@ -0,0 +1,4 @@
+ALTER TABLE projects ADD COLUMN archived_at TEXT;
+UPDATE projects
+  SET archived_at = updated_at
+  WHERE status = 'archived';`,
  },
  {
    id: "c14",
    sha: "be2da35",
    message: "wire it up",
    author: "Sam",
    date: "2026-09-07",
    path: "src/api/projects/list.ts",
    diff: `@@ -20,2 +20,2 @@ export async function listProjects(workspaceId) {
-  return db.projects.findMany({ workspaceId });
+  return db.projects.findMany({ workspaceId, archivedAt: null });
 }`,
  },
  {
    id: "c15",
    sha: "cf3eb46",
    message: "safety net",
    author: "Mika",
    date: "2026-09-08",
    path: "tests/projects/archive.test.ts",
    diff: `@@ -0,0 +1,6 @@
+test("hides archived projects from the default list", async () => {
+  await seedProject({ id: "active", archivedAt: null });
+  await seedProject({ id: "old", archivedAt: "2026-08-01" });
+  const projects = await listProjects(workspace.id);
+  expect(projects.map((project) => project.id)).toEqual(["active"]);
+});`,
  },
  {
    id: "c16",
    sha: "d04fc57",
    message: "speed up ingestion",
    author: "Alex",
    date: "2026-09-08",
    path: "src/api/events/create.ts",
    diff: `@@ -22,4 +22,4 @@ export async function createEvent(input) {
   const event = await db.events.insert(input);
-  await queue.publish(event);
+  void queue.publish(event);
   return json(event, { status: 201 });
 }`,
  },
  {
    id: "c17",
    sha: "e15ad68",
    message: "format",
    author: "Sam",
    date: "2026-09-09",
    path: "src/http/headers.ts",
    diff: `@@ -3,1 +3,4 @@
-export const HEADERS = { "content-type": "application/json", "cache-control": "no-store" };
+export const HEADERS = {
+  "content-type": "application/json",
+  "cache-control": "no-store",
+};`,
  },
  {
    id: "c18",
    sha: "f26be79",
    message: "restore the guarantee",
    author: "Mika",
    date: "2026-09-09",
    path: "src/api/events/create.ts",
    reverts: "c16",
    context:
      "Explicit fixture revert of c16. queue.publish returns a Promise that rejects when the queue fails.",
    diff: `@@ -22,4 +22,4 @@ export async function createEvent(input) {
   const event = await db.events.insert(input);
-  void queue.publish(event);
+  await queue.publish(event);
   return json(event, { status: 201 });
 }`,
  },
  {
    id: "c19",
    sha: "a37cf8a",
    message: "align expectations",
    author: "Alex",
    date: "2026-09-10",
    path: "tests/api/events.test.ts",
    diff: `@@ -61,2 +61,3 @@ test("persists a delivery", async () => {
-  expect(delivery.status).toBeDefined();
+  expect(delivery.status).toBe(202);
+  expect(delivery.attempt).toBe(1);
 });`,
  },
  {
    id: "c20",
    sha: "b48d09b",
    message: "handle the empty state",
    author: "Sam",
    date: "2026-09-10",
    path: "src/api/deliveries/list.ts",
    diff: `@@ -27,3 +27,3 @@ export async function listDeliveries(workspaceId) {
   const deliveries = await db.deliveries.findMany({ workspaceId });
-  if (!deliveries.length) return json({ error: "Not found" }, { status: 404 });
+  if (!deliveries.length) return json({ deliveries: [] }, { status: 200 });
   return json({ deliveries });`,
  },
  {
    id: "c21",
    sha: "c59e1ac",
    message: "avoid duplicate work",
    author: "Mika",
    date: "2026-09-11",
    path: "src/auth/authorize.ts",
    context:
      "lookupRole reads the current role from persistent storage. roleCache retains successful lookups for 15 minutes. Roles can be revoked at any time.",
    diff: `@@ -7,2 +7,2 @@ export async function authorize(userId, projectId) {
-  const role = await lookupRole(userId, projectId);
+  const role = await roleCache.remember([userId, projectId], 900, () => lookupRole(userId, projectId));
   return canWrite(role);`,
  },
  {
    id: "c22",
    sha: "d6af2bd",
    message: "housekeeping",
    author: "Alex",
    date: "2026-09-11",
    path: "migrations/0020_backfill_attempts.sql",
    diff: `@@ -0,0 +1,3 @@
+UPDATE deliveries SET attempt = 1 WHERE attempt IS NULL;
+ALTER TABLE deliveries ALTER COLUMN attempt SET DEFAULT 1;
+ALTER TABLE deliveries ALTER COLUMN attempt SET NOT NULL;`,
  },
  {
    id: "c23",
    sha: "e7b03ce",
    message: "final pass",
    author: "Sam",
    date: "2026-09-12",
    path: "tests/auth/authorize.test.ts",
    diff: `@@ -0,0 +1,5 @@
+test("revocation takes effect on the next request", async () => {
+  expect(await authorize(user.id, project.id)).toBe(true);
+  await revokeRole(user.id, project.id);
+  expect(await authorize(user.id, project.id)).toBe(false);
+});`,
  },
  {
    id: "c24",
    sha: "f8c14df",
    message: "fix the regression",
    author: "Mika",
    date: "2026-09-12",
    path: "src/auth/authorize.ts",
    reverts: "c21",
    context:
      "Explicit fixture revert of c21. This restores reading the current role for each request.",
    diff: `@@ -7,2 +7,2 @@ export async function authorize(userId, projectId) {
-  const role = await roleCache.remember([userId, projectId], 900, () => lookupRole(userId, projectId));
+  const role = await lookupRole(userId, projectId);
   return canWrite(role);`,
  },
];

export const HISTORY_REVISIONS = [
  { id: "preview_08", label: "Preview 0.8", sha: "fc0b813", lastCommitId: "c12" },
  { id: "preview_09", label: "Preview 0.9", sha: "f8c14df", lastCommitId: "c24" },
];

export const HISTORY_CONTEXT = {
  project: "Relay",
  provenance:
    "Authored synthetic linear history. Names, dates, hashes, and patches are fixtures, not a fetched Git repository.",
  baseRevision: "fixture/092ef11",
  ordering:
    "Commits are ordered oldest to newest and form one linear chain, with no merge commits.",
  semantics:
    "A selected revision contains the prefix ending at lastCommitId. The reverts field explicitly records a patch reversal; do not infer revision membership, deployment, or release approval from natural language.",
};
