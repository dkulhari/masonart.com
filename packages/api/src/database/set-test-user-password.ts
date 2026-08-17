/**
 * Set a Credential Password (test support)
 *
 * Usage: bun run packages/api/src/database/set-test-user-password.ts <email> <password>
 *
 * Why this exists
 * ---------------
 * `routes/admin/vendor-invite.ts` mints the vendor account with a password
 * nobody knows — two UUIDs — and mails a reset link. That is the right
 * production behaviour and it is exactly what stops an E2E run from signing in
 * as the vendor it just invited: there is no mailbox to read the link out of.
 *
 * So the harness sets the credential itself, the same way
 * `seed-test-users.ts` does: Better Auth's own scrypt `hashPassword`, written
 * to the `credential` row in `accounts`. A hand-rolled bcrypt hash satisfies
 * the column and cannot sign in.
 *
 * Refuses to run against NODE_ENV=production. Nothing here belongs near a real
 * database.
 */

import { db, closeDatabase } from "./index";
import { users, accounts } from "./schema";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error(
    "Usage: bun run set-test-user-password.ts <email> <password>"
  );
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to set a password directly in production.");
  process.exit(1);
}

async function setPassword(userEmail: string, plain: string): Promise<void> {
  try {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, userEmail))
      .limit(1);

    if (!user) {
      console.error(`User not found: ${userEmail}`);
      process.exit(1);
    }

    const passwordHash = await hashPassword(plain);

    const [credential] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential"))
      )
      .limit(1);

    if (credential) {
      await db
        .update(accounts)
        .set({ password: passwordHash, updatedAt: new Date() })
        .where(eq(accounts.id, credential.id));
    } else {
      await db.insert(accounts).values({
        id: `account-${user.id}`,
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: passwordHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // A login the harness cannot complete is indistinguishable from a broken
    // guard, and an unverified address is one of the ways that happens.
    await db
      .update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    console.log(`Set password for ${userEmail}`);
  } catch (error) {
    console.error("Failed to set password:", error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

void setPassword(email, password);
