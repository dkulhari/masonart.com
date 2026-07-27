/**
 * Auth email templates escape user-controlled values (#342 security review)
 */
import { describe, it, expect } from 'vitest';
import {
  getVerificationEmailTemplate,
  getPasswordResetTemplate,
} from '../../src/services/email-templates';

const XSS_NAME = `<img src=x onerror=alert(1)>O'Brien & "Sons"`;
const URL = 'https://chobii.art/api/auth/verify-email?token=abc';

describe('auth email templates', () => {
  it.each([
    ['verification', getVerificationEmailTemplate],
    ['reset', getPasswordResetTemplate],
  ])('%s template escapes user-controlled name', (_label, fn) => {
    const { html } = fn({ name: XSS_NAME, url: URL });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(html).toContain('O&#39;Brien &amp; &quot;Sons&quot;');
  });

  it('keeps the action URL intact as a link target', () => {
    const { html } = getVerificationEmailTemplate({ name: 'A', url: URL });
    expect(html).toContain('href="https://chobii.art/api/auth/verify-email?token=abc"');
  });
});
