/**
 * User Schemas for MasonArt Platform
 *
 * Zod schemas for validating user-related data including:
 * - Users
 * - User preferences
 * - Trade accounts
 * - Sessions
 */

import { z } from 'zod';
import { AddressSchema, AddressCreateSchema } from './order';

/**
 * User role enum
 */
export const UserRoleSchema = z.enum(['admin', 'customer', 'trade']);
export type UserRole = z.infer<typeof UserRoleSchema>;

/**
 * Trade account status enum
 */
export const TradeAccountStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export type TradeAccountStatus = z.infer<typeof TradeAccountStatusSchema>;

/**
 * User Preferences Schema
 */
export const UserPreferencesSchema = z.object({
  emailNotifications: z.boolean(),
  smsNotifications: z.boolean(),
  marketingEmails: z.boolean(),
  orderUpdates: z.boolean(),
  aiGenerationNotifications: z.boolean(),
});
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

/**
 * Trade Business Schema
 */
export const TradeBusinessSchema = z.object({
  businessName: z
    .string()
    .min(2, 'Business name must be at least 2 characters')
    .max(200, 'Business name must be 200 characters or less'),
  gstNumber: z
    .string()
    .regex(
      /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/,
      'GST number must be in valid format (e.g., 29ABCDE1234F1Z5)'
    )
    .optional(),
  businessType: z
    .string()
    .min(2, 'Business type must be at least 2 characters')
    .max(100, 'Business type must be 100 characters or less'),
});
export type TradeBusiness = z.infer<typeof TradeBusinessSchema>;

/**
 * User Schema
 */
export const UserSchema = z.object({
  id: z.string().min(1, 'User ID is required'),
  email: z
    .string()
    .email('Email must be a valid email address')
    .toLowerCase()
    .max(255, 'Email must be 255 characters or less'),
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be 100 characters or less'),
  phone: z
    .string()
    .regex(
      /^\+[1-9]\d{1,14}$/,
      'Phone number must be in E.164 format with + prefix (e.g., +919876543210)'
    )
    .optional(),
  role: UserRoleSchema,
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
  avatarUrl: z.string().url('Avatar URL must be a valid URL').optional(),
  addresses: z.array(AddressSchema).max(10, 'Maximum 10 addresses allowed'),
  preferences: UserPreferencesSchema,
  tradeAccountStatus: TradeAccountStatusSchema.optional(),
  tradeBusiness: TradeBusinessSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type User = z.infer<typeof UserSchema>;

/**
 * User Create Schema (for registration)
 * Omits auto-generated fields and defaults
 */
export const UserCreateSchema = z.object({
  email: z
    .string()
    .email('Email must be a valid email address')
    .toLowerCase()
    .max(255, 'Email must be 255 characters or less'),
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be 100 characters or less'),
  phone: z
    .string()
    .regex(
      /^\+[1-9]\d{1,14}$/,
      'Phone number must be in E.164 format with + prefix (e.g., +919876543210)'
    )
    .optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be 100 characters or less')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});
export type UserCreate = z.infer<typeof UserCreateSchema>;

/**
 * User Update Schema (for updating user profile)
 * All fields are optional except id
 */
export const UserUpdateSchema = UserSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  emailVerified: true,
  phoneVerified: true,
})
  .partial()
  .extend({
    id: z.string().min(1, 'User ID is required'),
  });
export type UserUpdate = z.infer<typeof UserUpdateSchema>;

/**
 * User Profile Schema (public-facing)
 * Excludes sensitive information
 */
export const UserProfileSchema = UserSchema.omit({
  email: true,
  phone: true,
  addresses: true,
  preferences: true,
  tradeAccountStatus: true,
  tradeBusiness: true,
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

/**
 * Session Schema
 */
export const SessionSchema = z.object({
  id: z.string().min(1, 'Session ID is required'),
  userId: z.string().min(1, 'User ID is required'),
  token: z.string().min(1, 'Token is required'),
  expiresAt: z.date(),
  createdAt: z.date(),
});
export type Session = z.infer<typeof SessionSchema>;

/**
 * Login Credentials Schema
 */
export const LoginCredentialsSchema = z.object({
  email: z
    .string()
    .email('Email must be a valid email address')
    .toLowerCase()
    .max(255, 'Email must be 255 characters or less'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginCredentials = z.infer<typeof LoginCredentialsSchema>;

/**
 * Password Reset Request Schema
 */
export const PasswordResetRequestSchema = z.object({
  email: z
    .string()
    .email('Email must be a valid email address')
    .toLowerCase()
    .max(255, 'Email must be 255 characters or less'),
});
export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;

/**
 * Password Reset Schema
 */
export const PasswordResetSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be 100 characters or less')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});
export type PasswordReset = z.infer<typeof PasswordResetSchema>;

/**
 * Trade Account Application Schema
 */
export const TradeAccountApplicationSchema = z.object({
  businessName: z
    .string()
    .min(2, 'Business name must be at least 2 characters')
    .max(200, 'Business name must be 200 characters or less'),
  gstNumber: z
    .string()
    .regex(
      /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/,
      'GST number must be in valid format (e.g., 29ABCDE1234F1Z5)'
    )
    .optional(),
  businessType: z
    .string()
    .min(2, 'Business type must be at least 2 characters')
    .max(100, 'Business type must be 100 characters or less'),
  email: z.string().email('Email must be a valid email address').optional(),
  phone: z
    .string()
    .regex(
      /^\+[1-9]\d{1,14}$/,
      'Phone number must be in E.164 format with + prefix (e.g., +919876543210)'
    )
    .optional(),
  address: AddressCreateSchema.optional(),
  additionalInfo: z.string().max(1000, 'Additional info must be 1000 characters or less').optional(),
});
export type TradeAccountApplication = z.infer<typeof TradeAccountApplicationSchema>;

/**
 * User Filter Schema (for API queries)
 */
export const UserFilterSchema = z.object({
  role: UserRoleSchema.optional(),
  emailVerified: z.boolean().optional(),
  tradeAccountStatus: TradeAccountStatusSchema.optional(),
  search: z.string().optional(), // Search by name, email, phone
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});
export type UserFilter = z.infer<typeof UserFilterSchema>;
