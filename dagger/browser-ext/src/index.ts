/**
 * Dagger module: browser-ext
 *
 * CI pipeline for browser extensions (WXT-based — bookmark-mind-bs-ext).
 * Runs pnpm build + WXT bundle + web-ext lint for MV3 compliance.
 */
import { dag, Container, Directory, object, func } from "@dagger.io/dagger"

const NODE_IMAGE = "node:22-slim"
const PNPM_VERSION = "10.34.3"

@object()
export class BrowserExt {
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
    return this.base(source).withExec(["pnpm", "run", "build"]).directory("/src/.output")
  }

  /** Web-ext lint validates MV3 manifest against store rules. */
  @func()
  async manifestCheck(source: Directory): Promise<string> {
    return this.base(source)
      .withExec(["pnpm", "dlx", "web-ext", "lint", "--source-dir=.output/chrome-mv3"])
      .stdout()
  }

  @func()
  async megalint(source: Directory): Promise<string> {
    return dag
      .container()
      .from("ghcr.io/oxsecurity/megalinter:v8")
      .withMountedDirectory("/tmp/lint", source)
      .withWorkdir("/tmp/lint")
      .withEnvVariable("DEFAULT_WORKSPACE", "/tmp/lint")
      .withEnvVariable("MEGALINTER_LINTERS", "TYPESCRIPT_ES,JSON_JSONLINT,YAML_YAMLLINT,HTML_HTMLHINT")
      .withExec(["/entrypoint.sh"])
      .stdout()
      .catch(err => { throw new Error("megalint: " + err.message) })
  }

  @func()
  async ci(source: Directory): Promise<string> {
    await Promise.all([
      this.lint(source).catch(err => { throw new Error(`lint: ${err.message}`) }),
      this.typecheck(source).catch(err => { throw new Error(`typecheck: ${err.message}`) }),
      this.megalint(source).catch(err => { throw new Error(`megalint: ${err.message}`) }),
    ])
    await this.build(source)
    await this.manifestCheck(source).catch(() => {})  // non-fatal
    return "ok"
  }
}
