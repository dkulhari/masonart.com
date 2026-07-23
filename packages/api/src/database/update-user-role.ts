/**
 * Update User Role
 *
 * Updates a user's role in the database.
 * Usage: bun run packages/api/src/database/update-user-role.ts <email> <role>
 *
 * Example: bun run packages/api/src/database/update-user-role.ts test-admin@chobi.art admin
 */

import { db, closeDatabase } from "./index";
import { users } from "./schema";
import { eq } from "drizzle-orm";

const emailArg = process.argv[2];
const roleArg = process.argv[3];

if (!emailArg || !roleArg) {
  console.error("Usage: bun run update-user-role.ts <email> <role>");
  console.error("Roles: customer, trade, admin, super-admin");
  process.exit(1);
}

const email: string = emailArg;
const role: string = roleArg;

const validRoles = ["customer", "trade", "admin", "super-admin"];
if (!validRoles.includes(roleArg)) {
  console.error(`Invalid role: ${roleArg}`);
  console.error(`Valid roles: ${validRoles.join(", ")}`);
  process.exit(1);
}

async function updateRole() {
  try {
    const result = await db
      .update(users)
      .set({
        role: role as "customer" | "trade" | "admin" | "super-admin",
        emailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(users.email, email))
      .returning({ id: users.id, email: users.email, role: users.role });

    if (result.length === 0) {
      console.error(`User not found: ${email}`);
      process.exit(1);
    }

    console.log(`Updated ${email} to role: ${role}`);
  } catch (error) {
    console.error(`Failed to update role:`, error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

updateRole();
