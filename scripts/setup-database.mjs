import { Pool } from "pg";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before running database setup.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(`CREATE TABLE IF NOT EXISTS line_control_state (
    namespace text NOT NULL CHECK (namespace IN ('manager', 'audience')),
    id text NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (namespace, id)
  )`);
  console.log("Shared manager and audience storage is ready.");
} finally {
  await pool.end();
}
