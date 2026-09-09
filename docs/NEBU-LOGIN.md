# NEBU login vs VC studio Authentik

Two identity planes share this repo. They must stay separate.

## NEBU (nebu.quest) — Better Auth

- **Audience:** consumer / product login for **NEBU**.
- **UI:** `/login` (NEBU purple/yellow brand).
- **API:** Better Auth handler at `/api/auth/*`.
- **Providers:** Google, Apple, Microsoft when the corresponding OAuth env vars are set; email/password also available.
- **Secrets:** `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=https://nebu.quest`, `DATABASE_URL`, plus provider client IDs/secrets. See `.env.example`.
- **Cookies:** NEBU-prefixed Better Auth session (`nebu_session` / `__Host-nebu_session`). Do not reuse for studio.

## VC studio (vc.friskydev.com) — Authentik / FriskyDev ID

- **Audience:** operators of the STIX / VC studio control plane.
- **Flow:** existing OIDC routes under `/v1/auth/oidc/*` (Authentik) and Supabase FriskyDev identity helpers.
- **Do not remove:** OIDC/Authentik wiring stays intact. NEBU Better Auth is additive only.

## Why both

NEBU needs a branded consumer SSO surface. Studio already has a working Authentik broker path for FriskyDev ID. Collapsing them would risk breaking `vc.friskydev.com` and mixing product vs operator sessions.

## Deploy note

Live `nebu.quest` may return Hostinger 503 until hosting/DNS is fixed. Ship the feature anyway; deploy once the origin is healthy and env vars are injected.
