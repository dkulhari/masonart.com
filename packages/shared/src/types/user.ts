/**
 * User Types for chobii.art Platform
 *
 * Defines all user-related types including authentication, addresses,
 * preferences, and trade account information based on the requirements specification.
 */

// ============================================================================
// Enums & Literal Types
// ============================================================================

/**
 * User role types
 */
export type UserRole = 'customer' | 'trade' | 'content-manager' | 'admin' | 'super-admin';

/**
 * Authentication provider types
 */
export type AuthProvider =
  | 'email'
  | 'google'
  | 'facebook'
  | 'apple'
  | 'phone';

/**
 * User account status
 */
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending-verification';

/**
 * Trade program status
 */
export type TradeStatus =
  | 'none'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'suspended';

/**
 * Trade account type categories
 */
export type TradeAccountType =
  | 'interior-designer'
  | 'architect'
  | 'staging-company'
  | 'hospitality'
  | 'office-designer'
  | 'art-consultant'
  | 'other';

/**
 * Notification channel types
 */
export type NotificationChannel = 'email' | 'sms' | 'push' | 'whatsapp';

// ============================================================================
// Address Types
// ============================================================================

/**
 * Address type designation
 */
export type AddressType = 'shipping' | 'billing' | 'both';

/**
 * User address definition
 */
export interface Address {
  /** Unique identifier */
  id: string;
  /** User ID this address belongs to */
  userId: string;
  /** Address type */
  type: AddressType;
  /** Full name for shipping */
  fullName: string;
  /** Phone number */
  phone: string;
  /** Address line 1 */
  addressLine1: string;
  /** Address line 2 (optional) */
  addressLine2?: string;
  /** Landmark for easier delivery */
  landmark?: string;
  /** City */
  city: string;
  /** State/Province */
  state: string;
  /** Postal/ZIP code */
  postalCode: string;
  /** Country code (ISO 3166-1 alpha-2) */
  countryCode: string;
  /** Whether this is the default address */
  isDefault: boolean;
  /** When the address was created */
  createdAt: Date;
  /** When the address was last updated */
  updatedAt: Date;
}

/**
 * Address input for creating new address
 */
export interface AddressInput {
  type: AddressType;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
  isDefault?: boolean;
}

// ============================================================================
// Payment Method Types
// ============================================================================

/**
 * Saved payment method types
 */
export type PaymentMethodType = 'card' | 'upi' | 'netbanking' | 'wallet';

/**
 * Card brand types
 */
export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'rupay' | 'other';

/**
 * Saved payment method
 */
export interface SavedPaymentMethod {
  /** Unique identifier */
  id: string;
  /** User ID this payment method belongs to */
  userId: string;
  /** Payment method type */
  type: PaymentMethodType;
  /** Card brand (for card type) */
  cardBrand?: CardBrand;
  /** Last 4 digits of card */
  last4?: string;
  /** Card expiry month (1-12) */
  expiryMonth?: number;
  /** Card expiry year (YYYY) */
  expiryYear?: number;
  /** UPI ID (for UPI type) */
  upiId?: string;
  /** Bank name (for netbanking/wallet) */
  bankName?: string;
  /** Whether this is the default payment method */
  isDefault: boolean;
  /** Payment gateway token reference */
  gatewayToken?: string;
  /** When the payment method was created */
  createdAt: Date;
  /** When the payment method was last updated */
  updatedAt: Date;
}

// ============================================================================
// Notification Preferences Types
// ============================================================================

/**
 * Notification category types
 */
export type NotificationCategory =
  | 'order-updates'
  | 'promotions'
  | 'new-arrivals'
  | 'price-drops'
  | 'back-in-stock'
  | 'artist-updates'
  | 'ai-gallery'
  | 'review-requests';

/**
 * User notification preferences
 */
export interface NotificationPreferences {
  /** Email notifications enabled */
  email: boolean;
  /** SMS notifications enabled */
  sms: boolean;
  /** Push notifications enabled */
  push: boolean;
  /** WhatsApp notifications enabled */
  whatsapp: boolean;
  /** Enabled notification categories */
  enabledCategories: NotificationCategory[];
  /** Followed artist IDs for notifications */
  followedArtistIds: string[];
}

// ============================================================================
// Trade Account Types
// ============================================================================

/**
 * Trade program application details
 */
export interface TradeApplication {
  /** Unique identifier */
  id: string;
  /** User ID */
  userId: string;
  /** Business name */
  businessName: string;
  /** Business type */
  businessType: TradeAccountType;
  /** Business website */
  website?: string;
  /** Tax ID / GST number */
  taxId?: string;
  /** Business registration number */
  registrationNumber?: string;
  /** Portfolio/work samples URLs */
  portfolioUrls?: string[];
  /** Years in business */
  yearsInBusiness?: number;
  /** Monthly project volume estimate */
  estimatedMonthlyVolume?: string;
  /** Additional notes */
  notes?: string;
  /** Application status */
  status: TradeStatus;
  /** Discount percentage approved */
  discountPercentage?: number;
  /** Payment terms (e.g., "Net 30") */
  paymentTerms?: string;
  /** Internal reviewer notes */
  reviewerNotes?: string;
  /** When the application was submitted */
  submittedAt: Date;
  /** When the application was reviewed */
  reviewedAt?: Date;
  /** Who reviewed the application */
  reviewedBy?: string;
}

// ============================================================================
// User Types
// ============================================================================

/**
 * User profile with all details
 */
export interface User {
  /** Unique identifier */
  id: string;
  /** Email address */
  email: string;
  /** Email verified status */
  emailVerified: boolean;
  /** Phone number */
  phone?: string;
  /** Phone verified status */
  phoneVerified: boolean;
  /** Full name */
  name: string;
  /** First name */
  firstName?: string;
  /** Last name */
  lastName?: string;
  /** Profile image URL */
  avatarUrl?: string;
  /** User role */
  role: UserRole;
  /** Account status */
  status: UserStatus;
  /** Authentication provider */
  authProvider: AuthProvider;
  /** External auth provider ID */
  authProviderId?: string;
  /** User addresses */
  addresses: Address[];
  /** Default address ID */
  defaultAddressId?: string;
  /** Saved payment methods */
  paymentMethods: SavedPaymentMethod[];
  /** Default payment method ID */
  defaultPaymentMethodId?: string;
  /** Notification preferences */
  notificationPreferences: NotificationPreferences;
  /** Trade program application (if applicable) */
  tradeApplication?: TradeApplication;
  /** Wishlist product IDs */
  wishlistProductIds: string[];
  /** Number of AI generation credits remaining */
  aiCreditsRemaining: number;
  /** AI subscription tier */
  aiSubscriptionTier?: 'free' | 'premium' | 'unlimited';
  /** When the account was created */
  createdAt: Date;
  /** When the account was last updated */
  updatedAt: Date;
  /** Last login time */
  lastLoginAt?: Date;
}

/**
 * User for list display (minimal data)
 */
export interface UserListItem {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  status: UserStatus;
  tradeStatus?: TradeStatus;
  createdAt: Date;
  lastLoginAt?: Date;
}

/**
 * Public user profile (safe to expose)
 */
export interface PublicUserProfile {
  id: string;
  name: string;
  avatarUrl?: string;
  /** Number of AI creations in public gallery */
  publicAiCreationsCount?: number;
  /** When the user joined */
  memberSince: Date;
}

/**
 * User session data
 */
export interface UserSession {
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** User role */
  role: UserRole;
  /** Session expiry time */
  expiresAt: Date;
  /** IP address */
  ipAddress?: string;
  /** User agent string */
  userAgent?: string;
  /** When the session was created */
  createdAt: Date;
}

// ============================================================================
// Auth Types
// ============================================================================

/**
 * Login credentials
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Phone login credentials
 */
export interface PhoneLoginCredentials {
  phone: string;
  otp: string;
}

/**
 * Registration data
 */
export interface RegistrationData {
  email: string;
  password: string;
  name: string;
  phone?: string;
  acceptedTerms: boolean;
  subscribedToNewsletter?: boolean;
}

/**
 * Social auth data
 */
export interface SocialAuthData {
  provider: AuthProvider;
  providerId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  accessToken?: string;
}

/**
 * Auth response with tokens
 */
export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Password reset request
 */
export interface PasswordResetRequest {
  email: string;
}

/**
 * Password reset confirmation
 */
export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
}
