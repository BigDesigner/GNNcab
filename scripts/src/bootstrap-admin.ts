import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

const SALT_ROUNDS = 12;

interface BootstrapArgs {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

function usage(): never {
  console.error("Usage: pnpm --filter @workspace/scripts run bootstrap-admin -- --email <email> --password <password> [--first-name <first>] [--last-name <last>]");
  process.exit(1);
}

function parseArgs(argv: string[]): BootstrapArgs {
  const values = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key?.startsWith("--")) {
      usage();
    }

    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      usage();
    }

    values.set(key, value);
    i += 1;
  }

  const email = values.get("--email")?.trim().toLowerCase();
  const password = values.get("--password");
  const firstName = values.get("--first-name")?.trim() || "System";
  const lastName = values.get("--last-name")?.trim() || "Admin";

  if (!email || !password) {
    usage();
  }

  return { email, password, firstName, lastName };
}

function validateEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid email address.");
  }
}

function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error("Password must contain at least one uppercase letter.");
  }
  if (!/[0-9]/.test(password)) {
    throw new Error("Password must contain at least one digit.");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new Error("Password must contain at least one special character.");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateEmail(args.email);
  validatePassword(args.password);

  const existingAdmin = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"))
    .limit(1);

  if (existingAdmin.length > 0) {
    throw new Error(`Bootstrap aborted: an admin already exists (${existingAdmin[0].email}).`);
  }

  const existingUser = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.email, args.email))
    .limit(1);

  if (existingUser.length > 0) {
    throw new Error(`Bootstrap aborted: email ${args.email} already exists with role ${existingUser[0].role}.`);
  }

  const passwordHash = await bcrypt.hash(args.password, SALT_ROUNDS);

  const [admin] = await db.insert(usersTable).values({
    email: args.email,
    passwordHash,
    firstName: args.firstName,
    lastName: args.lastName,
    role: "admin",
    isActive: true,
  }).returning({
    id: usersTable.id,
    email: usersTable.email,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
  });

  console.log("Admin bootstrap complete.");
  console.log(`  Admin ID: ${admin.id}`);
  console.log(`  Email: ${admin.email}`);
  console.log(`  Name: ${admin.firstName} ${admin.lastName}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
