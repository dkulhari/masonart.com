/**
 * Session Cookie Builder
 *
 * The phone-auth flow inserts Better Auth sessions directly into the DB and
 * must emit a cookie Better Auth's get-session will actually accept:
 * - Better Auth signs the cookie value: `<token>.<base64 HMAC-SHA256(secret, token)>`
 *   (URL-encoded); an unsigned raw token fails signature validation silently.
 * - On secure (HTTPS) deployments Better Auth prefixes the name with __Secure-.
 */

import { createHmac } from "crypto";

const SESSION_COOKIE_BASE = "chobii.session_token";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days, matches session expiresAt

export interface SessionCookieOptions {
  secure: boolean;
  secret: string;
}

export function signSessionToken(token: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return `${token}.${encodeURIComponent(signature)}`;
}

export function buildSessionCookie(
  token: string,
  { secure, secret }: SessionCookieOptions
): string {
  const name = secure ? `__Secure-${SESSION_COOKIE_BASE}` : SESSION_COOKIE_BASE;
  const value = signSessionToken(token, secret);
  return `${name}=${value}; Path=/; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}
