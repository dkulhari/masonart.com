/**
 * Brand Constants Tests
 *
 * Verifies the chobii.art brand identity constants — the single source of
 * truth used by web titles/meta, email senders, and SMS templates.
 */

import { describe, it, expect } from 'vitest';
import {
  BRAND_NAME,
  BRAND_DOMAIN,
  BRAND_URL,
  STAGING_HOSTNAME,
  STAGING_URL,
  SUPPORT_EMAIL,
  NOTIFICATIONS_EMAIL,
  EMAIL_FROM,
  BRAND_TAGLINE,
} from '../../src/constants/brand.js';
import * as constants from '../../src/constants/index.js';

describe('brand constants', () => {
  it('exposes the chobii.art identity', () => {
    expect(BRAND_NAME).toBe('chobii.art');
    expect(BRAND_DOMAIN).toBe('chobii.art');
    expect(BRAND_URL).toBe('https://chobii.art');
    expect(STAGING_HOSTNAME).toBe('chobii.xtoms.xyz');
    expect(STAGING_URL).toBe('https://chobii.xtoms.xyz');
    expect(SUPPORT_EMAIL).toBe('support@chobii.art');
    expect(NOTIFICATIONS_EMAIL).toBe('notifications@chobii.art');
    expect(BRAND_TAGLINE).toBe('Premium Posters & Frames');
  });

  it('formats the default email sender from the brand identity', () => {
    expect(EMAIL_FROM).toBe('chobii.art <notifications@chobii.art>');
  });

  it('is re-exported from the constants barrel', () => {
    expect(constants.BRAND_NAME).toBe('chobii.art');
    expect(constants.BRAND_URL).toBe('https://chobii.art');
  });
});
