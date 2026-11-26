import path from "node:path";
import { defineConfig } from "vitest/config";

// `npm run test:tidb`: needs network access and TiDB credentials, so it is separate from `npm test`.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    // next-auth imports "next/server" without an extension, which only a bundler resolves
    server: { deps: { inline: ["next-auth"] } },
    include: ["tests/tidb/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 240_000,
  },
});
