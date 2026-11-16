import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface ClaudeRun {
  system: string;
  input: string;
  /** JSON Schema the answer must match; the CLI returns it as `structured_output`. */
  schema: object;
  /** The owner's token from `claude setup-token`; null uses the machine's own `claude` login (dev only). */
  token: string | null;
}

type ClaudeResult =
  | { ok: true; output: unknown }
  | { ok: false; reason: "auth" | "unavailable" | "busy" | "error" };

const TIMEOUT_MS = 90_000;
// One child is a whole Node process: a few quick sends (or a stolen session in a loop) must not pile them up on a small host.
const MAX_CONCURRENT = 2;
const MAX_OUTPUT = 1_000_000;
// shortcut: counted per process, not per user; fine for one container, move to the database if the app ever runs several replicas.
let running = 0;

/**
 * One headless Claude Code call. No tools, no MCP, no settings, no session files: the model can only answer.
 * The message goes through stdin (never argv), the child runs in an empty temp dir.
 */
export async function runClaude(run: ClaudeRun): Promise<ClaudeResult> {
  if (running >= MAX_CONCURRENT) return { ok: false, reason: "busy" };
  running++;
  try {
    return await execute(run);
  } finally {
    running--;
  }
}

async function execute({ system, input, schema, token }: ClaudeRun): Promise<ClaudeResult> {
  const dir = await mkdtemp(join(tmpdir(), "lt-claude-"));
  // With a token the child gets an empty HOME, so it can never fall back to the server's own login.
  const env = {
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH,
    HOME: token ? dir : process.env.HOME,
    USER: process.env.USER, // the macOS Keychain lookup of a local login needs it
    ...(token ? { CLAUDE_CODE_OAUTH_TOKEN: token } : {}),
  };
  const args = [
    "-p",
    "--model", process.env.CLAUDE_MODEL || "sonnet",
    "--output-format", "json",
    "--json-schema", JSON.stringify(schema),
    "--system-prompt", system,
    "--tools", "",
    "--strict-mcp-config",
    "--setting-sources", "",
    "--no-session-persistence",
  ];

  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(/*turbopackIgnore: true*/ process.env.CLAUDE_BIN || "claude", args, { cwd: dir, env, stdio: ["pipe", "pipe", "ignore"] });
      let out = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
      child.stdout.on("data", (d) => {
        out += d;
        if (out.length > MAX_OUTPUT) child.kill("SIGKILL");
      });
      child.on("error", reject);
      child.on("close", () => (clearTimeout(timer), resolve(out)));
      child.stdin.end(input);
    });
    const result = JSON.parse(stdout);
    if (result.is_error) return { ok: false, reason: result.api_error_status === 401 ? "auth" : "error" };
    return { ok: true, output: result.structured_output };
  } catch (err) {
    // ENOENT: the CLI is not installed here. Nothing else is logged: stdout may echo the user's food data.
    return { ok: false, reason: (err as NodeJS.ErrnoException)?.code === "ENOENT" ? "unavailable" : "error" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
