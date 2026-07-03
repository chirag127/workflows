/**
 * Dagger module: mdbook
 *
 * CI pipeline for mdBook-based books.
 *
 * Non-standard book layouts (book.json + manuscript/) are skipped gracefully:
 * if book.toml is absent, ci() reports "skip" and returns success. Downstream
 * repos with custom layouts keep their own build workflow.
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

  /** True when repo has a standard `book.toml` at root. */
  private async hasBookToml(source: Directory): Promise<boolean> {
    const entries = await source.entries()
    return entries.includes("book.toml")
  }

  @func()
  async build(source: Directory): Promise<string> {
    if (!(await this.hasBookToml(source))) return "skip: no book.toml"
    return this.base(source).withExec(["mdbook", "build"]).stdout()
  }

  /** Verify internal links. Skipped when book.toml is absent. */
  @func()
  async lint(source: Directory): Promise<string> {
    if (!(await this.hasBookToml(source))) return "skip: no book.toml"
    return this.base(source).withExec(["mdbook", "test"]).stdout()
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
  }

  @func()
  async ci(source: Directory): Promise<string> {
    if (!(await this.hasBookToml(source))) {
      return "skip: non-standard layout (no book.toml) — see repo's Build Book workflow"
    }
    await Promise.all([
      this.lint(source).catch(err => { throw new Error(`lint: ${err.message}`) }),
      this.build(source).catch(err => { throw new Error(`build: ${err.message}`) }),
    ])
    return "ok"
  }
}
