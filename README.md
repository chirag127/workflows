# oriz-workflows

> Reusable GitHub Actions workflows for the [`chirag127`](https://github.com/chirag127) fleet — one tag-pinned `uses:` line and a downstream repo gets its whole CI/deploy pipeline.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://github.com/chirag127/workflows/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/chirag127/workflows?style=social)](https://github.com/chirag127/workflows/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/chirag127/workflows?style=flat-square)](https://github.com/chirag127/workflows/commits)
[![self-ci](https://github.com/chirag127/workflows/actions/workflows/self-ci.yml/badge.svg)](https://github.com/chirag127/workflows/actions/workflows/self-ci.yml)
[![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white)](https://docs.github.com/actions)

## What it is / why it exists

This is the **shared reusable-CI repo for the whole `chirag127` / oriz fleet** (~80 sites and tools). Instead of copy-pasting a build pipeline into every repo, each downstream repo points a 5-line `ci.yml` at a workflow here, pinned to a tag. Fix the pipeline once, every consumer gets the fix on the next run.

**Migration note:** CI is now **pure GitHub Actions**. The core build path (e.g. `ci-astro-site.yml`) was migrated off the Dagger adapter — it now runs `checkout → pnpm/action-setup → setup-node → pnpm install → pnpm build` directly (the header comment reads *"Direct pnpm build — replaces Dagger adapter (Dagger Cloud required for v8.4.1)"*). A legacy `dagger/` directory still exists and a handful of workflows (`ci-astro-api`, `ci-astro-pwa`, `ci-browser-ext`, `ci-data-scrape-api`, `ci-infra-umbrella`, `ci-mdbook`, `ci-npm-pkg`, `ci-vsc-ext`) still reference Dagger, but the flagship path is pure GHA and runs on **free public-repo Actions minutes**.

## Links

- Live catalog: **[workflows.oriz.in](https://workflows.oriz.in)**
- Repo: [github.com/chirag127/workflows](https://github.com/chirag127/workflows)

## ⭐ Star this repo

If this is useful, please ⭐ star the repo — it helps others find it.

## How it works

```mermaid
flowchart LR
    A[Downstream repo push / PR<br/>chirag127/&lt;repo&gt;] --> B[".github/workflows/ci.yml<br/>5-line uses: pin @v1"]
    B --> C{{"chirag127/workflows<br/>reusable workflow @v1"}}
    C --> D["checkout"]
    D --> E["pnpm/action-setup<br/>+ setup-node"]
    E --> F["pnpm install"]
    F --> G["pnpm build"]
    G --> H["deploy / release<br/>via oriz-deploy, pages, release-notes"]
    H --> I(["Cloudflare / npm / GH Pages"])
```

## Downstream usage

Every consuming repo's `.github/workflows/ci.yml`:

```yaml
name: ci
on: [push, pull_request]
jobs:
  ci:
    uses: chirag127/workflows/.github/workflows/ci-astro-site.yml@v1
    secrets: inherit
```

## Available workflows

| File | For repo class |
|---|---|
| `.github/workflows/ci-astro-site.yml` | Astro sites (blog, home, me, journal) — **pure GHA pnpm build** |
| `.github/workflows/ci-astro-api.yml` | Astro static APIs (constants, countries-plus, dynasties, ragas, rto, mmi) |
| `.github/workflows/ci-astro-pwa.yml` | Astro mobile PWAs (ncert, janaushdhi, lore) |
| `.github/workflows/ci-mdbook.yml` | mdBook books (janaushdhi-book, me-book) |
| `.github/workflows/ci-vsc-ext.yml` | VS Code extensions (sops-lens-vsc-ext) |
| `.github/workflows/ci-browser-ext.yml` | Browser extensions (bookmark-mind-bs-ext) |
| `.github/workflows/ci-data-scrape-api.yml` | Data-scrape APIs (dns-filters and similar scrapers) |
| `.github/workflows/ci-infra-umbrella.yml` | Infra umbrella repos (workspace plumbing) |
| `.github/workflows/ci-npm-pkg.yml` | Publishable npm packages |

### Fleet automation & release workflows

| File | Purpose |
|---|---|
| `auto-issue-triage.yml` | Auto-label / triage incoming issues |
| `changelog.yml` · `release-notes.yml` · `prerelease.yml` | Changelog + release note generation |
| `oriz-deploy.yml` | Deploy step (Cloudflare / Pages) |
| `oriz-fork-ci.yml` · `oriz-sync-forks.yml` · `oriz-mirror-all.yml` | Fork CI, fork sync, and mirroring across the fleet |
| `pages.yml` | GitHub Pages publish |
| `megalinter.yml` | Repo-wide linting |
| `self-ci.yml` | This repo's own CI |

## Model

```
Downstream (chirag127/<repo>)
  └── .github/workflows/ci.yml          # 5-line pin, uses: @v1
      └── chirag127/workflows           # this repo, tag-pinned
          └── pure GitHub Actions job    # checkout → pnpm install → pnpm build
              └── deploy / release        # oriz-deploy, pages, release-notes
```

## Version pinning

- Tags: `v1`, `v1.1`, `v2`, etc.
- Downstream pins `@v1` — Renovate opens PRs when new majors ship.
- Backwards-compatible fixes rev the minor (`v1.1`), auto-adopted.

## Secrets — two tiers

**Tier 1 (per-repo, public CI):** Only `WORKSPACE_DISPATCH_PAT`. No deploy secrets.

**Tier 2 (umbrella, deploy):** All deploy secrets (Cloudflare, npm, Resend) live at `chirag127/workspace`. Deploys trigger via `repository_dispatch`.

No secrets in this repo. See [`workspace-owns-secrets-2026-07-02.md`](https://github.com/chirag127/workspace/blob/main/knowledge/decisions/architecture/agent-tooling/workspace-owns-secrets-2026-07-02.md).

## Part of the oriz family

oriz-workflows is the CI backbone for the **oriz** family of ~80 sites and tools. See [blog.oriz.in](https://blog.oriz.in) for the rest.

## Contributing

Issues and PRs welcome. Conventional commits are the changelog.

## License

MIT © Chirag Singhal.

## Author

Chirag Singhal · [chirag@oriz.in](mailto:chirag@oriz.in)

## Status / roadmap

**Stable** and in production across the fleet. Core build path is pure GitHub Actions; remaining Dagger-referencing workflows are being migrated as needed.
