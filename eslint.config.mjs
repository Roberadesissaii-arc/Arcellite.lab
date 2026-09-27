import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Browser code never reaches the database, crypto, or other server internals.
    files: ["src/components/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{ group: ["@/server", "@/server/*"], message: "Client and shared code must not import server modules. Call the /api/v1 routes instead." }],
          paths: [
            { name: "pg", message: "Database access belongs in src/server." },
            { name: "drizzle-orm", message: "Database access belongs in src/server." },
            { name: "@node-rs/argon2", message: "Password hashing belongs in src/server." },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
