import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 20000,
    setupFiles: ["./tests/setup.ts"],
    // Other worktrees live under .claude/worktrees; their copies of the tests are not ours.
    exclude: [...configDefaults.exclude, ".claude/worktrees/**"],
  },
  resolve: {
    alias: { "@": path.resolve(".", "src") },
  },
});
