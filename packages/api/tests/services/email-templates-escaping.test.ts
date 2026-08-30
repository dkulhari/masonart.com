/**
 * Order/approval/AI email templates escape user-controlled values (#343)
 *
 * Same class as the auth-template fix (commit 87a8e456): names, address
 * fields, and AI prompt text are customer-supplied and must not inject
 * markup into email HTML. Plain-text variants must stay unescaped.
 */

import { describe, it, expect } from 'vitest';
import type { Order } from '../../src/database/schema/orders';
import {
  getOrderConfirmationTemplate,
  getShippedTemplate,
  getOutForDeliveryTemplate,
  getDeliveredTemplate,
  getPhotoReadyForReviewTemplate,
  getChangesRequestedResponseTemplate,
  getApprovalConfirmedTemplate,
  getApprovalDeadlineReminderTemplate,
  getAIGenerationApprovedTemplate,
  getAIGenerationRejectedTemplate,
} from '../../src/services/email-templates';

const XSS = `<img src=x onerror=alert(1)>`;
const XSS_NAME = `${XSS}O'Brien`;

function mockOrder(): Order {
  return {
    orderNumber: 'ORD-1001',
    createdAt: new Date('2026-07-01'),
    itemCount: 1,
    total: '1999.00',
    shippingAddress: {
      fullName: XSS_NAME,
      addressLine1: `12 ${XSS} Lane`,
      city: 'Mumbai',
      state: 'MH',
      postalCode: '400001',
    },
    shippingDetails: {
      carrier: 'BlueDart',
      trackingNumber: 'TRK123',
      trackingUrl: 'https://example.com/track',
    },
  } as unknown as Order;
}

function mockApprovalContext() {
  return {
    approval: { deadlineAt: new Date('2026-07-10') },
    order: {
      orderNumber: 'ORD-1001',
      shippingAddress: { fullName: XSS_NAME },
    },
    orderItem: { snapshot: { title: `Poster ${XSS}`, sizeLabel: '12x16' } },
    photos: [],
    approvalUrl: 'https://chobii.art/approvals/abc',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('order templates escape shipping name/address in HTML', () => {
  it.each([
    ['confirmation', getOrderConfirmationTemplate],
    ['shipped', getShippedTemplate],
    ['out-for-delivery', getOutForDeliveryTemplate],
    ['delivered', getDeliveredTemplate],
  ])('%s', (_label, fn) => {
    const { html, text } = fn(mockOrder());
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    // Plain-text part must not be HTML-escaped
    expect(text).toContain(XSS_NAME);
  });

  it('confirmation escapes each address line (joined with <br>)', () => {
    const { html } = getOrderConfirmationTemplate(mockOrder());
    expect(html).not.toContain(`12 ${XSS} Lane`);
    expect(html).toContain('12 &lt;img');
    // The <br> joins between address parts must survive escaping
    expect(html).toMatch(/Lane<br>/);
  });
});

describe('approval templates escape customer name and product title in HTML', () => {
  it.each([
    ['photo-ready', getPhotoReadyForReviewTemplate],
    ['changes-requested', getChangesRequestedResponseTemplate],
    ['approval-confirmed', getApprovalConfirmedTemplate],
    ['deadline-reminder', getApprovalDeadlineReminderTemplate],
  ])('%s', (_label, fn) => {
    const { html } = fn(mockApprovalContext());
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});

describe('AI generation templates escape user name and prompt in HTML', () => {
  it('approved template', () => {
    const { html, text } = getAIGenerationApprovedTemplate({
      userName: XSS_NAME,
      userEmail: 'xss@example.com',
      generationId: 'gen-1',
      promptText: `sunset ${XSS} vibes`,
      stylePreset: 'oil-painting',
      imageUrl: 'https://cdn.chobii.art/x.png',
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(text).toContain(XSS_NAME);
  });

  it('rejected template escapes prompt and rejection reason', () => {
    const { html } = getAIGenerationRejectedTemplate({
      userName: XSS_NAME,
      userEmail: 'xss@example.com',
      generationId: 'gen-2',
      promptText: `sunset ${XSS} vibes`,
      stylePreset: 'oil-painting',
      rejectionReason: `bad ${XSS} content`,
      rejectionCategory: 'policy',
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});
