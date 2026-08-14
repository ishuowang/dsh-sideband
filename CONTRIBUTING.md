# Contributing to Sideband

Sideband favors small, reviewable changes that preserve clear Session and model boundaries.

## Setup

```sh
git clone git@github.com:ishuowang/dsh-sideband.git
cd dsh-sideband
npm ci
npm run check
```

Requirements are Node.js `^22.19.0 || >=24` and DeepSeek Harness `0.1.0-rc.6`. Use a dedicated DSH profile and synthetic conversations for manual testing.

## Working agreement

- Read [README.md](README.md), [SECURITY.md](SECURITY.md), and [AGENTS.md](AGENTS.md).
- Branch from current `main`; feature branches use `feature/<short-name>`.
- Keep commits focused and preserve unrelated user changes.
- Never commit real transcripts, credentials, `.env` files, provider responses, diagnostic dumps, or private ids.
- Never add star, watch, follow, telemetry, or unrelated outbound behavior.
- Keep English and Chinese READMEs aligned when public behavior changes.

## Pull requests

Describe the user-visible outcome, affected command/snapshot/queue/delivery/UI boundary, compatibility impact, security/data-flow impact, and verification performed. Include synthetic screenshots only when the real bundled client module changes.

Required checks:

```sh
npm run check
npm pack --dry-run --ignore-scripts
git diff --check
```

Inspect the packed file list. A GitHub-installed release must contain compiled Host/client artifacts and must not contain secrets or real conversation data.

Relay changes should test command exclusion from model history, immutable/partial snapshots, default and explicit scopes, tool-free summary calls, both Session delivery modes, cold/unavailable/unauthorized targets, Room ownership, cancellation, and Host shutdown.
