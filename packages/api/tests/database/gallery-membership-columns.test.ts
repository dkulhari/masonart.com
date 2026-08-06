/**
 * Gallery membership columns.
 *
 * Membership is a deliberate join, not "has an account" — so the flag defaults
 * to false for everyone, including accounts that predate the migration.
 */

import { describe, it, expect } from 'vitest';
import { users } from '../../src/database/schema/users';
import { auth } from '../../src/auth';

describe('gallery membership columns', () => {
  it('carries the membership flag', () => {
    expect(users.galleryMember).toBeDefined();
  });

  it('defaults to false — no existing customer is silently enrolled', () => {
    expect(users.galleryMember.default).toBe(false);
  });

  it('records when they joined', () => {
    expect(users.galleryJoinedAt).toBeDefined();
    expect(users.galleryJoinedAt.notNull).toBe(false);
  });

  it('stores consent as a timestamp, not a boolean', () => {
    expect(users.marketingConsentAt).toBeDefined();
    expect(users.marketingConsentAt.columnType).toBe(
      users.galleryJoinedAt.columnType
    );
  });

  it('records where the join came from', () => {
    expect(users.joinSource).toBeDefined();
  });
});

describe('session payload', () => {
  it('declares galleryMember as an auth additional field', () => {
    // Without this the flag never reaches the session and every surface needs
    // a second request to learn whether the viewer is a member.
    const fields = (
      auth.options.user as { additionalFields: Record<string, unknown> }
    ).additionalFields;
    expect(fields.galleryMember).toBeDefined();
  });
});
