# Culture-fit-Lab

Culture-fit Lab is a React and Vite assessment practice portal backed by Express, PostgreSQL, deterministic scoring, optional DeepSeek coaching, and on-demand PDF reports.

## Production URLs

- Frontend: `https://culturefit.chimaobi.xyz`
- API: `https://api-culturefit.chimaobi.xyz`

The frontend is built as static files and served by Nginx. The API runs as a systemd service behind Nginx.

## Local development

Create `backend/.env` from `backend/.env.example`, then use development values for `NODE_ENV` and `FRONTEND_ORIGIN`.

```bash
cd backend
npm ci
npm run db:migrate
npm run dev
```

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. When `VITE_API_BASE_URL` is unset, Vite proxies `/api` to `http://localhost:4000`.

## Checks

```bash
cd backend && npm run typecheck && npm test && npm run build
cd frontend && npm run typecheck && npm test && npm run build
```

## Secrets and private data

Real environment files, CSV and Excel source files, build output, dependencies, generated reports, and local agent settings are ignored by Git. Only placeholder `.env.example` files belong in the repository.

Candidate-facing question text is returned by the API. Scoring keys, traits, profile priorities, related-item metadata, and SJT answer metadata remain in PostgreSQL and the backend. PDF generation and AI coaching run only after the learner requests them.

## VPS deployment

The repository includes production-ready Nginx and systemd templates for the configured domains. Follow [the VPS deployment guide](deploy/README.md).

Model behavior and privacy rules are documented in [DeepSeek integration guidelines](docs/DEEPSEEK_V4_PRO.md) and [AI coaching guardrails](docs/AI_COACHING_GUARDRAILS.md).
