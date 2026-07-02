/**
 * Dagger module: npm-pkg
 *
 * CI pipeline for publishable npm packages (`@oriz/*` scope).
 * Runs pnpm build + test + publish (umbrella-only).
 * Package is published on every merge to main (auto-publish model per
 * pipeline-stack-2026-07-01 decision).
 */
import { dag, Container, Directory, Secret, object, func } from "@dagger.io/dagger"

const NODE_IMAGE = "node:22-slim"
const PNPM_VERSION = "10.34.3"

@object()
export class NpmPkg {
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
  async test(source: Directory): Promise<string> {
    return this.base(source).withExec(["pnpm", "run", "test"]).stdout()
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

  /** Publish to npm. Umbrella-only. Auto on every merge to main. */
  @func()
  async publish(source: Directory, npmToken: Secret): Promise<string> {
    return this.base(source)
      .withSecretVariable("NPM_TOKEN", npmToken)
      .withExec(["sh", "-c", 'echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > ~/.npmrc'])
      .withExec(["pnpm", "run", "build"])
      .withExec(["pnpm", "publish", "--access=public", "--no-git-checks"])
      .stdout()
  }
}
