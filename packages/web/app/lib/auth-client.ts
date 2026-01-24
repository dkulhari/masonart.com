/**
 * Better Auth React Client
 *
 * Provides authentication hooks and methods for the MasonArt frontend.
 * Uses the official Better Auth React client for type-safe auth operations.
 *
 * @see https://better-auth.com/docs/installation
 */

import { createAuthClient } from "better-auth/react";
import { getApiUrl } from "./utils";

/**
 * Create the Better Auth client
 *
 * The baseURL points to the API server where Better Auth is configured.
 * In development, this is typically http://localhost:3000
 */
export const authClient = createAuthClient({
  baseURL: getApiUrl(),
  fetchOptions: {
    credentials: "include", // Required for sending cookies cross-origin
  },
});

/**
 * Export commonly used auth methods and hooks
 */
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
} = authClient;

/**
 * Type exports for session and user
 */
export type Session = typeof authClient.$Infer.Session;
export type User = Session["user"];
