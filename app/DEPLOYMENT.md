# Shotai Deployment

Shotai production deployment uses one Node service for both the built frontend
and the Gemini API proxy. The API key stays in the server environment.

## Required Environment

```bash
GEMINI_API_KEY=...
SHOTAI_API_HOST=0.0.0.0
SHOTAI_API_PORT=8787
SHOTAI_WEB_ORIGIN=https://your-domain.example
GEMINI_TIMEOUT_MS=25000
RATE_LIMIT_MAX=30
```

Do not configure a public deployment with a local Clash proxy.

## Local Production Check

```bash
npm ci
npm run verify
npm run build
npm start
```

Open `http://127.0.0.1:8787`. Check service status at `/health`.

## Docker

```bash
docker build -t shotai .
docker run --rm -p 8787:8787 \
  -e GEMINI_API_KEY=... \
  -e SHOTAI_WEB_ORIGIN=http://127.0.0.1:8787 \
  shotai
```

## Render

The repository-root `render.yaml` creates a Free Docker web service in
Singapore and uses `app/` as its root directory.

1. Push the repository to a private GitHub repository. `.env.local` must remain
   ignored and must never be committed.
2. In Render, choose **New > Blueprint**, connect the GitHub repository, and
   deploy the detected `render.yaml`.
3. When prompted for `GEMINI_API_KEY`, paste the key as a secret value.
4. Wait for the deploy to finish, then open the generated
   `https://shotai-preview-....onrender.com` URL.
5. Open `/health` on the generated domain and confirm that the service reports
   `apiKeyConfigured: true`.

The Render subdomain is public to anyone who knows it. For a small test, only
share it with intended testers and keep `RATE_LIMIT_MAX` low. Do not configure a
public deployment with a local Clash proxy.

Free Render web services spin down after periods without traffic, so the first
request after idle can take about a minute.

## Release Gate

- Run `npm run verify`.
- Confirm `/health` reports `apiKeyConfigured: true`.
- Test upload, AI analysis, cancellation, single export, and batch ZIP export.
- Confirm request logs contain only request IDs, paths, status codes, and
  durations. They must not contain images or API keys.
- Configure platform-level HTTPS, alerts, log retention, and spending limits.
