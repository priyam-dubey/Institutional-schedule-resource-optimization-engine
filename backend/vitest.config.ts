import { defineConfig } from "vitest/config";

const hasDb = !!process.env.TEST_DATABASE_URL || process.env.SAMAYAK_TEST_DRIVER === "wasm";

export default defineConfig({
  test: {
    // Integration tests need a disposable Postgres (TEST_DATABASE_URL) and Redis; skipped otherwise.
    exclude: ["node_modules/**", ...(hasDb ? [] : ["tests/integration/**"])],
    // integration tests share one database/redis; run files sequentially
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { NODE_ENV: "test", JWT_SECRET: "t".repeat(48), REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379" },
  },
});
