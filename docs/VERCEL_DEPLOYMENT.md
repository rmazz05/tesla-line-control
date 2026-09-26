# Vercel deployment

The Vercel project is `ricky-projects/tesla-line-control`. Deploy the current working directory with `npx vercel --prod`. Local, uncommitted source changes are included; no Git push is required.

Production requires these server-only environment variables:

- `OPENAI_API_KEY`: natural-language incident assessment.
- `DATABASE_URL`: the pooled Postgres URL from the Neon integration.
- `OPENAI_MODEL`: optional model override; the existing default applies when omitted.

Neon is provisioned on its free plan in Frankfurt; Vercel functions also run in Frankfurt. The database is connected to Production. Preview deployments need their own database configuration before their shared sessions can work.

Initialize a new database once, before deploying:

```bash
npx vercel env pull .env.vercel.production.local --environment production
node --env-file=.env.vercel.production.local scripts/setup-database.mjs
```

The setup script only creates the session table if it is absent. Postgres transactions and per-session advisory locks serialize updates across serverless instances, including simultaneous room creation. Failed updates roll back. Manager workspaces persist, while audience rooms keep their existing 12-hour inactivity expiry. Expired audience records are treated as absent when accessed; storage is not automatically purged.

Local demos continue using `.manager-workspaces` and `.audience-demo` when `DATABASE_URL` is absent. Those existing local sessions are not uploaded. The cloud starts with fresh sessions. Both directories and `.env*` are excluded from deployments.

## Verification

```bash
npm test
npm run lint
npm run build
node --env-file=.env.vercel.production.local --import tsx --test tests/shared-state.integration.test.ts
```

The integration test requires database setup and uses unique temporary session IDs, then removes only its own records. It verifies concurrent updates from separate processes, rollback, namespace isolation, and shared audience assignments. Without `DATABASE_URL`, it is skipped by the normal local test suite.

After deployment, verify workspace creation, cross-device updates, room creation, joining, and fault toggles through the production API and browser. Public HTTPS pages use their own address for QR links; the local tunnel helpers are not used on Vercel.
