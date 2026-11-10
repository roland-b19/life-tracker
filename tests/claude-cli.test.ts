import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runClaude } from "@/lib/claude-cli";

// A stand-in for the `claude` binary that answers after a short wait.
function fakeCli(body: string) {
  const file = join(mkdtempSync(join(tmpdir(), "fake-claude-")), "claude");
  writeFileSync(file, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(file, 0o755);
  return file;
}

const run = () => runClaude({ system: "s", input: "hi", schema: {}, token: "t" });

describe("runClaude", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns the structured output", async () => {
    vi.stubEnv("CLAUDE_BIN", fakeCli(`process.stdin.resume();process.stdin.on("end",()=>console.log(JSON.stringify({structured_output:{ok:1}})))`));
    expect(await run()).toEqual({ ok: true, output: { ok: 1 } });
  });

  it("refuses a third concurrent call instead of spawning another process", async () => {
    vi.stubEnv("CLAUDE_BIN", fakeCli(`setTimeout(()=>console.log(JSON.stringify({structured_output:1})),300)`));
    const results = await Promise.all([run(), run(), run()]);
    expect(results.filter((r) => !r.ok && r.reason === "busy")).toHaveLength(1);
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    // The slots are free again afterwards.
    expect((await run()).ok).toBe(true);
  });

  it("stops a child that floods stdout", async () => {
    vi.stubEnv("CLAUDE_BIN", fakeCli(`const b="x".repeat(100000);for(let i=0;i<100;i++)process.stdout.write(b);setTimeout(()=>{},60000)`));
    expect(await run()).toEqual({ ok: false, reason: "error" });
  });
});
