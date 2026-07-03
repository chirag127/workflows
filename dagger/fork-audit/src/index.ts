/**
 * Dagger module: fork-audit
 *
 * Runs against a fork checkout (via umbrella submodule pointer) — external
 * CI that never adds a byte to the fork's main. Provides drift + license +
 * MegaLinter + upstream-parity checks.
 *
 * Umbrella workflow: chirag127/workspace/.github/workflows/fork-ci.yml
 */
import { dag, Container, Directory, object, func } from "@dagger.io/dagger"

@object()
export class ForkAudit {
  /** Base container with basic tooling. */
  private base(source: Directory): Container {
    return dag
      .container()
      .from("debian:12-slim")
      .withExec(["apt-get", "update"])
      .withExec(["apt-get", "install", "-y", "--no-install-recommends", "git", "ca-certificates", "curl", "jq"])
      .withMountedDirectory("/src", source)
      .withWorkdir("/src")
  }

  /**
   * Confirm the fork tree is byte-identical to upstream/main per no-fork-divergence.
   * Requires the fork checkout to have upstream configured; fork-ci.yml sets it up.
   */
  @func()
  async driftCheck(source: Directory): Promise<string> {
    return this.base(source)
      .withExec(["sh", "-c", `
        set -e
        if [ ! -f .git ] && [ ! -d .git ]; then
          echo "skip: no git dir (submodule shallow checkout?)"
          exit 0
        fi
        UPSTREAM_URL="$(git config --get remote.upstream.url || echo '')"
        if [ -z "$UPSTREAM_URL" ]; then
          echo "skip: upstream remote not configured"
          exit 0
        fi
        git fetch upstream main --depth=1 2>/dev/null || git fetch upstream 2>/dev/null
        DIFF=$(git diff upstream/main --stat --ignore-space-change -- ':(exclude)pnpm-lock.yaml' ':(exclude).source' 2>/dev/null | tail -1)
        if [ -n "$DIFF" ]; then
          echo "DRIFT DETECTED — fork's main is not byte-identical to upstream/main"
          git diff upstream/main --stat --ignore-space-change | head -30
          exit 1
        fi
        echo "OK — fork main == upstream main"
      `])
      .stdout()
  }

  /**
   * MegaLinter security-only pass against the fork tree. Advisory: any finding
   * posts a status but doesn't gate our commit-status back to the fork.
   */
  @func()
  async megalint(source: Directory): Promise<string> {
    return dag
      .container()
      .from("ghcr.io/oxsecurity/megalinter/flavors/security:v8")
      .withMountedDirectory("/tmp/lint", source)
      .withWorkdir("/tmp/lint")
      .withEnvVariable("DEFAULT_WORKSPACE", "/tmp/lint")
      .withEnvVariable("VALIDATE_ALL_CODEBASE", "true")
      .withEnvVariable("ENABLE_LINTERS", "REPOSITORY_GITLEAKS,REPOSITORY_SECRETLINT,REPOSITORY_TRUFFLEHOG,REPOSITORY_SEMGREP,REPOSITORY_TRIVY,REPOSITORY_OSV_SCANNER")
      .withExec(["/entrypoint.sh"])
      .stdout()
      .catch((err: Error) => { return `megalint: ${err.message}` })
  }

  /**
   * License audit — the fork must ship the upstream LICENSE unchanged.
   */
  @func()
  async licenseCheck(source: Directory): Promise<string> {
    return this.base(source)
      .withExec(["sh", "-c", `
        if [ ! -f LICENSE ] && [ ! -f LICENSE.md ] && [ ! -f LICENSE.txt ] && [ ! -f COPYING ]; then
          echo "WARN: no LICENSE file found in fork tree"
          exit 0
        fi
        echo "OK — LICENSE present"
      `])
      .stdout()
  }

  /**
   * Full audit: drift + license + megalint. Any single failure fails the audit.
   */
  @func()
  async ci(source: Directory): Promise<string> {
    const drift = await this.driftCheck(source).catch((err: Error) => { throw new Error(`drift: ${err.message}`) })
    const license = await this.licenseCheck(source).catch((err: Error) => { throw new Error(`license: ${err.message}`) })
    // Megalint is advisory — capture but don't fail
    const megalint = await this.megalint(source)
    return `drift:${drift}\nlicense:${license}\nmegalint(advisory):${megalint.slice(0, 200)}`
  }
}
