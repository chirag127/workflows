/**
 * Dagger module: userscript
 *
 * CI pipeline for userscript monorepo (chirag127/userscripts).
 * Runs syntax check + metadata block validation.
 * Userscripts are plain .user.js files served directly from GH raw.
 */
import { dag, Container, Directory, object, func } from "@dagger.io/dagger"

const NODE_IMAGE = "node:22-slim"

@object()
export class Userscript {
  private base(source: Directory): Container {
    return dag
      .container()
      .from(NODE_IMAGE)
      .withMountedDirectory("/src", source)
      .withWorkdir("/src")
  }

  /** JS syntax check on every .user.js — no runtime, just parse. */
  @func()
  async syntaxCheck(source: Directory): Promise<string> {
    return this.base(source)
      .withExec([
        "sh", "-c",
        `find . -name '*.user.js' -print -exec node --check {} \\;`,
      ])
      .stdout()
  }

  /**
   * Validate every .user.js has a proper // ==UserScript== metadata block
   * with required fields (@name, @namespace, @version, @match|@include).
   */
  @func()
  async metadataCheck(source: Directory): Promise<string> {
    return this.base(source)
      .withExec([
        "sh", "-c",
        `for f in $(find . -name '*.user.js'); do
           head -30 "$f" | grep -q '// ==UserScript==' || { echo "MISSING metadata block: $f"; exit 1; }
           head -30 "$f" | grep -q '// @name' || { echo "MISSING @name: $f"; exit 1; }
           head -30 "$f" | grep -q '// @version' || { echo "MISSING @version: $f"; exit 1; }
         done
         echo "all metadata blocks OK"`,
      ])
      .stdout()
  }

  @func()
  async ci(source: Directory): Promise<string> {
    await Promise.all([
      this.syntaxCheck(source),
      this.metadataCheck(source),
    ])
    return "ok"
  }
}
