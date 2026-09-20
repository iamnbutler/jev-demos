export type SourceFunction = {
  id: string;
  name: string;
  path: string;
  startLine: number;
  code: string;
};

export const CODE_QUERIES = [
  {
    label: "Catch & continue",
    query: "Catches an error and continues processing other records instead of failing the batch.",
  },
  {
    label: "Log & rethrow",
    query: "Handles an error by logging it and then throwing it again to the caller.",
  },
  {
    label: "Persistent writes",
    query: "Writes or deletes data in persistent storage.",
  },
  {
    label: "Ownership checks",
    query:
      "Checks whether the current user is the owner of the requested resource and rejects other users.",
  },
  {
    label: "Graceful fallback",
    query: "Returns a usable fallback value when an external service fails.",
  },
  {
    label: "Fire & forget",
    query: "Starts asynchronous work without waiting for that work to complete before returning.",
  },
];

export const SOURCE_FUNCTIONS: SourceFunction[] = [
  {
    id: "deliver_batch",
    name: "deliverBatch",
    path: "src/webhooks/delivery.ts",
    startLine: 24,
    code: `export async function deliverBatch(endpoints: Endpoint[], event: Event) {
  const delivered: string[] = [];
  const failed: string[] = [];
  for (const endpoint of endpoints) {
    try {
      await postJSON(endpoint.url, event, { timeoutMs: 4_000 });
      delivered.push(endpoint.id);
    } catch (error) {
      logger.warn({ endpointId: endpoint.id, error }, "Delivery failed");
      failed.push(endpoint.id);
    }
  }
  return { delivered, failed };
}`,
  },
  {
    id: "read_settings",
    name: "readProjectSettings",
    path: "src/projects/settings.ts",
    startLine: 18,
    code: `export async function readProjectSettings(projectId: string) {
  try {
    const raw = await settingsStore.read(projectId);
    return settingsSchema.parse(raw);
  } catch (error) {
    logger.error({ projectId, error }, "Cannot continue without settings");
    throw error;
  }
}`,
  },
  {
    id: "sync_members",
    name: "syncMembers",
    path: "src/members/sync.ts",
    startLine: 41,
    code: `export async function syncMembers(rows: ImportedMember[]) {
  const result = { applied: 0, skipped: [] as string[] };
  for (const row of rows) {
    try {
      await db.members.upsert({ email: row.email, role: row.role });
      result.applied += 1;
    } catch (error) {
      result.skipped.push(row.email);
      logger.warn({ email: row.email, error }, "Member skipped");
      continue;
    }
  }
  return result;
}`,
  },
  {
    id: "transaction",
    name: "withTransaction",
    path: "src/storage/transaction.ts",
    startLine: 8,
    code: `export async function withTransaction<T>(work: (tx: Tx) => Promise<T>) {
  const tx = await db.begin();
  try {
    const value = await work(tx);
    await tx.commit();
    return value;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}`,
  },
  {
    id: "avatar",
    name: "loadAvatar",
    path: "src/profile/avatar.ts",
    startLine: 12,
    code: `export async function loadAvatar(user: User): Promise<Avatar> {
  try {
    const response = await fetch(user.avatarUrl);
    if (!response.ok) throw new Error("Avatar unavailable");
    return { kind: "image", blob: await response.blob() };
  } catch {
    return { kind: "initials", text: user.name.slice(0, 2).toUpperCase() };
  }
}`,
  },
  {
    id: "audit_event",
    name: "writeAuditEvent",
    path: "src/audit/events.ts",
    startLine: 9,
    code: `export async function writeAuditEvent(event: AuditEvent) {
  try {
    return await db.audit.insert({ ...event, createdAt: new Date() });
  } catch (error) {
    logger.warn({ error, action: event.action }, "Audit storage unavailable");
    return null;
  }
}`,
  },
  {
    id: "session",
    name: "loadSession",
    path: "src/auth/session.ts",
    startLine: 34,
    code: `export async function loadSession(token: string) {
  try {
    const claims = await verifySignature(token, sessionKey);
    if (claims.expiresAt < Date.now()) return null;
    return await db.sessions.find(claims.sessionId);
  } catch (error) {
    if (error instanceof InvalidSignatureError) return null;
    throw error;
  }
}`,
  },
  {
    id: "receipt",
    name: "sendReceipt",
    path: "src/mail/receipts.ts",
    startLine: 20,
    code: `export async function sendReceipt(order: Order) {
  try {
    await mailer.send({ to: order.email, template: "receipt", order });
    return { status: "sent" as const };
  } catch (error) {
    logger.error({ orderId: order.id, error }, "Receipt delivery failed");
    throw error;
  }
}`,
  },
  {
    id: "parse_envelope",
    name: "parseEnvelope",
    path: "src/webhooks/envelope.ts",
    startLine: 5,
    code: `export function parseEnvelope(body: string): Envelope {
  try {
    return envelopeSchema.parse(JSON.parse(body));
  } catch (error) {
    throw new InvalidPayloadError("Malformed webhook payload", { cause: error });
  }
}`,
  },
  {
    id: "expire_sessions",
    name: "expireSessions",
    path: "src/auth/cleanup.ts",
    startLine: 15,
    code: `export async function expireSessions(now: Date) {
  const expired = await db.sessions.findMany({ expiresBefore: now });
  for (const session of expired) {
    await db.sessions.delete(session.id);
  }
  return expired.length;
}`,
  },
  {
    id: "retry_request",
    name: "requestWithRetry",
    path: "src/http/retry.ts",
    startLine: 7,
    code: `export async function requestWithRetry(url: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      return response;
    } catch (error) {
      if (attempt === 2) throw error;
      await delay(250 * 2 ** attempt);
    }
  }
  throw new Error("Unreachable");
}`,
  },
  {
    id: "metric",
    name: "recordPageView",
    path: "src/telemetry/page-view.ts",
    startLine: 11,
    code: `export function recordPageView(path: string) {
  void metrics.emit("page.view", { path }).catch((error) => {
    logger.debug({ error }, "Metric dropped");
  });
  return { accepted: true };
}`,
  },
  {
    id: "headers",
    name: "normalizeHeaders",
    path: "src/http/headers.ts",
    startLine: 3,
    code: `export function normalizeHeaders(input: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key.toLowerCase().trim(),
      value.trim(),
    ]),
  );
}`,
  },
  {
    id: "find_workspace",
    name: "findWorkspaceBySlug",
    path: "src/workspaces/queries.ts",
    startLine: 26,
    code: `export async function findWorkspaceBySlug(slug: string) {
  const normalized = slug.toLowerCase().trim();
  return await db.workspaces.findOne({ slug: normalized, archived: false });
}`,
  },
  {
    id: "record_delivery",
    name: "recordDelivery",
    path: "src/webhooks/history.ts",
    startLine: 17,
    code: `export async function recordDelivery(endpointId: string, result: DeliveryResult) {
  const receipt = await db.deliveries.insert({
    endpointId,
    status: result.status,
    attempt: result.attempt,
    completedAt: new Date(),
  });
  await db.endpoints.update(endpointId, { lastDeliveryId: receipt.id });
  return receipt;
}`,
  },
  {
    id: "require_owner",
    name: "requireProjectOwner",
    path: "src/auth/authorization.ts",
    startLine: 52,
    code: `export async function requireProjectOwner(actor: Actor, projectId: string) {
  const project = await db.projects.findOne({ id: projectId });
  if (!project) throw new NotFoundError("Project not found");
  if (project.ownerId !== actor.id) {
    throw new ForbiddenError("Only the project owner may do this");
  }
  return project;
}`,
  },
];

export const SOURCE_CONTEXT = {
  project: "Relay, an authored TypeScript webhook service",
  revision: "fixture/source-v1",
  provenance: "Authored synthetic code snapshot for this demo; not a real repository.",
  contracts: [
    "db is a persistent database. Methods named insert, update, upsert, and delete mutate stored data; find methods read it.",
    "postJSON throws on transport failure and non-success HTTP responses.",
    "settingsStore.read and mailer.send can reject. settingsSchema.parse can throw.",
    "logger methods are synchronous logging. metrics.emit returns a Promise.",
    "Only the displayed function bodies and these contracts are available; do not invent behavior for other callees.",
  ],
};
