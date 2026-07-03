/**
 * Dagger module: astro-site
 *
 * Canonical CI pipeline for Astro static sites in the chirag127 fleet.
 * Runs lint + typecheck + test in parallel, then build. Missing scripts
 * are no-ops via `pnpm run --if-present`.
 *
 * MegaLinter is opt-in (not part of default ci()).
 *
 * Per chirag127/workspace/knowledge/decisions/stack/dagger-confirmed-2026-07-02.md
 */
import { dag, Container, Directory, Secret, object, func } from "@dagger.io/dagger"

const NODE_IMAGE = "node:22-slim"
const PNPM_VERSION = "10.34.3"

@object()
export class AstroSite {
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
      .withExec(["pnpm", "install"])
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
  async test(source: Directory): Promise<string> {
    return this.base(source).withExec(["pnpm", "run", "--if-present", "test"]).stdout()
  }

  @func()
  async megalint(source: Directory): Promise<string> {
    return dag
      .container()
      .from("ghcr.io/oxsecurity/megalinter:v8")
      .withMountedDirectory("/tmp/lint", source)
      .withWorkdir("/tmp/lint")
      .withEnvVariable("DEFAULT_WORKSPACE", "/tmp/lint")
      .withEnvVariable("MEGALINTER_LINTERS", "TYPESCRIPT_ES,CSS_STYLELINT,HTML_HTMLHINT,MARKDOWN_MARKDOWNLINT,JSON_JSONLINT,YAML_YAMLLINT")
      .withExec(["/entrypoint.sh"])
      .stdout()
  }

  @func()
  build(source: Directory): Directory {
    return this.base(source).withExec(["pnpm", "run", "build"]).directory("/src/dist")
  }

  @func()
  async ci(source: Directory): Promise<string> {
    await Promise.all([
      this.lint(source).catch(err => { throw new Error(`lint: ${err.message}`) }),
      this.typecheck(source).catch(err => { throw new Error(`typecheck: ${err.message}`) }),
      this.test(source).catch(err => { throw new Error(`test: ${err.message}`) }),
    ])
    await this.build(source)
    return "ok"
  }

  /** Deploy to Cloudflare Pages via wrangler. Umbrella-only. */
  @func()
  async deployCloudflare(
    source: Directory,
    cfApiToken: Secret,
    cfAccountId: Secret,
    projectName: string,
    branch: string,
  ): Promise<string> {
    return this.base(source)
      .withSecretVariable("CLOUDFLARE_API_TOKEN", cfApiToken)
      .withSecretVariable("CLOUDFLARE_ACCOUNT_ID", cfAccountId)
      .withExec(["pnpm", "run", "build"])
      .withExec([
        "pnpm", "exec", "wrangler", "pages", "deploy", "dist",
        `--project-name=${projectName}`,
        `--branch=${branch}`,
      ])
      .stdout()
  }
}
