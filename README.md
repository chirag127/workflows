# oriz-workflows

[![GitHub stars](https://img.shields.io/github/stars/chirag127/workflows?style=social)](https://github.com/chirag127/workflows/stargazers)

Reusable GitHub Actions workflows for the [`chirag127`](https://github.com/chirag127) fleet.

Every workflow is a thin adapter calling [Dagger](https://dagger.io). Downstream repos consume with a 5-line pin. All real CI/deploy logic lives in Dagger TS modules — locally reproducible via `dagger call ci` on any laptop with Docker.

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
| `.github/workflows/ci-astro-site.yml` | Astro sites (blog, home, me, journal) |
| `.github/workflows/ci-astro-api.yml` | Astro static APIs (constants, countries-plus, dynasties, ragas, rto, mmi) |
| `.github/workflows/ci-astro-pwa.yml` | Astro mobile PWAs (ncert, janaushdhi, lore) |
| `.github/workflows/ci-mdbook.yml` | mdBook books (janaushdhi-book, me-book) |
| `.github/workflows/ci-vsc-ext.yml` | VS Code extensions (sops-lens-vsc-ext) |
| `.github/workflows/ci-bs-ext.yml` | Browser extensions (bookmark-mind-bs-ext) |
| `.github/workflows/ci-userscript.yml` | Userscripts (chirag127/userscripts) |
| `.github/workflows/ci-npm-package.yml` | Publishable npm packages |

## Model

```
Downstream (chirag127/<repo>)
  └── .github/workflows/ci.yml       # 5-line pin
      └── oriz-workflows             # this repo, tag-pinned
          └── dagger call ci         # Dagger TS pipeline
              └── @oriz/dagger-*     # composable modules
```

## Secrets — two tiers

**Tier 1 (per-repo, public CI):** Only `WORKSPACE_DISPATCH_PAT`. No deploy secrets.

**Tier 2 (umbrella, deploy):** All deploy secrets (CF, npm, Resend) live at `chirag127/workspace`. Deploys trigger via `repository_dispatch`.

See [`chirag127/workspace/knowledge/decisions/architecture/agent-tooling/workspace-owns-secrets-2026-07-02.md`](https://github.com/chirag127/workspace/blob/main/knowledge/decisions/architecture/agent-tooling/workspace-owns-secrets-2026-07-02.md).

## Version pinning

- Tags: `v1`, `v1.1`, `v2` etc.
- Downstream pins `@v1` — Renovate opens PRs when new majors ship.
- Backwards-compatible fixes rev the minor (`v1.1`), auto-adopted.

## License

MIT.
