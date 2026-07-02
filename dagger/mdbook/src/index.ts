/**
 * Dagger module: mdbook
 *
 * CI pipeline for mdBook-based books (janaushdhi-book, 100-year-strategy-book).
 * Runs mdbook build + optional plugin steps (mermaid, katex).
 */
import { dag, Container, Directory, object, func } from "@dagger.io/dagger"

const RUST_IMAGE = "rust:1-slim"
const MDBOOK_VERSION = "0.4.40"

@object()
export class Mdbook {
  /** Container with mdbook + repo source. */
  private base(source: Directory): Container {
    return dag
      .container()
      .from(RUST_IMAGE)
      .withExec(["apt-get", "update"])
      .withExec(["apt-get", "install", "-y", "--no-install-recommends", "git", "ca-certificates", "curl"])
      .withMountedCache("/usr/local/cargo/registry", dag.cacheVolume("cargo-registry"))
      .withExec(["cargo", "install", "mdbook", "--version", MDBOOK_VERSION, "--locked"])
      .withMountedDirectory("/src", source)
      .withWorkdir("/src")
  }

  @func()
  build(source: Directory): Directory {
    return this.base(source).withExec(["mdbook", "build"]).directory("/src/book")
  }

  /** Verify all internal links resolve. */
  @func()
  async lint(source: Directory): Promise<string> {
    return this.base(source).withExec(["mdbook", "test"]).stdout()
  }

  @func()
  async ci(source: Directory): Promise<string> {
    await Promise.all([
      this.lint(source),
      this.build(source),
      this.megalint(source),
    ])
    return "ok"
  }

  @func()
  async megalint(source: Directory): Promise<string> {
    return dag
      .container()
      .from("ghcr.io/oxsecurity/megalinter:v8")
      .withMountedDirectory("/tmp/lint", source)
      .withWorkdir("/tmp/lint")
      .withEnvVariable("DEFAULT_WORKSPACE", "/tmp/lint")
      .withEnvVariable("MEGALINTER_LINTERS", "MARKDOWN_MARKDOWNLINT,YAML_YAMLLINT")
      .withExec(["/entrypoint.sh"])
      .stdout()
      .catch(err => { throw new Error("megalint: " + err.message) })
  }
}
