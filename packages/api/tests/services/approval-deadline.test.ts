/**
 * Tests for Approval Deadline Checker Service
 *
 * This test suite validates the deadline checker service functions:
 * - sendDeadlineReminders() - Sends reminder emails for approvals near deadline
 * - processExpiredApprovals() - Expires overdue approvals
 * - runDeadlineCheck() - Runs full deadline check
 *
 * @see packages/api/src/services/approval-deadline.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "../setup";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock the database module
vi.mock("../../src/database", () => ({
  db: {
    query: {
      orders: {
        findFirst: vi.fn(),
      },
      users: {
        findFirst: vi.fn(),
      },
    },
  },
}));

// Mock the approval service
vi.mock("../../src/services/approval", () => ({
  getApprovalsNearDeadline: vi.fn(),
  markReminderSent: vi.fn(),
  expireOverdueApprovals: vi.fn(),
  getApprovalById: vi.fn(),
}));

// Mock email service
vi.mock("../../src/services/email", () => ({
  sendEmail: vi.fn(() => Promise.resolve({ success: true, messageId: "msg_123" })),
}));

// Mock email templates
vi.mock("../../src/services/email-templates", () => ({
  getApprovalDeadlineReminderTemplate: vi.fn(() => ({
    subject: "Reminder: Review Photos",
    html: "<p>Reminder</p>",
    text: "Reminder",
  })),
}));

// Mock users schema for dynamic import
vi.mock("../../src/database/schema/users", () => ({
  users: {
    id: { name: "id" },
  },
}));

// Import after mocking
import { db } from "../../src/database";
import {
  getApprovalsNearDeadline,
  markReminderSent,
  expireOverdueApprovals,
  getApprovalById,
} from "../../src/services/approval";
import { sendEmail } from "../../src/services/email";
import {
  sendDeadlineReminders,
  processExpiredApprovals,
  runDeadlineCheck,
} from "../../src/services/approval-deadline";

// ============================================================================
// Test Data
// ============================================================================

const mockApproval = {
  id: "approval-123",
  orderId: "order-123",
  orderItemId: "item-123",
  status: "pending_approval",
  approvalToken: "apv_abc123def456",
  deadlineAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours from now
  reminderSentAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockApprovalWithDetails = {
  ...mockApproval,
  photos: [
    {
      id: "photo-1",
      url: "https://example.com/photo.jpg",
      thumbnailUrl: "https://example.com/thumb.jpg",
    },
  ],
  comments: [],
  order: { id: "order-123", orderNumber: "MA-2024-001", status: "processing" },
  orderItem: {
    id: "item-123",
    snapshot: { title: "Custom Poster", sizeLabel: "18x24" },
  },
};

const mockOrder = {
  id: "order-123",
  orderNumber: "MA-2024-001",
  userId: "user-123",
  guestEmail: null,
  shippingAddress: { fullName: "John Doe" },
};

const mockUser = {
  id: "user-123",
  email: "john@example.com",
};

// ============================================================================
// Tests
// ============================================================================

describe("Approval Deadline Checker Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("sendDeadlineReminders", () => {
    it("should send reminders for approvals near deadline", async () => {
      vi.mocked(getApprovalsNearDeadline).mockResolvedValue([mockApproval as any]);
      vi.mocked(getApprovalById).mockResolvedValue(mockApprovalWithDetails as any);
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(mockOrder as any);
      vi.mocked(db.query.users.findFirst).mockResolvedValue(mockUser as any);
      vi.mocked(sendEmail).mockResolvedValue({ success: true, messageId: "msg_123" });
      vi.mocked(markReminderSent).mockResolvedValue(true);

      const result = await sendDeadlineReminders();

      expect(result.sent).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(sendEmail).toHaveBeenCalled();
      expect(markReminderSent).toHaveBeenCalledWith("approval-123");
    });

    it("should handle no approvals near deadline", async () => {
      vi.mocked(getApprovalsNearDeadline).mockResolvedValue([]);

      const result = await sendDeadlineReminders();

      expect(result.sent).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("should use guest email if no user", async () => {
      const guestOrder = {
        ...mockOrder,
        userId: null,
        guestEmail: "guest@example.com",
      };

      vi.mocked(getApprovalsNearDeadline).mockResolvedValue([mockApproval as any]);
      vi.mocked(getApprovalById).mockResolvedValue(mockApprovalWithDetails as any);
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(guestOrder as any);
      vi.mocked(sendEmail).mockResolvedValue({ success: true, messageId: "msg_123" });
      vi.mocked(markReminderSent).mockResolvedValue(true);

      const result = await sendDeadlineReminders();

      expect(result.sent).toBe(1);
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "guest@example.com",
        })
      );
    });

    it("should handle email send failure", async () => {
      vi.mocked(getApprovalsNearDeadline).mockResolvedValue([mockApproval as any]);
      vi.mocked(getApprovalById).mockResolvedValue(mockApprovalWithDetails as any);
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(mockOrder as any);
      vi.mocked(db.query.users.findFirst).mockResolvedValue(mockUser as any);
      vi.mocked(sendEmail).mockResolvedValue({
        success: false,
        error: "Failed to send",
      });

      const result = await sendDeadlineReminders();

      expect(result.sent).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Failed to send");
      expect(markReminderSent).not.toHaveBeenCalled();
    });

    it("should record error when approval not found", async () => {
      vi.mocked(getApprovalsNearDeadline).mockResolvedValue([mockApproval as any]);
      vi.mocked(getApprovalById).mockResolvedValue(null);

      const result = await sendDeadlineReminders();

      expect(result.sent).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Could not fetch approval");
    });

    it("should record error when order not found", async () => {
      vi.mocked(getApprovalsNearDeadline).mockResolvedValue([mockApproval as any]);
      vi.mocked(getApprovalById).mockResolvedValue(mockApprovalWithDetails as any);
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(null);

      const result = await sendDeadlineReminders();

      expect(result.sent).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Could not find order");
    });
  });

  describe("processExpiredApprovals", () => {
    it("should expire overdue approvals", async () => {
      vi.mocked(expireOverdueApprovals).mockResolvedValue(3);

      const result = await processExpiredApprovals();

      expect(result.expired).toBe(3);
      expect(result.errors).toHaveLength(0);
      expect(expireOverdueApprovals).toHaveBeenCalled();
    });

    it("should handle no approvals to expire", async () => {
      vi.mocked(expireOverdueApprovals).mockResolvedValue(0);

      const result = await processExpiredApprovals();

      expect(result.expired).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(expireOverdueApprovals).mockRejectedValue(new Error("Database error"));

      const result = await processExpiredApprovals();

      expect(result.expired).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Database error");
    });
  });

  describe("runDeadlineCheck", () => {
    it("should run both reminders and expirations", async () => {
      vi.mocked(getApprovalsNearDeadline).mockResolvedValue([mockApproval as any]);
      vi.mocked(getApprovalById).mockResolvedValue(mockApprovalWithDetails as any);
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(mockOrder as any);
      vi.mocked(db.query.users.findFirst).mockResolvedValue(mockUser as any);
      vi.mocked(sendEmail).mockResolvedValue({ success: true, messageId: "msg_123" });
      vi.mocked(markReminderSent).mockResolvedValue(true);
      vi.mocked(expireOverdueApprovals).mockResolvedValue(2);

      const result = await runDeadlineCheck();

      expect(result.remindersSent).toBe(1);
      expect(result.approvalsExpired).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it("should aggregate errors from both operations", async () => {
      vi.mocked(getApprovalsNearDeadline).mockResolvedValue([mockApproval as any]);
      vi.mocked(getApprovalById).mockResolvedValue(null);
      vi.mocked(expireOverdueApprovals).mockRejectedValue(new Error("Expire error"));

      const result = await runDeadlineCheck();

      expect(result.remindersSent).toBe(0);
      expect(result.approvalsExpired).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
