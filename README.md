# Tesla Line Control

A presentation-ready production-supervisor prototype for the Tesla **Built for the Job** hackathon track.

## Run locally

Requirements:

- Node.js 20.9 or newer (Node.js 22 LTS recommended)
- npm (included with Node.js)

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

No environment variables, external services, database, or API keys are required. All demo data and 3D assets are included in the repository.

## Production build

```bash
npm run build
npm start
```

The project is a standard Next.js application and can be deployed directly to Vercel.

## Suggested demo flow

1. Start on the isolated General Assembly line and point out the three simultaneous incidents.
2. Select the glass-cell safety stop and show the raw evidence, repair-time range, containment and historical match.
3. Mark the incident as acknowledged or contained to show supervisor control.
4. Select another station to demonstrate the camera transition and reprioritized detail view.
5. Click **Report**, ask a judge for a recurring production problem, enter it in their own words and choose its current effect.
6. Show the resulting classification, priority, evidence limitations and recommended response.
7. Click **Reset demo** to restore the original scenario.

## Data model

All sensor readings, incidents and historical repair cases are mock data. The custom incident classifier is intentionally deterministic and runs locally, so the demo does not require an API key or network connection.

The bundled line assets are CC0. The focused layout is a representative prototype, not Tesla factory CAD. See [ATTRIBUTION.md](./ATTRIBUTION.md) for source and license details.
