/**
 * Brand Constants — single source of truth for the chobii.art identity.
 *
 * Every user-facing surface (web titles/meta, email senders, SMS templates,
 * JSON-LD) reads from here; a future rebrand should only touch this file.
 */

export const BRAND_NAME = 'chobii.art';
export const BRAND_DOMAIN = 'chobii.art';
export const BRAND_URL = 'https://chobii.art';

/** Staging environment under the *.xtoms.xyz wildcard tunnel. */
export const STAGING_HOSTNAME = 'chobii.xtoms.xyz';
export const STAGING_URL = 'https://chobii.xtoms.xyz';

export const SUPPORT_EMAIL = 'support@chobii.art';
export const NOTIFICATIONS_EMAIL = 'notifications@chobii.art';
export const EMAIL_FROM = `${BRAND_NAME} <${NOTIFICATIONS_EMAIL}>`;

export const BRAND_TAGLINE = 'Premium Posters & Frames';
