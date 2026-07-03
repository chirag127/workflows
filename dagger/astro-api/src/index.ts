/**
 * Dagger module: astro-api
 *
 * Canonical CI pipeline for Astro static JSON APIs in the chirag127 fleet.
 * Same-shape as astro-site but tuned for API-shaped repos (no tests, data-first).
 *
 * All script runs are `pnpm run --if-present <name>` so downstream repos are
 * free to omit any of lint / typecheck. Only `build` is required.
 *
 * Deploy target: GH Pages per the api-hosting decision.
 * Per chirag127/workspace/knowledge/decisions/stack/dagger-confirmed-2026-07-02.md
 */
import { dag, Container, Directory, Secret, object, func } from "@dagger.io/dagger"

const NODE_IMAGE = "node:22-slim"
const PNPM_VERSION = "10.34.3"

@object()
export class AstroApi {
  /** Container with pnpm + repo source + deps installed. Tolerant of missing lockfile. */
  private base(source: Directory): Container {
    return dag
      .container()
      .from(NODE_IMAGE)
      .withExec(["apt-get", "update"])
      .withExec(["apt-get", "install", "-y", "--no-install-recommends", "git", "ca-certificates"])
      .withExec(["corepack", "enable"])
      .withExec(["corepack", "prepare", `pnpm@${PNPM_VERSION}`, "--activate"])
      .withMountedCache("/root/.local/share/pnpm/store", dag.cacheVolume("pnpm-store"))
      .withMountedDirectory("/src", source)
      .withWorkdir("/src")
      .withExec(["pnpm", "install", "--ignore-scripts"])
  }

  @func()
  async lint(source: Directory): Promise<string> {
    return this.base(source).withExec(["pnpm", "run", "--if-present", "lint"]).stdout()
  }

  @func()
  async typecheck(source: Directory): Promise<string> {
    return this.base(source).withExec(["pnpm", "run", "--if-present", "typecheck"]).stdout()
  }

  @func()
  build(source: Directory): Directory {
    return this.base(source).withExec(["pnpm", "run", "build"]).directory("/src/dist")
  }

  /**
   * MegaLinter is opt-in per repo: set env MEGALINT=1 in the workflow_call
   * or add `dagger call megalint --source=.` explicitly.
   * NOT part of the default ci() flow — too many false positives across the fleet.
   */
  @func()
  async megalint(source: Directory): Promise<string> {
    return dag
      .container()
      .from("ghcr.io/oxsecurity/megalinter:v8")
      .withMountedDirectory("/tmp/lint", source)
      .withWorkdir("/tmp/lint")
      .withEnvVariable("DEFAULT_WORKSPACE", "/tmp/lint")
      .withEnvVariable("MEGALINTER_LINTERS", "TYPESCRIPT_ES,JSON_JSONLINT,YAML_YAMLLINT,MARKDOWN_MARKDOWNLINT")
      .withExec(["/entrypoint.sh"])
      .stdout()
  }

  /** Full CI: lint + typecheck in parallel, then build. No tests (API repos are data-first). */
  @func()
  async ci(source: Directory): Promise<string> {
    await Promise.all([
      this.lint(source).catch(err => { throw new Error(`lint: ${err.message}`) }),
      this.typecheck(source).catch(err => { throw new Error(`typecheck: ${err.message}`) }),
    ])
    await this.build(source)
    return "ok"
  }
}
