/**
 * Session Cookie Builder Tests
 *
 * The phone-auth flow creates Better Auth sessions manually, so its cookie
 * must match Better Auth's exact format or get-session silently ignores it:
 * - name gets the __Secure- prefix on secure (HTTPS) deployments
 * - value is `<token>.<url-encoded base64 HMAC-SHA256(secret, token)>`
 */

import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { buildSessionCookie } from "../../src/lib/session-cookie";

const TOKEN = "eRRcVeAVQBprpI7Q3dZPXsmEwUrNJVFZ";
const SECRET = "test-secret";

function expectedSignature(): string {
  return encodeURIComponent(
    createHmac("sha256", SECRET).update(TOKEN).digest("base64")
  );
}

describe("buildSessionCookie", () => {
  it("uses the __Secure- prefixed name and signed value on secure deployments", () => {
    const cookie = buildSessionCookie(TOKEN, { secure: true, secret: SECRET });
    expect(cookie).toContain(
      `__Secure-chobii.session_token=${TOKEN}.${expectedSignature()}`
    );
    expect(cookie).toContain("Secure;");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  it("uses the unprefixed name but still signs the value on non-secure deployments", () => {
    const cookie = buildSessionCookie(TOKEN, { secure: false, secret: SECRET });
    expect(cookie).toContain(
      `chobii.session_token=${TOKEN}.${expectedSignature()}`
    );
    expect(cookie).not.toContain("__Secure-");
    expect(cookie).not.toContain("Secure;");
  });

  it("matches a real Better Auth signature", () => {
    // Captured from a live Better Auth sign-in: token above signed with this
    // secret must produce this exact signature (regression anchor for the format)
    const cookie = buildSessionCookie(TOKEN, {
      secure: true,
      secret: "dev-secret-change-in-production",
    });
    expect(cookie).toContain(
      `${TOKEN}.${encodeURIComponent("EBqs75Sy3S5Pbn3BJzQUrUa/+BSWUKIp+URFtD5yGi8=")}`
    );
  });
});
