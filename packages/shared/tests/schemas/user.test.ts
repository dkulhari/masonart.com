/**
 * User Schema Tests
 *
 * Comprehensive tests for user-related Zod schemas including:
 * - User validation
 * - User preferences validation
 * - Trade business validation
 * - Session validation
 * - Authentication schemas validation
 */

import { describe, it, expect } from "vitest";
import {
  UserSchema,
  UserCreateSchema,
  UserUpdateSchema,
  UserProfileSchema,
  UserRoleSchema,
  TradeAccountStatusSchema,
  UserPreferencesSchema,
  TradeBusinessSchema,
  SessionSchema,
  LoginCredentialsSchema,
  PasswordResetRequestSchema,
  PasswordResetSchema,
  TradeAccountApplicationSchema,
  UserFilterSchema,
} from "../../src/schemas/user.js";

describe("User Role Schema", () => {
  it("should accept valid roles", () => {
    expect(UserRoleSchema.safeParse("admin").success).toBe(true);
    expect(UserRoleSchema.safeParse("customer").success).toBe(true);
    expect(UserRoleSchema.safeParse("trade").success).toBe(true);
  });

  it("should reject invalid roles", () => {
    expect(UserRoleSchema.safeParse("user").success).toBe(false);
    expect(UserRoleSchema.safeParse("moderator").success).toBe(false);
    expect(UserRoleSchema.safeParse("").success).toBe(false);
  });
});

describe("Trade Account Status Schema", () => {
  it("should accept valid trade account statuses", () => {
    expect(TradeAccountStatusSchema.safeParse("pending").success).toBe(true);
    expect(TradeAccountStatusSchema.safeParse("approved").success).toBe(true);
    expect(TradeAccountStatusSchema.safeParse("rejected").success).toBe(true);
  });

  it("should reject invalid trade account statuses", () => {
    expect(TradeAccountStatusSchema.safeParse("active").success).toBe(false);
    expect(TradeAccountStatusSchema.safeParse("inactive").success).toBe(false);
    expect(TradeAccountStatusSchema.safeParse("").success).toBe(false);
  });
});

describe("User Preferences Schema", () => {
  const validPreferences = {
    emailNotifications: true,
    smsNotifications: false,
    marketingEmails: true,
    orderUpdates: true,
    aiGenerationNotifications: false,
  };

  it("should validate valid preferences", () => {
    const result = UserPreferencesSchema.safeParse(validPreferences);
    expect(result.success).toBe(true);
  });

  it("should require all preference fields", () => {
    const { emailNotifications, ...incomplete } = validPreferences;
    const result = UserPreferencesSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it("should accept all boolean values", () => {
    const allTrue = {
      emailNotifications: true,
      smsNotifications: true,
      marketingEmails: true,
      orderUpdates: true,
      aiGenerationNotifications: true,
    };
    expect(UserPreferencesSchema.safeParse(allTrue).success).toBe(true);

    const allFalse = {
      emailNotifications: false,
      smsNotifications: false,
      marketingEmails: false,
      orderUpdates: false,
      aiGenerationNotifications: false,
    };
    expect(UserPreferencesSchema.safeParse(allFalse).success).toBe(true);
  });

  it("should reject non-boolean values", () => {
    const invalid = { ...validPreferences, emailNotifications: "yes" };
    expect(UserPreferencesSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("Trade Business Schema", () => {
  const validTradeBusiness = {
    businessName: "ABC Interiors Pvt Ltd",
    gstNumber: "29ABCDE1234F1Z5",
    businessType: "Interior Design Firm",
  };

  it("should validate valid trade business", () => {
    const result = TradeBusinessSchema.safeParse(validTradeBusiness);
    expect(result.success).toBe(true);
  });

  it("should validate trade business without optional GST number", () => {
    const { gstNumber, ...business } = validTradeBusiness;
    const result = TradeBusinessSchema.safeParse(business);
    expect(result.success).toBe(true);
  });

  describe("Business name validation", () => {
    it("should accept names with 2-200 characters", () => {
      expect(
        TradeBusinessSchema.safeParse({ ...validTradeBusiness, businessName: "AB" }).success
      ).toBe(true);
      expect(
        TradeBusinessSchema.safeParse({ ...validTradeBusiness, businessName: "A".repeat(200) })
          .success
      ).toBe(true);
    });

    it("should reject names under 2 characters", () => {
      expect(
        TradeBusinessSchema.safeParse({ ...validTradeBusiness, businessName: "A" }).success
      ).toBe(false);
    });

    it("should reject names over 200 characters", () => {
      expect(
        TradeBusinessSchema.safeParse({ ...validTradeBusiness, businessName: "A".repeat(201) })
          .success
      ).toBe(false);
    });
  });

  describe("GST number validation", () => {
    it("should accept valid GST numbers", () => {
      const validGSTs = ["29ABCDE1234F1Z5", "07AAACP5238R1ZV", "27AAAAA0000A1Z5"];
      validGSTs.forEach((gstNumber) => {
        expect(TradeBusinessSchema.safeParse({ ...validTradeBusiness, gstNumber }).success).toBe(
          true
        );
      });
    });

    it("should reject invalid GST number formats", () => {
      const invalidGSTs = [
        "29abcde1234F1Z5", // lowercase
        "29ABCDE1234F1Z", // too short
        "29-ABCDE-1234-F1Z5", // hyphens
        "29 ABCDE 1234 F1Z5", // spaces
        "ABCDE1234F1Z5", // missing state code
      ];
      invalidGSTs.forEach((gstNumber) => {
        expect(TradeBusinessSchema.safeParse({ ...validTradeBusiness, gstNumber }).success).toBe(
          false
        );
      });
    });
  });

  describe("Business type validation", () => {
    it("should accept types with 2-100 characters", () => {
      expect(
        TradeBusinessSchema.safeParse({ ...validTradeBusiness, businessType: "AB" }).success
      ).toBe(true);
      expect(
        TradeBusinessSchema.safeParse({ ...validTradeBusiness, businessType: "A".repeat(100) })
          .success
      ).toBe(true);
    });

    it("should reject types under 2 characters", () => {
      expect(
        TradeBusinessSchema.safeParse({ ...validTradeBusiness, businessType: "A" }).success
      ).toBe(false);
    });

    it("should reject types over 100 characters", () => {
      expect(
        TradeBusinessSchema.safeParse({ ...validTradeBusiness, businessType: "A".repeat(101) })
          .success
      ).toBe(false);
    });
  });
});

describe("User Schema", () => {
  const validAddress = {
    id: "addr_1234567890",
    fullName: "John Doe",
    phone: "+919876543210",
    addressLine1: "123 MG Road",
    city: "Bangalore",
    state: "Karnataka",
    pincode: "560034",
    country: "India",
    isDefault: true,
    type: "home" as const,
  };

  const validPreferences = {
    emailNotifications: true,
    smsNotifications: true,
    marketingEmails: false,
    orderUpdates: true,
    aiGenerationNotifications: true,
  };

  const validUser = {
    id: "user_1234567890",
    email: "john.doe@example.com",
    name: "John Doe",
    phone: "+919876543210",
    role: "customer" as const,
    emailVerified: true,
    phoneVerified: false,
    avatarUrl: "https://cdn.example.com/avatars/john.jpg",
    addresses: [validAddress],
    preferences: validPreferences,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("should validate a complete valid user", () => {
    const result = UserSchema.safeParse(validUser);
    expect(result.success).toBe(true);
  });

  it("should validate user without optional fields", () => {
    const { phone, avatarUrl, ...user } = validUser;
    const result = UserSchema.safeParse(user);
    expect(result.success).toBe(true);
  });

  describe("Email validation", () => {
    it("should accept valid email addresses", () => {
      const validEmails = [
        "test@example.com",
        "user.name@example.com",
        "user+tag@example.co.uk",
        "user123@test-domain.com",
      ];
      validEmails.forEach((email) => {
        expect(UserSchema.safeParse({ ...validUser, email }).success).toBe(true);
      });
    });

    it("should convert email to lowercase", () => {
      const result = UserSchema.safeParse({ ...validUser, email: "John.Doe@EXAMPLE.COM" });
      if (result.success) {
        expect(result.data.email).toBe("john.doe@example.com");
      }
    });

    it("should reject invalid email addresses", () => {
      const invalidEmails = [
        "not-an-email",
        "@example.com",
        "user@",
        "user @example.com",
        "user@.com",
      ];
      invalidEmails.forEach((email) => {
        expect(UserSchema.safeParse({ ...validUser, email }).success).toBe(false);
      });
    });

    it("should reject email over 255 characters", () => {
      const longEmail = "a".repeat(250) + "@test.com";
      expect(UserSchema.safeParse({ ...validUser, email: longEmail }).success).toBe(false);
    });
  });

  describe("Name validation", () => {
    it("should accept names with 2-100 characters", () => {
      expect(UserSchema.safeParse({ ...validUser, name: "Jo" }).success).toBe(true);
      expect(UserSchema.safeParse({ ...validUser, name: "A".repeat(100) }).success).toBe(true);
    });

    it("should reject names under 2 characters", () => {
      expect(UserSchema.safeParse({ ...validUser, name: "J" }).success).toBe(false);
    });

    it("should reject names over 100 characters", () => {
      expect(UserSchema.safeParse({ ...validUser, name: "A".repeat(101) }).success).toBe(false);
    });
  });

  describe("Phone validation", () => {
    it("should accept valid E.164 phone numbers", () => {
      const validPhones = ["+919876543210", "+14155552671", "+442071838750"];
      validPhones.forEach((phone) => {
        expect(UserSchema.safeParse({ ...validUser, phone }).success).toBe(true);
      });
    });

    it("should reject invalid phone numbers", () => {
      const invalidPhones = [
        "9876543210", // Missing country code
        "+91 98765 43210", // Spaces
        "+91-9876543210", // Hyphens
      ];
      invalidPhones.forEach((phone) => {
        expect(UserSchema.safeParse({ ...validUser, phone }).success).toBe(false);
      });
    });
  });

  describe("Avatar URL validation", () => {
    it("should accept valid URLs", () => {
      const validUrls = [
        "https://cdn.example.com/avatar.jpg",
        "http://example.com/avatar.png",
        "https://example.com/path/to/avatar.webp",
      ];
      validUrls.forEach((avatarUrl) => {
        expect(UserSchema.safeParse({ ...validUser, avatarUrl }).success).toBe(true);
      });
    });

    it("should reject invalid URLs", () => {
      expect(UserSchema.safeParse({ ...validUser, avatarUrl: "not-a-url" }).success).toBe(false);
    });
  });

  describe("Addresses validation", () => {
    it("should accept empty addresses array", () => {
      expect(UserSchema.safeParse({ ...validUser, addresses: [] }).success).toBe(true);
    });

    it("should accept up to 10 addresses", () => {
      const addresses = Array(10).fill(validAddress);
      expect(UserSchema.safeParse({ ...validUser, addresses }).success).toBe(true);
    });

    it("should reject more than 10 addresses", () => {
      const addresses = Array(11).fill(validAddress);
      expect(UserSchema.safeParse({ ...validUser, addresses }).success).toBe(false);
    });
  });

  describe("Trade account validation", () => {
    it("should validate user with trade account", () => {
      const tradeUser = {
        ...validUser,
        role: "trade" as const,
        tradeAccountStatus: "approved" as const,
        tradeBusiness: {
          businessName: "ABC Interiors",
          gstNumber: "29ABCDE1234F1Z5",
          businessType: "Interior Design",
        },
      };
      expect(UserSchema.safeParse(tradeUser).success).toBe(true);
    });
  });
});

describe("User Create Schema", () => {
  const validUserCreate = {
    email: "john.doe@example.com",
    name: "John Doe",
    phone: "+919876543210",
    password: "SecurePass123",
  };

  it("should validate valid user creation data", () => {
    const result = UserCreateSchema.safeParse(validUserCreate);
    expect(result.success).toBe(true);
  });

  it("should validate user creation without optional phone", () => {
    const { phone, ...userCreate } = validUserCreate;
    const result = UserCreateSchema.safeParse(userCreate);
    expect(result.success).toBe(true);
  });

  describe("Password validation", () => {
    it("should accept valid passwords", () => {
      const validPasswords = ["Password1", "SecurePass123", "MyP@ssw0rd", "Complex1Password"];
      validPasswords.forEach((password) => {
        expect(UserCreateSchema.safeParse({ ...validUserCreate, password }).success).toBe(true);
      });
    });

    it("should reject passwords under 8 characters", () => {
      expect(UserCreateSchema.safeParse({ ...validUserCreate, password: "Pass1" }).success).toBe(
        false
      );
    });

    it("should reject passwords over 100 characters", () => {
      const longPassword = "A".repeat(50) + "a".repeat(50) + "1";
      expect(
        UserCreateSchema.safeParse({ ...validUserCreate, password: longPassword }).success
      ).toBe(false);
    });

    it("should reject passwords without lowercase letter", () => {
      expect(
        UserCreateSchema.safeParse({ ...validUserCreate, password: "PASSWORD123" }).success
      ).toBe(false);
    });

    it("should reject passwords without uppercase letter", () => {
      expect(
        UserCreateSchema.safeParse({ ...validUserCreate, password: "password123" }).success
      ).toBe(false);
    });

    it("should reject passwords without number", () => {
      expect(
        UserCreateSchema.safeParse({ ...validUserCreate, password: "PasswordABC" }).success
      ).toBe(false);
    });
  });
});

describe("User Update Schema", () => {
  it("should require id field", () => {
    const update = { name: "New Name" };
    const result = UserUpdateSchema.safeParse(update);
    expect(result.success).toBe(false);
  });

  it("should accept partial updates with id", () => {
    const update = {
      id: "user_123",
      name: "New Name",
      phone: "+919999999999",
    };
    const result = UserUpdateSchema.safeParse(update);
    expect(result.success).toBe(true);
  });

  it("should validate partial fields", () => {
    const invalidUpdate = {
      id: "user_123",
      email: "not-an-email",
    };
    const result = UserUpdateSchema.safeParse(invalidUpdate);
    expect(result.success).toBe(false);
  });
});

describe("User Profile Schema", () => {
  it("should include public fields only", () => {
    const profile = {
      id: "user_123",
      name: "John Doe",
      role: "customer" as const,
      emailVerified: true,
      phoneVerified: false,
      avatarUrl: "https://cdn.example.com/avatar.jpg",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = UserProfileSchema.safeParse(profile);
    expect(result.success).toBe(true);
  });
});

describe("Session Schema", () => {
  const validSession = {
    id: "session_1234567890",
    userId: "user_1234567890",
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdAt: new Date(),
  };

  it("should validate valid session", () => {
    const result = SessionSchema.safeParse(validSession);
    expect(result.success).toBe(true);
  });

  it("should require all fields", () => {
    const { token, ...incomplete } = validSession;
    const result = SessionSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it("should reject empty token", () => {
    expect(SessionSchema.safeParse({ ...validSession, token: "" }).success).toBe(false);
  });
});

describe("Login Credentials Schema", () => {
  const validCredentials = {
    email: "john.doe@example.com",
    password: "password123",
  };

  it("should validate valid credentials", () => {
    const result = LoginCredentialsSchema.safeParse(validCredentials);
    expect(result.success).toBe(true);
  });

  it("should convert email to lowercase", () => {
    const result = LoginCredentialsSchema.safeParse({
      email: "John.Doe@EXAMPLE.COM",
      password: "password123",
    });
    if (result.success) {
      expect(result.data.email).toBe("john.doe@example.com");
    }
  });

  it("should reject invalid email", () => {
    const result = LoginCredentialsSchema.safeParse({
      email: "not-an-email",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty password", () => {
    const result = LoginCredentialsSchema.safeParse({
      email: "john.doe@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("Password Reset Request Schema", () => {
  it("should validate valid email", () => {
    const result = PasswordResetRequestSchema.safeParse({
      email: "john.doe@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("should convert email to lowercase", () => {
    const result = PasswordResetRequestSchema.safeParse({
      email: "John.Doe@EXAMPLE.COM",
    });
    if (result.success) {
      expect(result.data.email).toBe("john.doe@example.com");
    }
  });

  it("should reject invalid email", () => {
    const result = PasswordResetRequestSchema.safeParse({
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});

describe("Password Reset Schema", () => {
  const validReset = {
    token: "reset_token_1234567890",
    password: "NewPassword123",
  };

  it("should validate valid password reset", () => {
    const result = PasswordResetSchema.safeParse(validReset);
    expect(result.success).toBe(true);
  });

  it("should reject empty token", () => {
    expect(PasswordResetSchema.safeParse({ ...validReset, token: "" }).success).toBe(false);
  });

  it("should apply same password rules as user creation", () => {
    // Too short
    expect(PasswordResetSchema.safeParse({ ...validReset, password: "Pass1" }).success).toBe(false);
    // No uppercase
    expect(PasswordResetSchema.safeParse({ ...validReset, password: "password123" }).success).toBe(
      false
    );
    // No lowercase
    expect(PasswordResetSchema.safeParse({ ...validReset, password: "PASSWORD123" }).success).toBe(
      false
    );
    // No number
    expect(PasswordResetSchema.safeParse({ ...validReset, password: "PasswordABC" }).success).toBe(
      false
    );
  });
});

describe("Trade Account Application Schema", () => {
  const validApplication = {
    businessName: "ABC Interiors Pvt Ltd",
    gstNumber: "29ABCDE1234F1Z5",
    businessType: "Interior Design Firm",
    email: "contact@abcinteriors.com",
    phone: "+919876543210",
    additionalInfo: "We specialize in commercial interior design projects.",
  };

  it("should validate valid trade application", () => {
    const result = TradeAccountApplicationSchema.safeParse(validApplication);
    expect(result.success).toBe(true);
  });

  it("should validate application with minimal required fields", () => {
    const minimal = {
      businessName: "ABC Interiors",
      businessType: "Interior Design",
    };
    const result = TradeAccountApplicationSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("should reject additional info over 1000 characters", () => {
    const application = { ...validApplication, additionalInfo: "A".repeat(1001) };
    expect(TradeAccountApplicationSchema.safeParse(application).success).toBe(false);
  });
});

describe("User Filter Schema", () => {
  it("should accept empty filter", () => {
    const result = UserFilterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should accept partial filters", () => {
    const filters = [
      { role: "customer" },
      { emailVerified: true },
      { tradeAccountStatus: "approved" },
      { search: "john" },
      { limit: 20 },
      { offset: 40 },
    ];

    filters.forEach((filter) => {
      const result = UserFilterSchema.safeParse(filter);
      expect(result.success).toBe(true);
    });
  });

  it("should accept combined filters", () => {
    const filter = {
      role: "trade" as const,
      emailVerified: true,
      tradeAccountStatus: "approved" as const,
      search: "john",
      limit: 50,
      offset: 0,
    };

    const result = UserFilterSchema.safeParse(filter);
    expect(result.success).toBe(true);
  });

  describe("Pagination validation", () => {
    it("should accept valid limit values", () => {
      expect(UserFilterSchema.safeParse({ limit: 1 }).success).toBe(true);
      expect(UserFilterSchema.safeParse({ limit: 50 }).success).toBe(true);
      expect(UserFilterSchema.safeParse({ limit: 100 }).success).toBe(true);
    });

    it("should reject limit over 100", () => {
      expect(UserFilterSchema.safeParse({ limit: 101 }).success).toBe(false);
    });

    it("should reject zero or negative limit", () => {
      expect(UserFilterSchema.safeParse({ limit: 0 }).success).toBe(false);
      expect(UserFilterSchema.safeParse({ limit: -1 }).success).toBe(false);
    });

    it("should accept zero offset", () => {
      expect(UserFilterSchema.safeParse({ offset: 0 }).success).toBe(true);
    });

    it("should reject negative offset", () => {
      expect(UserFilterSchema.safeParse({ offset: -1 }).success).toBe(false);
    });
  });
});
