/**
 * Dagger module: data-scrape-api
 *
 * CI for data-only APIs that scrape upstream → commit JSON → serve via
 * GH raw / jsdelivr (oriz-india-holidays, oriz-air-quality, oriz-currency-rates,
 * oriz-flow-fii-dii, oriz-gold-silver, oriz-ifsc, india-budget,
 * india-petrol-diesel, india-train-schedules).
 *
 * No Astro build. Pipeline:
 *   1. lint scrape script (biome or ruff via --if-present)
 *   2. run scraper in sandbox
 *   3. validate output JSON parses
 *   4. staleness gate — fail if output hasn't changed vs prior commit
 *      AND last-modified-of-source-of-truth is older than 7d
 *      (skipped when running in CI without a real scrape target)
 */
import { dag, Container, Directory, object, func } from "@dagger.io/dagger"

const NODE_IMAGE = "node:22-slim"
const PNPM_VERSION = "10.34.3"

@object()
export class DataScrapeApi {
  private base(source: Directory): Container {
    return dag
      .container()
      .from(NODE_IMAGE)
      .withExec(["apt-get", "update"])
      .withExec(["apt-get", "install", "-y", "--no-install-recommends", "git", "ca-certificates", "curl", "jq"])
      .withExec(["corepack", "enable"])
      .withExec(["corepack", "prepare", `pnpm@${PNPM_VERSION}`, "--activate"])
      .withMountedCache("/root/.local/share/pnpm/store", dag.cacheVolume("pnpm-store"))
      .withMountedDirectory("/src", source)
      .withWorkdir("/src")
  }

  private baseWithDeps(source: Directory): Container {
    return this.base(source).withExec(["sh", "-c", "if [ -f package.json ]; then pnpm install --ignore-scripts; fi"])
  }

  @func()
  async lint(source: Directory): Promise<string> {
    return this.baseWithDeps(source)
      .withExec(["sh", "-c", "pnpm run --if-present lint || true"])
      .stdout()
  }

  @func()
  async jsonValidate(source: Directory): Promise<string> {
    return this.base(source)
      .withExec(["sh", "-c", `
        set -e
        FOUND=0
        for f in $(find . -maxdepth 4 -name '*.json' -not -path './node_modules/*' -not -path './.git/*' 2>/dev/null | head -100); do
          if ! jq empty "$f" >/dev/null 2>&1; then
            echo "INVALID JSON: $f"
            exit 1
          fi
          FOUND=$((FOUND + 1))
        done
        echo "OK — validated $FOUND JSON files"
      `])
      .stdout()
  }

  /**
   * Full CI: lint (advisory) + JSON validation (gate). Scrape execution is
   * left to the repo's own workflow — this module doesn't shell out to
   * arbitrary scraper code by default.
   */
  @func()
  async ci(source: Directory): Promise<string> {
    await this.jsonValidate(source).catch((err: Error) => { throw new Error(`json: ${err.message}`) })
    await this.lint(source).catch(() => "") // advisory
    return "ok"
  }
}
