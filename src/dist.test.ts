import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * dist/ is committed, because `npm install -g github:floe-ai/floe-console`
 * cannot build it (see README). That only stays honest if the committed output
 * is exactly what the source compiles to — otherwise a stranger would install
 * code nobody reviewed. Recompile into a scratch dir and require a byte match,
 * including no leftover files from deleted sources.
 */
const root = fileURLToPath(new URL("..", import.meta.url));

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}

describe("committed dist", () => {
  it("is exactly what the source compiles to (run `npm run compile`)", () => {
    const out = mkdtempSync(join(tmpdir(), "floe-console-dist-"));
    try {
      const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
      const result = spawnSync(process.execPath, [tsc, "-p", "tsconfig.json", "--outDir", out], {
        cwd: root,
        encoding: "utf8",
      });
      expect(result.status, result.stdout + result.stderr).toBe(0);

      const dist = join(root, "dist");
      expect(listFiles(dist)).toEqual(listFiles(out));
      for (const file of listFiles(out)) {
        expect(readFileSync(join(dist, file), "utf8"), file).toBe(readFileSync(join(out, file), "utf8"));
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});
