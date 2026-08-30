/**
 * Tests for Approval Integration with Orders
 *
 * This test suite validates the integration between approvals and orders:
 * - createApprovalsForOrder() - Creates approvals for made-to-order items
 * - hasOrderPendingApprovals() - Checks for pending approvals
 * - areOrderApprovalsComplete() - Checks if all approvals are complete
 *
 * @see packages/api/src/services/approval.ts
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
      orderItems: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      productionApprovals: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
  },
}));

// Import after mocking
import { db } from "../../src/database";
import {
  createApprovalsForOrder,
  hasOrderPendingApprovals,
  areOrderApprovalsComplete,
} from "../../src/services/approval";

// ============================================================================
// Test Data
// ============================================================================

const mockOrderId = "order-123";

const mockAiGeneratedItem = {
  id: "item-1",
  orderId: mockOrderId,
  isAiGenerated: true,
  snapshot: { title: "Custom AI Poster" },
};


const mockApproval = {
  id: "approval-123",
  orderId: mockOrderId,
  orderItemId: "item-1",
  status: "pending_upload",
  approvalToken: "apv_abc123def456",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ============================================================================
// Tests
// ============================================================================

describe("Approval Order Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("createApprovalsForOrder", () => {
    it("should create approvals for AI-generated items only", async () => {
      // Setup mocks - createApproval internally verifies order and order item exist
      vi.mocked(db.query.orderItems.findMany).mockResolvedValue([
        mockAiGeneratedItem as any,
      ]);
      // First call checks for existing approval in createApprovalsForOrder
      // Second call is in createApproval to check if order item belongs to order
      vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue(undefined);
      vi.mocked(db.query.orders.findFirst).mockResolvedValue({ id: mockOrderId } as any);
      vi.mocked(db.query.orderItems.findFirst).mockResolvedValue(mockAiGeneratedItem as any);
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockApproval]),
        }),
      } as any);

      const result = await createApprovalsForOrder(mockOrderId);

      expect(result.success).toBe(true);
      expect(result.approvals).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(db.query.orderItems.findMany).toHaveBeenCalled();
    });

    it("should skip items that already have approvals", async () => {
      vi.mocked(db.query.orderItems.findMany).mockResolvedValue([
        mockAiGeneratedItem as any,
      ]);
      vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue(
        mockApproval as any
      );

      const result = await createApprovalsForOrder(mockOrderId);

      expect(result.success).toBe(true);
      expect(result.approvals).toHaveLength(1); // Returns existing approval
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("should return empty approvals when no made-to-order items", async () => {
      vi.mocked(db.query.orderItems.findMany).mockResolvedValue([]);

      const result = await createApprovalsForOrder(mockOrderId);

      expect(result.success).toBe(true);
      expect(result.approvals).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle database errors gracefully", async () => {
      vi.mocked(db.query.orderItems.findMany).mockRejectedValue(
        new Error("Database error")
      );

      const result = await createApprovalsForOrder(mockOrderId);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("hasOrderPendingApprovals", () => {
    it("should return true when pending_upload approvals exist", async () => {
      vi.mocked(db.query.productionApprovals.findMany).mockResolvedValue([
        { ...mockApproval, status: "pending_upload" } as any,
      ]);

      const result = await hasOrderPendingApprovals(mockOrderId);

      expect(result).toBe(true);
    });

    it("should return true when pending_approval approvals exist", async () => {
      vi.mocked(db.query.productionApprovals.findMany).mockResolvedValue([
        { ...mockApproval, status: "pending_approval" } as any,
      ]);

      const result = await hasOrderPendingApprovals(mockOrderId);

      expect(result).toBe(true);
    });

    it("should return true when changes_requested approvals exist", async () => {
      vi.mocked(db.query.productionApprovals.findMany).mockResolvedValue([
        { ...mockApproval, status: "changes_requested" } as any,
      ]);

      const result = await hasOrderPendingApprovals(mockOrderId);

      expect(result).toBe(true);
    });

    it("should return false when all approvals are approved", async () => {
      vi.mocked(db.query.productionApprovals.findMany).mockResolvedValue([
        { ...mockApproval, status: "approved" } as any,
      ]);

      const result = await hasOrderPendingApprovals(mockOrderId);

      expect(result).toBe(false);
    });

    it("should return false when no approvals exist", async () => {
      vi.mocked(db.query.productionApprovals.findMany).mockResolvedValue([]);

      const result = await hasOrderPendingApprovals(mockOrderId);

      expect(result).toBe(false);
    });
  });

  describe("areOrderApprovalsComplete", () => {
    it("should return true when all approvals are approved", async () => {
      vi.mocked(db.query.productionApprovals.findMany).mockResolvedValue([
        { ...mockApproval, status: "approved" } as any,
      ]);

      const result = await areOrderApprovalsComplete(mockOrderId);

      expect(result).toBe(true);
    });

    it("should return true when all approvals are expired", async () => {
      vi.mocked(db.query.productionApprovals.findMany).mockResolvedValue([
        { ...mockApproval, status: "expired" } as any,
      ]);

      const result = await areOrderApprovalsComplete(mockOrderId);

      expect(result).toBe(true);
    });

    it("should return true when no approvals exist", async () => {
      vi.mocked(db.query.productionApprovals.findMany).mockResolvedValue([]);

      const result = await areOrderApprovalsComplete(mockOrderId);

      expect(result).toBe(true);
    });

    it("should return false when pending_upload approvals exist", async () => {
      vi.mocked(db.query.productionApprovals.findMany).mockResolvedValue([
        { ...mockApproval, status: "pending_upload" } as any,
      ]);

      const result = await areOrderApprovalsComplete(mockOrderId);

      expect(result).toBe(false);
    });

    it("should return false when any approval is not complete", async () => {
      vi.mocked(db.query.productionApprovals.findMany).mockResolvedValue([
        { ...mockApproval, status: "approved" } as any,
        { ...mockApproval, id: "approval-456", status: "pending_approval" } as any,
      ]);

      const result = await areOrderApprovalsComplete(mockOrderId);

      expect(result).toBe(false);
    });
  });
});
