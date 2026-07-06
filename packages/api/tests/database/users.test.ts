/**
 * Users Database Schema Tests
 *
 * Tests for users, addresses, and sessions database tables.
 * Validates schema structure, relationships, and CRUD operations.
 *
 * These tests require a running PostgreSQL database. When SKIP_DB_RUNTIME_TESTS
 * is set to 'true', all tests are skipped (useful for CI without database).
 * Tests also gracefully skip when database is unavailable.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import {
  users,
  addresses,
  sessions,
  type User,
  type Address,
  type Session,
} from "../../src/db/schema";

// Check if we should skip database runtime tests
const SKIP_TESTS = process.env.SKIP_DB_RUNTIME_TESTS === "true";

// Track database availability
let isDatabaseAvailable = false;

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle> | null = null;

beforeAll(async () => {
  if (SKIP_TESTS) {
    console.log("⏭️  Skipping database tests (SKIP_DB_RUNTIME_TESTS=true)");
    return;
  }

  try {
    const databaseUrl =
      process.env.DATABASE_URL ||
      "postgresql://poster_app:dev_password@localhost:5433/poster_app_test";
    client = postgres(databaseUrl, {
      max: 1,
      connect_timeout: 5,
      idle_timeout: 5,
    });

    // Test connection
    await client`SELECT 1`;
    isDatabaseAvailable = true;
    db = drizzle(client);

    // Drop tables to ensure clean state
    await client`DROP TABLE IF EXISTS sessions CASCADE`;
    await client`DROP TABLE IF EXISTS addresses CASCADE`;
    await client`DROP TABLE IF EXISTS users CASCADE`;

    await client`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

    // Create enums
    await client`
      DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('admin', 'customer', 'trade');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    await client`
      DO $$ BEGIN
        CREATE TYPE trade_account_status AS ENUM ('pending', 'approved', 'rejected');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    await client`
      DO $$ BEGIN
        CREATE TYPE address_type AS ENUM ('home', 'office', 'other');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    // Create users table
    await client`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        password_hash VARCHAR(255),
        role user_role NOT NULL DEFAULT 'customer',
        email_verified BOOLEAN NOT NULL DEFAULT false,
        phone_verified BOOLEAN NOT NULL DEFAULT false,
        avatar_url TEXT,
        preferences JSONB NOT NULL DEFAULT '{"emailNotifications":true,"smsNotifications":false,"marketingEmails":true,"orderUpdates":true,"aiGenerationNotifications":true}',
        trade_account_status trade_account_status,
        trade_business JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;

    // Create addresses table
    await client`
      CREATE TABLE IF NOT EXISTS addresses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        full_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        address_line1 VARCHAR(200) NOT NULL,
        address_line2 VARCHAR(200),
        city VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        pincode VARCHAR(20) NOT NULL,
        country VARCHAR(100) NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT false,
        type address_type NOT NULL DEFAULT 'home'
      )
    `;

    // Create sessions table
    await client`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(500) NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;

    console.log("✅ Database connection established for users schema tests");
  } catch (error) {
    console.log("⚠️  Database not available, runtime tests will be skipped");
    isDatabaseAvailable = false;
    if (client) {
      try {
        await client.end();
      } catch (e) {
        // Ignore cleanup errors
      }
      client = null;
    }
  }
});

afterAll(async () => {
  if (!isDatabaseAvailable || !client) return;

  try {
    await client`DROP TABLE IF EXISTS sessions CASCADE`;
    await client`DROP TABLE IF EXISTS addresses CASCADE`;
    await client`DROP TABLE IF EXISTS users CASCADE`;
    await client.end();
  } catch (error) {
    // Ignore cleanup errors
  }
});

beforeEach(async () => {
  if (!isDatabaseAvailable || !client) return;

  await client`DELETE FROM sessions`;
  await client`DELETE FROM addresses`;
  await client`DELETE FROM users`;
});

// Helper to check if tests should be skipped
const shouldSkip = () => SKIP_TESTS || !isDatabaseAvailable;

describe("Users Table Schema", () => {
  describe("Table Structure", () => {
    it.skipIf(shouldSkip())("should have users table", async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
      `;
      expect(result.length).toBe(1);
    });

    it.skipIf(shouldSkip())("should have all required columns", async () => {
      const result = await client!`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users'
        ORDER BY ordinal_position
      `;

      const columnNames = result.map((row: any) => row.column_name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("email");
      expect(columnNames).toContain("name");
      expect(columnNames).toContain("phone");
      expect(columnNames).toContain("role");
      expect(columnNames).toContain("email_verified");
      expect(columnNames).toContain("phone_verified");
      expect(columnNames).toContain("preferences");
      expect(columnNames).toContain("trade_account_status");
      expect(columnNames).toContain("trade_business");
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("updated_at");
    });

    it.skipIf(shouldSkip())("should have unique constraint on email", async () => {
      const result = await client!`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'users' AND constraint_type = 'UNIQUE'
      `;
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("User CRUD Operations", () => {
    it.skipIf(shouldSkip())("should insert a user", async () => {
      const [result] = await db!
        .insert(users)
        .values({
          email: "test@example.com",
          name: "Test User",
          phone: "+919876543210",
          role: "customer",
        })
        .returning();

      expect(result).toHaveProperty("id");
      expect(result.email).toBe("test@example.com");
      expect(result.name).toBe("Test User");
      expect(result.role).toBe("customer");
      expect(result.emailVerified).toBe(false);
    });

    it.skipIf(shouldSkip())("should select users", async () => {
      await db!.insert(users).values({
        email: "user1@example.com",
        name: "User One",
        role: "customer",
      });

      const result = await db!.select().from(users);
      expect(result).toHaveLength(1);
      expect(result[0].email).toBe("user1@example.com");
    });

    it.skipIf(shouldSkip())("should update a user", async () => {
      const [inserted] = await db!
        .insert(users)
        .values({
          email: "update@example.com",
          name: "Update User",
          role: "customer",
        })
        .returning();

      await db!
        .update(users)
        .set({ name: "Updated Name", emailVerified: true })
        .where(eq(users.id, inserted.id));

      const [result] = await db!.select().from(users).where(eq(users.id, inserted.id));
      expect(result.name).toBe("Updated Name");
      expect(result.emailVerified).toBe(true);
    });

    it.skipIf(shouldSkip())("should delete a user", async () => {
      const [inserted] = await db!
        .insert(users)
        .values({
          email: "delete@example.com",
          name: "Delete User",
          role: "customer",
        })
        .returning();

      await db!.delete(users).where(eq(users.id, inserted.id));

      const result = await db!.select().from(users).where(eq(users.id, inserted.id));
      expect(result).toHaveLength(0);
    });
  });

  describe("User Roles", () => {
    it.skipIf(shouldSkip())("should insert admin user", async () => {
      const [result] = await db!
        .insert(users)
        .values({
          email: "admin@example.com",
          name: "Admin User",
          role: "admin",
        })
        .returning();

      expect(result.role).toBe("admin");
    });

    it.skipIf(shouldSkip())("should insert trade user", async () => {
      const [result] = await db!
        .insert(users)
        .values({
          email: "trade@example.com",
          name: "Trade User",
          role: "trade",
          tradeAccountStatus: "approved",
          tradeBusiness: {
            businessName: "Test Business",
            gstNumber: "29ABCDE1234F1Z5",
            businessType: "Retail",
          },
        })
        .returning();

      expect(result.role).toBe("trade");
      expect(result.tradeAccountStatus).toBe("approved");
      expect(result.tradeBusiness).toHaveProperty("businessName");
    });

    it.skipIf(shouldSkip())("should filter users by role", async () => {
      await db!.insert(users).values([
        { email: "customer1@example.com", name: "Customer 1", role: "customer" },
        { email: "customer2@example.com", name: "Customer 2", role: "customer" },
        { email: "admin1@example.com", name: "Admin 1", role: "admin" },
      ]);

      const customers = await db!.select().from(users).where(eq(users.role, "customer"));
      const admins = await db!.select().from(users).where(eq(users.role, "admin"));

      expect(customers).toHaveLength(2);
      expect(admins).toHaveLength(1);
    });
  });

  describe("User Preferences", () => {
    it.skipIf(shouldSkip())("should store user preferences as JSON", async () => {
      const [result] = await db!
        .insert(users)
        .values({
          email: "prefs@example.com",
          name: "Prefs User",
          role: "customer",
          preferences: {
            emailNotifications: true,
            smsNotifications: true,
            marketingEmails: false,
            orderUpdates: true,
            aiGenerationNotifications: false,
          },
        })
        .returning();

      expect(result.preferences.emailNotifications).toBe(true);
      expect(result.preferences.marketingEmails).toBe(false);
    });

    it.skipIf(shouldSkip())("should use default preferences", async () => {
      const [result] = await db!
        .insert(users)
        .values({
          email: "default@example.com",
          name: "Default User",
          role: "customer",
        })
        .returning();

      expect(result.preferences).toBeDefined();
      expect(result.preferences.emailNotifications).toBe(true);
      expect(result.preferences.orderUpdates).toBe(true);
    });
  });

  describe("Trade Business", () => {
    it.skipIf(shouldSkip())("should store trade business information", async () => {
      const tradeBusiness = {
        businessName: "Art Gallery Ltd",
        gstNumber: "29AAAAA0000A1Z5",
        businessType: "Gallery",
      };

      const [result] = await db!
        .insert(users)
        .values({
          email: "gallery@example.com",
          name: "Gallery Owner",
          role: "trade",
          tradeAccountStatus: "approved",
          tradeBusiness,
        })
        .returning();

      expect(result.tradeBusiness).toEqual(tradeBusiness);
      expect(result.tradeAccountStatus).toBe("approved");
    });

    it.skipIf(shouldSkip())("should handle pending trade accounts", async () => {
      const [result] = await db!
        .insert(users)
        .values({
          email: "pending@example.com",
          name: "Pending Trade",
          role: "trade",
          tradeAccountStatus: "pending",
          tradeBusiness: {
            businessName: "Pending Business",
            businessType: "Retail",
          },
        })
        .returning();

      expect(result.tradeAccountStatus).toBe("pending");
    });
  });

  describe("Email Uniqueness", () => {
    it.skipIf(shouldSkip())("should enforce email uniqueness", async () => {
      await db!.insert(users).values({
        email: "unique@example.com",
        name: "User One",
        role: "customer",
      });

      let error;
      try {
        await db!
          .insert(users)
          .values({
            email: "unique@example.com",
            name: "User Two",
            role: "customer",
          })
          .execute();
      } catch (e: any) {
        error = e;
      }
      expect(error).toBeDefined();
      // PostgreSQL unique violation error - should fail due to duplicate email
      expect(error.message).toContain("unique");
    });
  });
});

describe("Addresses Table Schema", () => {
  let testUserId: string;

  beforeEach(async () => {
    if (shouldSkip() || !db) return;

    const [user] = await db
      .insert(users)
      .values({
        email: "address-test@example.com",
        name: "Address Test User",
        role: "customer",
      })
      .returning();
    testUserId = user.id;
  });

  describe("Table Structure", () => {
    it.skipIf(shouldSkip())("should have addresses table", async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'addresses'
      `;
      expect(result.length).toBe(1);
    });

    it.skipIf(shouldSkip())("should have foreign key to users", async () => {
      const result = await client!`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'addresses' AND constraint_type = 'FOREIGN KEY'
      `;
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Address CRUD Operations", () => {
    it.skipIf(shouldSkip())("should insert an address", async () => {
      const [result] = await db!
        .insert(addresses)
        .values({
          userId: testUserId,
          fullName: "John Doe",
          phone: "+919876543210",
          addressLine1: "123 Main Street",
          addressLine2: "Apt 4B",
          city: "Mumbai",
          state: "Maharashtra",
          pincode: "400001",
          country: "India",
          isDefault: true,
          type: "home",
        })
        .returning();

      expect(result).toHaveProperty("id");
      expect(result.fullName).toBe("John Doe");
      expect(result.city).toBe("Mumbai");
    });

    it.skipIf(shouldSkip())("should select addresses for a user", async () => {
      await db!.insert(addresses).values([
        {
          userId: testUserId,
          fullName: "John Doe",
          phone: "+919876543210",
          addressLine1: "123 Home Street",
          city: "Mumbai",
          state: "Maharashtra",
          pincode: "400001",
          country: "India",
          type: "home",
        },
        {
          userId: testUserId,
          fullName: "John Doe",
          phone: "+919876543210",
          addressLine1: "456 Office Avenue",
          city: "Mumbai",
          state: "Maharashtra",
          pincode: "400002",
          country: "India",
          type: "office",
        },
      ]);

      const result = await db!.select().from(addresses).where(eq(addresses.userId, testUserId));
      expect(result).toHaveLength(2);
    });

    it.skipIf(shouldSkip())("should delete addresses when user is deleted", async () => {
      await db!.insert(addresses).values({
        userId: testUserId,
        fullName: "John Doe",
        phone: "+919876543210",
        addressLine1: "123 Main Street",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400001",
        country: "India",
        type: "home",
      });

      await db!.delete(users).where(eq(users.id, testUserId));

      const result = await db!.select().from(addresses).where(eq(addresses.userId, testUserId));
      expect(result).toHaveLength(0);
    });
  });

  describe("Address Types", () => {
    it.skipIf(shouldSkip())("should support home address type", async () => {
      const [result] = await db!
        .insert(addresses)
        .values({
          userId: testUserId,
          fullName: "Jane Doe",
          phone: "+919876543210",
          addressLine1: "789 Home Road",
          city: "Delhi",
          state: "Delhi",
          pincode: "110001",
          country: "India",
          type: "home",
        })
        .returning();

      expect(result.type).toBe("home");
    });

    it.skipIf(shouldSkip())("should support office address type", async () => {
      const [result] = await db!
        .insert(addresses)
        .values({
          userId: testUserId,
          fullName: "Jane Doe",
          phone: "+919876543210",
          addressLine1: "789 Office Complex",
          city: "Bangalore",
          state: "Karnataka",
          pincode: "560001",
          country: "India",
          type: "office",
        })
        .returning();

      expect(result.type).toBe("office");
    });
  });

  describe("Default Address", () => {
    it.skipIf(shouldSkip())("should set default address flag", async () => {
      const [result] = await db!
        .insert(addresses)
        .values({
          userId: testUserId,
          fullName: "John Doe",
          phone: "+919876543210",
          addressLine1: "123 Main Street",
          city: "Mumbai",
          state: "Maharashtra",
          pincode: "400001",
          country: "India",
          isDefault: true,
          type: "home",
        })
        .returning();

      expect(result.isDefault).toBe(true);
    });

    it.skipIf(shouldSkip())("should filter default address", async () => {
      await db!.insert(addresses).values([
        {
          userId: testUserId,
          fullName: "John Doe",
          phone: "+919876543210",
          addressLine1: "Default Address",
          city: "Mumbai",
          state: "Maharashtra",
          pincode: "400001",
          country: "India",
          isDefault: true,
          type: "home",
        },
        {
          userId: testUserId,
          fullName: "John Doe",
          phone: "+919876543210",
          addressLine1: "Other Address",
          city: "Mumbai",
          state: "Maharashtra",
          pincode: "400002",
          country: "India",
          isDefault: false,
          type: "office",
        },
      ]);

      const result = await db!
        .select()
        .from(addresses)
        .where(eq(addresses.userId, testUserId))
        .where(eq(addresses.isDefault, true));

      expect(result).toHaveLength(1);
      expect(result[0].addressLine1).toBe("Default Address");
    });
  });
});

describe("Sessions Table Schema", () => {
  let testUserId: string;

  beforeEach(async () => {
    if (shouldSkip() || !db) return;

    const [user] = await db
      .insert(users)
      .values({
        email: "session-test@example.com",
        name: "Session Test User",
        role: "customer",
      })
      .returning();
    testUserId = user.id;
  });

  describe("Table Structure", () => {
    it.skipIf(shouldSkip())("should have sessions table", async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'sessions'
      `;
      expect(result.length).toBe(1);
    });

    it.skipIf(shouldSkip())("should have foreign key to users", async () => {
      const result = await client!`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'sessions' AND constraint_type = 'FOREIGN KEY'
      `;
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it.skipIf(shouldSkip())("should have unique constraint on token", async () => {
      const result = await client!`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'sessions' AND constraint_type = 'UNIQUE'
      `;
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Session CRUD Operations", () => {
    it.skipIf(shouldSkip())("should insert a session", async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

      const [result] = await db!
        .insert(sessions)
        .values({
          userId: testUserId,
          token: "test-session-token-123456",
          expiresAt,
        })
        .returning();

      expect(result).toHaveProperty("id");
      expect(result.userId).toBe(testUserId);
      expect(result.token).toBe("test-session-token-123456");
    });

    it.skipIf(shouldSkip())("should select sessions for a user", async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db!.insert(sessions).values([
        {
          userId: testUserId,
          token: "session-token-1",
          expiresAt,
        },
        {
          userId: testUserId,
          token: "session-token-2",
          expiresAt,
        },
      ]);

      const result = await db!.select().from(sessions).where(eq(sessions.userId, testUserId));
      expect(result).toHaveLength(2);
    });

    it.skipIf(shouldSkip())("should delete session", async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const [inserted] = await db!
        .insert(sessions)
        .values({
          userId: testUserId,
          token: "delete-token",
          expiresAt,
        })
        .returning();

      await db!.delete(sessions).where(eq(sessions.id, inserted.id));

      const result = await db!.select().from(sessions).where(eq(sessions.id, inserted.id));
      expect(result).toHaveLength(0);
    });

    it.skipIf(shouldSkip())("should delete sessions when user is deleted", async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db!.insert(sessions).values({
        userId: testUserId,
        token: "cascade-test-token",
        expiresAt,
      });

      await db!.delete(users).where(eq(users.id, testUserId));

      const result = await db!.select().from(sessions).where(eq(sessions.userId, testUserId));
      expect(result).toHaveLength(0);
    });
  });

  describe("Session Token Uniqueness", () => {
    it.skipIf(shouldSkip())("should enforce token uniqueness", async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db!.insert(sessions).values({
        userId: testUserId,
        token: "unique-token",
        expiresAt,
      });

      let error;
      try {
        await db!
          .insert(sessions)
          .values({
            userId: testUserId,
            token: "unique-token",
            expiresAt,
          })
          .execute();
      } catch (e: any) {
        error = e;
      }
      expect(error).toBeDefined();
      // PostgreSQL unique violation error - should fail due to duplicate token
      expect(error.message).toContain("unique");
    });
  });
});
