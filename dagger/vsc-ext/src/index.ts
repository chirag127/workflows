/**
 * Dagger module: vsc-ext
 *
 * CI pipeline for VS Code extensions (sops-lens-vsc-ext).
 * Missing scripts are no-ops. `build` maps to whichever script exists —
 * some VS Code extensions use `compile` (tsc-native) instead of `build`.
 */
import { dag, Container, Directory, Secret, object, func } from "@dagger.io/dagger"

const NODE_IMAGE = "node:22-slim"
const PNPM_VERSION = "10.34.3"

@object()
export class VscExt {
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

  /** Run `build` if defined, else fall back to `compile` (canonical VS Code ext script). */
  @func()
  async build(source: Directory): Promise<string> {
    return this.base(source)
      .withExec(["sh", "-c", "pnpm run --if-present build && pnpm run --if-present compile"])
      .stdout()
  }

  @func()
  async package(source: Directory): Promise<string> {
    return this.base(source)
      .withExec(["sh", "-c", "pnpm run --if-present build || pnpm run --if-present compile"])
      .withExec(["pnpm", "dlx", "@vscode/vsce", "package", "--no-dependencies"])
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
      .withEnvVariable("MEGALINTER_LINTERS", "TYPESCRIPT_ES,JSON_JSONLINT,YAML_YAMLLINT,MARKDOWN_MARKDOWNLINT")
      .withExec(["/entrypoint.sh"])
      .stdout()
  }

  @func()
  async ci(source: Directory): Promise<string> {
    await Promise.all([
      this.lint(source).catch(err => { throw new Error(`lint: ${err.message}`) }),
      this.typecheck(source).catch(err => { throw new Error(`typecheck: ${err.message}`) }),
    ])
    await this.build(source)
    return "ok"
  }

  /** Publish to VS Marketplace. Umbrella-only. */
  @func()
  async publishMarketplace(source: Directory, vsceToken: Secret): Promise<string> {
    return this.base(source)
      .withSecretVariable("VSCE_PAT", vsceToken)
      .withExec(["sh", "-c", "pnpm run --if-present build || pnpm run --if-present compile"])
      .withExec(["pnpm", "dlx", "@vscode/vsce", "publish", "--no-dependencies"])
      .stdout()
  }

  /** Publish to Open VSX Registry. Umbrella-only. */
  @func()
  async publishOpenVsx(source: Directory, ovsxToken: Secret): Promise<string> {
    return this.base(source)
      .withSecretVariable("OVSX_PAT", ovsxToken)
      .withExec(["sh", "-c", "pnpm run --if-present build || pnpm run --if-present compile"])
      .withExec(["pnpm", "dlx", "ovsx", "publish"])
      .stdout()
  }
}
