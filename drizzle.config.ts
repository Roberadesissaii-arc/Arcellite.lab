import { defineConfig } from "drizzle-kit"

// drizzle-kit runs outside Next.js, so load .env ourselves when it exists.
try {
  process.loadEnvFile(".env")
} catch {
  // No .env file: rely on the process environment (CI, containers).
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: false,
})
