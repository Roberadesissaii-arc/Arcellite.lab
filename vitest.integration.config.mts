import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const root = path.dirname(fileURLToPath(import.meta.url))

/** PostgreSQL integration tests. Files share one database, so they run one at a time. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    fileParallelism: false,
    globalSetup: ["src/test/integration/global-setup.ts"],
    setupFiles: ["src/test/integration/env.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "server-only": path.resolve(root, "src/test/server-only-stub.ts"),
    },
  },
})
