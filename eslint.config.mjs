import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Only the access layer reaches the database: pages, components, server actions, route
    // handlers and other lib code call lib/repo (or lib/authn for signing in), never a client.
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    ignores: ["lib/repo/**", "lib/authn/**", "lib/db/**", "db/**", "scripts/**", "tests/**", "drizzle.config.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", {
        patterns: [
          {
            // lib/db/types holds row types only, so it stays importable
            regex: "^@/lib/db(/(?!types$).*)?$",
            message: "Database access goes through lib/repo (user first).",
            allowTypeImports: true,
          },
          {
            regex: "^(@/db(/.*)?|drizzle-orm(/.*)?|@tidbcloud/serverless|mysql2(/.*)?)$",
            message: "Database access goes through lib/repo (user first).",
            allowTypeImports: true,
          },
        ],
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cloudflare (OpenNext / wrangler) build output: removed with Cloudflare in S4
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
