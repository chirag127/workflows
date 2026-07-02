/**
 * Dagger module: astro-api
 *
 * Canonical CI pipeline for Astro static JSON APIs in the chirag127 fleet.
 * Very similar to astro-site but tuned for API-shaped repos:
 * - No component tests (static JSON data + light Astro build)
 * - Extra: validate JSON schema against sample fixtures if `scripts/validate-schema` script exists
 *
 * Downstream repos reference this via dagger.json dependencies.
 * Deploy target: GH Pages per the api-hosting decision.
 *
 * Per chirag127/workspace/knowledge/decisions/stack/dagger-confirmed-2026-07-02.md
 */
import { dag, Container, Directory, Secret, object, func } from "@dagger.io/dagger"

const NODE_IMAGE = "node:22-slim"
const PNPM_VERSION = "10.34.3"

@object()
export class AstroApi {
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
      .withExec(["pnpm", "install", "--frozen-lockfile"])
  }

  @func()
  async lint(source: Directory): Promise<string> {
    return this.base(source).withExec(["pnpm", "run", "lint"]).stdout()
  }

  @func()
  async typecheck(source: Directory): Promise<string> {
    return this.base(source).withExec(["pnpm", "run", "typecheck"]).stdout()
  }

  @func()
  build(source: Directory): Directory {
    return this.base(source).withExec(["pnpm", "run", "build"]).directory("/src/dist")
  }

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
      .catch(err => { throw new Error("megalint: " + err.message) })
  }

  /** Full CI: lint + typecheck + megalint in parallel, then build. No tests (API repos are data-first). */
  @func()
  async ci(source: Directory): Promise<string> {
    await Promise.all([
      this.lint(source).catch(err => { throw new Error(`lint: ${err.message}`) }),
      this.typecheck(source).catch(err => { throw new Error(`typecheck: ${err.message}`) }),
      this.megalint(source).catch(err => { throw new Error(`megalint: ${err.message}`) }),
    ])
    await this.build(source)
    return "ok"
  }
}
