import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findLegacyFile, setAsideLegacyFile } from "./legacy-file.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "legacy-"));
  dirs.push(dir);
  return dir;
}

describe("legacy console identity file", () => {
  it("reads the declared protection", () => {
    const path = join(scratch(), "identity.key.json");
    writeFileSync(path, JSON.stringify({ version: 1, protection: "device" }));
    expect(findLegacyFile(path)?.protection).toBe("device");
  });

  it("sets aside under a dated name without overwriting an earlier one", () => {
    const path = join(scratch(), "identity.key.json");
    const now = new Date("2026-10-01T12:00:00Z");
    writeFileSync(`${path}.2026-10-01.old`, "earlier");
    writeFileSync(path, "{}");
    const target = setAsideLegacyFile(findLegacyFile(path)!, now);
    expect(target).toBe(`${path}.2026-10-01-2.old`);
    expect(existsSync(path)).toBe(false);
    expect(existsSync(`${path}.2026-10-01.old`)).toBe(true);
  });
});
