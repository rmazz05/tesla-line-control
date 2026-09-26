import { Pool } from "pg";

const shared = globalThis as typeof globalThis & {
  lineControlPool?: Pool;
  lineControlQueues?: Map<string, Promise<void>>;
};
const queues = shared.lineControlQueues ??= new Map<string, Promise<void>>();

export const hasSharedDatabase = () => Boolean(process.env.DATABASE_URL);

function database() {
  if (!shared.lineControlPool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for shared storage.");
    const connection = new URL(process.env.DATABASE_URL);
    // Keep certificate and hostname verification explicit for Neon URLs.
    if (connection.searchParams.get("sslmode") === "require") connection.searchParams.set("sslmode", "verify-full");
    shared.lineControlPool = new Pool({
      connectionString: connection.toString(),
      max: 5,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 10_000,
      allowExitOnIdle: true,
    });
    // An idle connection may disappear while a serverless instance is suspended.
    shared.lineControlPool.on("error", () => console.error("[shared-state] Idle database connection closed."));
  }
  return shared.lineControlPool;
}

/** Serialize each session across Vercel instances, including simultaneous creation.
 * The synchronous callback runs once under a transaction-scoped lock. A failed
 * callback rolls back without exposing a partial state to another device. */
export async function withSharedState<State, Result>(
  namespace: "manager" | "audience",
  key: string,
  update: (state: State | null) => { state: State; result: Result },
): Promise<Result> {
  // Keep bursts for one room outside the connection pool. Otherwise waiting
  // requests consume all connections while contending for the same DB lock.
  const queueKey = `${namespace}:${key}`;
  const previous = queues.get(queueKey) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  queues.set(queueKey, current);
  await previous;
  try { return await withLockedState(namespace, key, update); }
  finally { release(); if (queues.get(queueKey) === current) queues.delete(queueKey); }
}

async function withLockedState<State, Result>(
  namespace: "manager" | "audience",
  key: string,
  update: (state: State | null) => { state: State; result: Result },
): Promise<Result> {
  const client = await database().connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${namespace}:${key}`]);
    const previous = await client.query<{ payload: State }>(
      "SELECT payload FROM line_control_state WHERE namespace = $1 AND id = $2", [namespace, key],
    );
    const next = update(previous.rows[0]?.payload ?? null);
    await client.query(
      `INSERT INTO line_control_state (namespace, id, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (namespace, id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
      [namespace, key, JSON.stringify(next.state)],
    );
    await client.query("COMMIT");
    return next.result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally {
    client.release(discard);
  }
}
