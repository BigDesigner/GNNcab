import { defineConfig } from "drizzle-kit";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

for (const candidate of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(currentDir, "../../.env"),
]) {
  if (fs.existsSync(candidate)) {
    process.loadEnvFile?.(candidate);
    break;
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(currentDir, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
