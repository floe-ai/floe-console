import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deleteLeftoverFile, findLegacyFile, listLeftoverFiles, setAsideLegacyFile } from "./legacy-file.js";

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

  it("lists every file an earlier console left, and nothing else", () => {
    const dir = scratch();
    writeFileSync(join(dir, "identity.key.json.2026-09-16.old"), JSON.stringify({ version: 1, npub: "npub1a", created_at: "2026-09-16T00:00:00Z", protection: "passphrase" }));
    writeFileSync(join(dir, "identity.key.json.2026-09-28-2.old"), "not json");
    writeFileSync(join(dir, "settings.json"), "{}");
    const found = listLeftoverFiles(dir);
    expect(found.map((f) => f.name)).toEqual(["identity.key.json.2026-09-16.old", "identity.key.json.2026-09-28-2.old"]);
    expect(found[0]).toMatchObject({ createdAt: "2026-09-16T00:00:00Z", protection: "passphrase", npub: "npub1a" });
    expect(found[1]).toMatchObject({ createdAt: null, protection: "unknown", npub: null });
    deleteLeftoverFile(found[0]!);
    expect(listLeftoverFiles(dir)).toHaveLength(1);
  });
});
