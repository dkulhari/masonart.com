/**
 * Test Fixtures for Users
 *
 * Provides reusable test data for user-related tests
 */

export interface Address {
  id: string;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault: boolean;
  type: 'home' | 'office' | 'other';
}

export interface UserPreferences {
  emailNotifications: boolean;
  smsNotifications: boolean;
  marketingEmails: boolean;
  orderUpdates: boolean;
  aiGenerationNotifications: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: 'admin' | 'customer' | 'trade';
  emailVerified: boolean;
  phoneVerified: boolean;
  avatarUrl?: string;
  addresses: Address[];
  preferences: UserPreferences;
  tradeAccountStatus?: 'pending' | 'approved' | 'rejected';
  tradeBusiness?: {
    businessName: string;
    gstNumber?: string;
    businessType: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Create a test address with optional overrides
 */
export function createAddress(overrides?: Partial<Address>): Address {
  return {
    id: 'addr_1234567890',
    fullName: 'John Doe',
    phone: '+919876543210',
    addressLine1: '123 MG Road',
    addressLine2: 'Near City Center',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560001',
    country: 'India',
    isDefault: true,
    type: 'home',
    ...overrides,
  };
}

/**
 * Create default user preferences
 */
export function createUserPreferences(overrides?: Partial<UserPreferences>): UserPreferences {
  return {
    emailNotifications: true,
    smsNotifications: true,
    marketingEmails: false,
    orderUpdates: true,
    aiGenerationNotifications: true,
    ...overrides,
  };
}

/**
 * Create a test user with optional overrides
 */
export function createUser(overrides?: Partial<User>): User {
  const now = new Date();

  return {
    id: 'user_1234567890',
    email: 'john.doe@example.com',
    name: 'John Doe',
    phone: '+919876543210',
    role: 'customer',
    emailVerified: true,
    phoneVerified: true,
    avatarUrl: 'https://cdn.example.com/avatars/user_1234567890.jpg',
    addresses: [createAddress()],
    preferences: createUserPreferences(),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create an admin user
 */
export function createAdminUser(overrides?: Partial<User>): User {
  return createUser({
    id: 'user_admin_001',
    email: 'admin@chobii.art',
    name: 'Admin User',
    role: 'admin',
    phone: '+919876543211',
    ...overrides,
  });
}

/**
 * Create a trade/B2B user
 */
export function createTradeUser(overrides?: Partial<User>): User {
  return createUser({
    id: 'user_trade_001',
    email: 'designer@interiordesign.com',
    name: 'Sarah Designer',
    role: 'trade',
    phone: '+919876543212',
    tradeAccountStatus: 'approved',
    tradeBusiness: {
      businessName: 'Elite Interior Designs',
      gstNumber: '29ABCDE1234F1Z5',
      businessType: 'Interior Designer',
    },
    ...overrides,
  });
}

/**
 * Create a guest user (unverified, minimal info)
 */
export function createGuestUser(overrides?: Partial<User>): User {
  return createUser({
    id: 'user_guest_001',
    email: 'guest@example.com',
    name: 'Guest User',
    phone: undefined,
    emailVerified: false,
    phoneVerified: false,
    avatarUrl: undefined,
    addresses: [],
    ...overrides,
  });
}

/**
 * Create multiple test users
 */
export function createUsers(count: number = 5): User[] {
  const users: User[] = [];

  const templates = [
    { name: 'John Doe', email: 'john.doe@example.com', role: 'customer' as const },
    { name: 'Jane Smith', email: 'jane.smith@example.com', role: 'customer' as const },
    { name: 'Admin User', email: 'admin@chobii.art', role: 'admin' as const },
    { name: 'Sarah Designer', email: 'sarah@designs.com', role: 'trade' as const },
    { name: 'Mike Johnson', email: 'mike.j@example.com', role: 'customer' as const },
  ];

  for (let i = 0; i < count; i++) {
    const template = templates[i % templates.length];
    users.push(createUser({
      id: `user_${i.toString().padStart(10, '0')}`,
      name: template.name,
      email: template.email,
      role: template.role,
      phone: `+9198765432${10 + i}`,
    }));
  }

  return users;
}

/**
 * Create multiple addresses for a user
 */
export function createAddresses(userId: string, count: number = 3): Address[] {
  const addresses: Address[] = [];

  const templates = [
    {
      fullName: 'John Doe',
      addressLine1: '123 MG Road',
      addressLine2: 'Near City Center',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560001',
      type: 'home' as const,
      isDefault: true,
    },
    {
      fullName: 'John Doe',
      addressLine1: '456 Tech Park',
      addressLine2: 'Tower B, Floor 5',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560103',
      type: 'office' as const,
      isDefault: false,
    },
    {
      fullName: 'John Doe',
      addressLine1: '789 Beach Road',
      addressLine2: 'Apartment 12A',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      type: 'other' as const,
      isDefault: false,
    },
  ];

  for (let i = 0; i < count; i++) {
    const template = templates[i % templates.length];
    addresses.push(createAddress({
      id: `addr_${userId}_${i}`,
      ...template,
      isDefault: i === 0,
    }));
  }

  return addresses;
}

/**
 * Create a user session
 */
export function createSession(userId: string, overrides?: Partial<Session>): Session {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  return {
    id: 'session_' + Date.now(),
    userId,
    token: 'token_' + Math.random().toString(36).substring(2, 15),
    expiresAt,
    createdAt: now,
    ...overrides,
  };
}

/**
 * Create a user with complete data (addresses, preferences, etc.)
 */
export function createCompleteUser(overrides?: Partial<User>): User {
  const user = createUser(overrides);

  return {
    ...user,
    addresses: createAddresses(user.id, 2),
    preferences: createUserPreferences({
      emailNotifications: true,
      smsNotifications: true,
      marketingEmails: true,
      orderUpdates: true,
      aiGenerationNotifications: true,
    }),
  };
}
