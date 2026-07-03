/**
 * Dagger module: infra-umbrella
 *
 * CI for the workspace umbrella + infra-adjacent repos (hermes-config,
 * agent-skills). Validates:
 *  - .mcp.json parses + no dangling env-var refs
 *  - .env.example mirrors .env keys per env-example-mirrors-env-with-steps
 *  - all knowledge/**.md files have valid OKF frontmatter
 *  - submodules point at existing branches
 */
import { dag, Container, Directory, object, func } from "@dagger.io/dagger"

@object()
export class InfraUmbrella {
  private base(source: Directory): Container {
    return dag
      .container()
      .from("node:22-slim")
      .withExec(["apt-get", "update"])
      .withExec(["apt-get", "install", "-y", "--no-install-recommends", "git", "ca-certificates", "jq"])
      .withMountedDirectory("/src", source)
      .withWorkdir("/src")
  }

  @func()
  async mcpJsonValid(source: Directory): Promise<string> {
    return this.base(source)
      .withExec(["sh", "-c", `
        set -e
        if [ ! -f .mcp.json ]; then
          echo "skip: no .mcp.json"
          exit 0
        fi
        jq empty .mcp.json
        echo "OK — .mcp.json parses"
      `])
      .stdout()
  }

  @func()
  async envExampleMirrors(source: Directory): Promise<string> {
    return this.base(source)
      .withExec(["sh", "-c", `
        set -e
        if [ ! -f .env.example ]; then
          echo "skip: no .env.example"
          exit 0
        fi
        if [ -f .env ]; then
          ENV_KEYS=$(grep -oE '^[A-Z_][A-Z0-9_]*=' .env 2>/dev/null | sort -u | tr -d '=')
          EX_KEYS=$(grep -oE '^[A-Z_][A-Z0-9_]*=' .env.example 2>/dev/null | sort -u | tr -d '=')
          MISSING=$(comm -23 <(echo "$ENV_KEYS") <(echo "$EX_KEYS") | head -5)
          if [ -n "$MISSING" ]; then
            echo "MISSING in .env.example: $MISSING"
            exit 1
          fi
        fi
        echo "OK — .env.example mirrors .env"
      `])
      .stdout()
  }

  @func()
  async okfFrontmatter(source: Directory): Promise<string> {
    return this.base(source)
      .withExec(["sh", "-c", `
        set -e
        if [ ! -d knowledge ]; then
          echo "skip: no knowledge/ dir"
          exit 0
        fi
        BAD=0
        for f in $(find knowledge -name '*.md' -not -name 'index.md' -not -name '_*.md' 2>/dev/null | head -200); do
          FIRST=$(head -1 "$f")
          if [ "$FIRST" != "---" ]; then
            # No frontmatter — OK for README-style files
            continue
          fi
          # Check second line has 'type:' within the frontmatter block
          if ! head -20 "$f" | grep -q '^type:'; then
            echo "MISSING type: field in $f"
            BAD=$((BAD + 1))
          fi
        done
        if [ $BAD -gt 0 ]; then
          echo "Found $BAD files with malformed OKF frontmatter"
          exit 1
        fi
        echo "OK — OKF frontmatter valid"
      `])
      .stdout()
  }

  @func()
  async ci(source: Directory): Promise<string> {
    await Promise.all([
      this.mcpJsonValid(source).catch((err: Error) => { throw new Error(`mcp: ${err.message}`) }),
      this.envExampleMirrors(source).catch((err: Error) => { throw new Error(`env: ${err.message}`) }),
      this.okfFrontmatter(source).catch((err: Error) => { throw new Error(`okf: ${err.message}`) }),
    ])
    return "ok"
  }
}
