# Security Policy

## Scope

`stix-mgic-vc-node` is an **alpha local demo**. It does not currently connect to production Telegram, Discord, or RTMP infrastructure. Platform auth in this repo is mock/demo and must not gate real systems.

## Reporting

If you believe you have found a security vulnerability in this repository, please report it privately to the maintainers at **Frisky Developments** (`aroo@pupfrisky.com`). Do not open a public GitHub issue for sensitive findings.

Please include:

- Description of the issue and impact
- Steps to reproduce
- Affected file paths / commit if known
- Whether secrets or user data are exposed

## Secrets

- Do not commit `.env` files or OAuth tokens
- Client IDs (`VITE_*`) are public by design; never put client secrets in this frontend
- Spotify access tokens must remain in-memory only (not persisted to `localStorage` / Spark KV)
