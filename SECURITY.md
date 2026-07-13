# Security Policy

## Scope

`stix-mgic-vc-node` is a production-deployable operator **shell**. Default deploys run in **demo mode** (simulated sessions). Live session control requires a configured `VITE_API_BASE_URL`. Platform Telegram/Discord auth remains mock until a server-side OAuth exchange is provided.

## Reporting

Report vulnerabilities privately to **Frisky Developments** (`aroo@pupfrisky.com`). Do not open a public GitHub issue for sensitive findings.

Include:

- Description and impact
- Steps to reproduce
- Affected file paths / commit if known
- Whether secrets or user data are exposed

## Secrets & tokens

- Do not commit `.env` files or OAuth tokens
- `VITE_*` client IDs are public by design — never put client secrets in this frontend
- Spotify access tokens stay in memory; refresh tokens stay in `sessionStorage` only
- Session diagnostic logs stay client-side unless a live API is configured
