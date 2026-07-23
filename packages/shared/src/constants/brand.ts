/**
 * Brand Constants — single source of truth for the chobi.art identity.
 *
 * Every user-facing surface (web titles/meta, email senders, SMS templates,
 * JSON-LD) reads from here; a future rebrand should only touch this file.
 */

export const BRAND_NAME = 'chobi.art';
export const BRAND_DOMAIN = 'chobi.art';
export const BRAND_URL = 'https://chobi.art';

/** Staging environment under the *.xtoms.xyz wildcard tunnel. */
export const STAGING_HOSTNAME = 'chobi.xtoms.xyz';
export const STAGING_URL = 'https://chobi.xtoms.xyz';

export const SUPPORT_EMAIL = 'support@chobi.art';
export const NOTIFICATIONS_EMAIL = 'notifications@chobi.art';
export const EMAIL_FROM = `${BRAND_NAME} <${NOTIFICATIONS_EMAIL}>`;

export const BRAND_TAGLINE = 'Premium Posters & Frames';
