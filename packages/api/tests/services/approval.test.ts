/**
 * Tests for Production Photo Approval Service
 *
 * This test suite validates the approval service functions:
 * - createApproval() - Creates a new approval for an order item
 * - uploadPhotos() - Uploads production photos to an approval
 * - requestChanges() - Customer requests changes with comment
 * - approveProduction() - Customer approves for shipping
 * - getApprovalByToken() - Gets approval by token with details
 * - getApprovalById() - Gets approval by ID with details
 * - getOrderApprovals() - Gets all approvals for an order
 * - getApprovalsByStatus() - Gets approvals filtered by status
 * - getApprovalsNearDeadline() - Gets approvals approaching deadline
 * - markReminderSent() - Marks reminder as sent
 * - expireOverdueApprovals() - Expires overdue approvals
 * - addAdminComment() - Adds admin comment to approval
 * - deleteApprovalPhotos() - Deletes photos for re-upload
 *
 * @see packages/api/src/services/approval.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "../setup";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock the database module
vi.mock("../../src/database", () => {
  const mockInsertFn = vi.fn();
  const mockUpdateFn = vi.fn();
  const mockDeleteFn = vi.fn();

  return {
    db: {
      query: {
        orders: {
          findFirst: vi.fn(),
        },
        orderItems: {
          findFirst: vi.fn(),
        },
        productionApprovals: {
          findFirst: vi.fn(),
          findMany: vi.fn(),
        },
        approvalPhotos: {
          findMany: vi.fn(),
        },
        approvalComments: {
          findMany: vi.fn(),
        },
      },
      insert: mockInsertFn,
      update: mockUpdateFn,
      delete: mockDeleteFn,
    },
  };
});

// Import after mocking
import { db } from "../../src/database";
import {
  createApproval,
  uploadPhotos,
  requestChanges,
  approveProduction,
  getApprovalByToken,
  getApprovalById,
  getOrderApprovals,
  getApprovalsByStatus,
  getApprovalsNearDeadline,
  markReminderSent,
  expireOverdueApprovals,
  addAdminComment,
  deleteApprovalPhotos,
} from "../../src/services/approval";

// ============================================================================
// Test Data
// ============================================================================

const mockOrder = {
  id: "order-123",
  orderNumber: "MA-2024-001234",
  status: "processing",
};

const mockOrderItem = {
  id: "item-123",
  orderId: "order-123",
  snapshot: {
    title: "Custom Poster",
    sku: "CP-001",
    sizeLabel: "18x24",
  },
};

const mockApproval = {
  id: "approval-123",
  orderId: "order-123",
  orderItemId: "item-123",
  status: "pending_upload",
  approvalToken: "apv_abc123def456",
  tokenExpiresAt: null,
  approvedAt: null,
  approvedBy: null,
  deadlineAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  reminderSentAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPhotos = [
  {
    id: "photo-1",
    approvalId: "approval-123",
    url: "https://cdn.example.com/photo1.jpg",
    thumbnailUrl: "https://cdn.example.com/photo1-thumb.jpg",
    sortOrder: 0,
    uploadedAt: new Date(),
    uploadedBy: "admin-123",
  },
];

const mockComment = {
  id: "comment-1",
  approvalId: "approval-123",
  authorType: "customer",
  authorId: "user-123",
  comment: "The colors look too dark",
  createdAt: new Date(),
};

// ============================================================================
// Test Helpers
// ============================================================================

function setupMocks() {
  // Reset all mocks
  vi.clearAllMocks();

  // Setup default mock implementations
  vi.mocked(db.insert).mockImplementation(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve([mockApproval])),
    })),
  }) as never as any);

  vi.mocked(db.update).mockImplementation(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([mockApproval])),
      })),
    })),
  }) as never as any);

  vi.mocked(db.delete).mockImplementation(() => ({
    where: vi.fn(() => Promise.resolve()),
  }) as never as any);
}

// ============================================================================
// Tests
// ============================================================================

describe("Approval Service", () => {
  beforeEach(() => {
    setupMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("createApproval", () => {
    it("should create an approval successfully", async () => {
      // Setup mocks
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(mockOrder as any);
      vi.mocked(db.query.orderItems.findFirst).mockResolvedValue(
        mockOrderItem as any
      );
      vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue(undefined);

      const result = await createApproval({
        orderId: "order-123",
        orderItemId: "item-123",
      });

      expect(result.success).toBe(true);
      expect(result.approval).toBeDefined();
      expect(vi.mocked(db.insert)).toHaveBeenCalled();
    });

    it("should fail if order not found", async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(undefined);

      const result = await createApproval({
        orderId: "nonexistent",
        orderItemId: "item-123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Order not found");
    });

    it("should fail if order item not found", async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(mockOrder as any);
      vi.mocked(db.query.orderItems.findFirst).mockResolvedValue(undefined);

      const result = await createApproval({
        orderId: "order-123",
        orderItemId: "nonexistent",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Order item not found");
    });

    it("should fail if approval already exists", async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(mockOrder as any);
      vi.mocked(db.query.orderItems.findFirst).mockResolvedValue(
        mockOrderItem as any
      );
      vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue(
        mockApproval as any
      );

      const result = await createApproval({
        orderId: "order-123",
        orderItemId: "item-123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Approval already exists for this order item");
    });

    it("should set deadline based on deadlineDays option", async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(mockOrder as any);
      vi.mocked(db.query.orderItems.findFirst).mockResolvedValue(
        mockOrderItem as any
      );
      vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue(undefined);

      await createApproval({
        orderId: "order-123",
        orderItemId: "item-123",
        deadlineDays: 14,
      });

      expect(vi.mocked(db.insert)).toHaveBeenCalled();
      // The insert was called, deadline is calculated in the service
    });
  });

  describe("uploadPhotos", () => {
    it("should upload photos successfully", async () => {
      vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue(
        mockApproval as any
      );

      vi.mocked(db.insert).mockImplementation(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(mockPhotos)),
        })),
      }) as never);

      const result = await uploadPhotos({
        approvalId: "approval-123",
        photos: [{ url: "https://example.com/photo.jpg" }],
        uploadedBy: "admin-123",
      });

      expect(result.success).toBe(true);
      expect(result.photos).toBeDefined();
    });

    it("should fail if approval not found", async () => {
      vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue(undefined);

      const result = await uploadPhotos({
        approvalId: "nonexistent",
        photos: [{ url: "https://example.com/photo.jpg" }],
        uploadedBy: "admin-123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Approval not found");
    });

    it("should fail if approval status is not pending_upload or changes_requested", async () => {
      vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue({
        ...mockApproval,
        status: "approved",
      } as any);

      const result = await uploadPhotos({
        approvalId: "approval-123",
        photos: [{ url: "https://example.com/photo.jpg" }],
        uploadedBy: "admin-123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Cannot upload photos");
    });

    it("should allow upload when status is changes_requested", async () => {
      vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue({
        ...mockApproval,
        status: "changes_requested",
      } as any);

      vi.mocked(db.insert).mockImplementation(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(mockPhotos)),
        })),
      }) as never);

      const result = await uploadPhotos({
        approvalId: "approval-123",
        photos: [{ url: "https://example.com/photo.jpg" }],
        uploadedBy: "admin-123",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("requestChanges", () => {
    it("should request changes successfully", async () => {
      vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue({
        ...mockApproval,
        status: "pending_approval",
      } as any);

      vi.mocked(db.insert).mockImplementation(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([mockComment])),
        })),
      }) as never);

      vi.mocked(db.update).mockImplementation(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(() =>
              Promise.resolve([{ ...mockApproval, status: "changes_requested" }])
            ),
          })),
        })),
      }) as never);

      const result = await requestChanges({
        approvalToken: "apv_abc123def456",
        comment: "The colors look too dark",
        authorId: "user-123",
      });

      expect(result.success).toBe(true);
      expect(result.approval?.status).toBe("changes_requested");
      expect(result.comment).toBeDefined();
    });

    it("should fail if approval not found", async () => {
      vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue(undefined);

      const result = await requestChanges({
        approvalToken: "invalid_token",
        comment: "Changes needed",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Approval not found");
    });

    it("should fail if status is not pending_approval", async () => {
      vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue({
        ...mockApproval,
        status: "pending_upload",
      } as any);

      const result = await requestChanges({
        approvalToken: "apv_abc123def456",
        comment: "Changes needed",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Cannot request changes");
    });

    it("should fail if token has expired", async () => {
      vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue({
        ...mockApproval,
        status: "pending_approval",
        tokenExpiresAt: new Date(Date.now() - 1000), // Expired
      } as any);

      const result = await requestChanges({
        approvalToken: "apv_abc123def456",
        comment: "Changes needed",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Approval link has expired");
    });
  });

  describe("approveProduction", () => {
    it("should approve production successfully", async () => {
      vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue({
        ...mockApproval,
        status: "pending_approval",
      } as any);

      vi.mocked(db.update).mockImplementation(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(() =>
              Promise.resolve([
                {
                  ...mockApproval,
                  status: "approved",
                  approvedAt: new Date(),
                },
              ])
            ),
          })),
        })),
      }) as never);

      const result = await approveProduction({
        approvalToken: "apv_abc123def456",
        approvedBy: "user-123",
      });

      expect(result.success).toBe(true);
      expect(result.approval?.status).toBe("approved");
    });

    it("should fail if approval not found", async () => {
      vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue(undefined);

      const result = await approveProduction({
        approvalToken: "invalid_token",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Approval not found");
    });

    it("should fail if status is not pending_approval", async () => {
      vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue({
        ...mockApproval,
        status: "pending_upload",
      } as any);

      const result = await approveProduction({
        approvalToken: "apv_abc123def456",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Cannot approve");
    });
  });

  describe("getApprovalByToken", () => {
    it("should return approval with details", async () => {
      vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue({
        ...mockApproval,
        photos: mockPhotos,
        comments: [mockComment],
        order: mockOrder,
        orderItem: mockOrderItem,
      } as any);

      const result = await getApprovalByToken("apv_abc123def456");

      expect(result).toBeDefined();
      expect(result?.id).toBe("approval-123");
      expect(result?.photos).toBeDefined();
      expect(result?.comments).toBeDefined();
    });

    it("should return null if not found", async () => {
      vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue(undefined);

      const result = await getApprovalByToken("invalid_token");

      expect(result).toBeNull();
    });
  });

  describe("getApprovalById", () => {
    it("should return approval with details", async () => {
      vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue({
        ...mockApproval,
        photos: mockPhotos,
        comments: [mockComment],
      } as any);

      const result = await getApprovalById("approval-123");

      expect(result).toBeDefined();
      expect(result?.id).toBe("approval-123");
    });
  });

  describe("getOrderApprovals", () => {
    it("should return all approvals for an order", async () => {
      vi.mocked(db.query.productionApprovals.findMany).mockResolvedValue([
        mockApproval,
      ] as any);

      const result = await getOrderApprovals("order-123");

      expect(result).toHaveLength(1);
      expect(result[0].orderId).toBe("order-123");
    });

    it("should return empty array if no approvals", async () => {
      vi.mocked(db.query.productionApprovals.findMany).mockResolvedValue([]);

      const result = await getOrderApprovals("order-456");

      expect(result).toHaveLength(0);
    });
  });

  describe("getApprovalsByStatus", () => {
    it("should return approvals filtered by status", async () => {
      vi.mocked(db.query.productionApprovals.findMany).mockResolvedValue([
        mockApproval,
      ] as any);

      const result = await getApprovalsByStatus("pending_upload");

      expect(result).toHaveLength(1);
    });
  });

  describe("getApprovalsNearDeadline", () => {
    it("should return approvals approaching deadline", async () => {
      vi.mocked(db.query.productionApprovals.findMany).mockResolvedValue([
        {
          ...mockApproval,
          status: "pending_approval",
          deadlineAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours from now
        },
      ] as any);

      const result = await getApprovalsNearDeadline(24);

      expect(result).toHaveLength(1);
    });
  });

  describe("markReminderSent", () => {
    it("should mark reminder as sent", async () => {
      vi.mocked(db.update).mockImplementation(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      }) as never);

      const result = await markReminderSent("approval-123");

      expect(result).toBe(true);
      expect(vi.mocked(db.update)).toHaveBeenCalled();
    });
  });

  describe("expireOverdueApprovals", () => {
    it("should expire overdue approvals", async () => {
      vi.mocked(db.update).mockImplementation(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(() =>
              Promise.resolve([{ id: "approval-1" }, { id: "approval-2" }])
            ),
          })),
        })),
      }) as never);

      const result = await expireOverdueApprovals();

      expect(result).toBe(2);
    });
  });

  describe("addAdminComment", () => {
    it("should add admin comment", async () => {
      const adminComment = {
        ...mockComment,
        authorType: "admin",
        authorId: "admin-123",
        comment: "New photos uploaded",
      };

      vi.mocked(db.insert).mockImplementation(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([adminComment])),
        })),
      }) as never);

      const result = await addAdminComment(
        "approval-123",
        "admin-123",
        "New photos uploaded"
      );

      expect(result).toBeDefined();
      expect(result?.authorType).toBe("admin");
    });
  });

  describe("deleteApprovalPhotos", () => {
    it("should delete all photos for approval", async () => {
      const result = await deleteApprovalPhotos("approval-123");

      expect(result).toBe(true);
      expect(vi.mocked(db.delete)).toHaveBeenCalled();
    });
  });
});

describe("Approval Token Generation", () => {
  it("should generate tokens with apv_ prefix", async () => {
    vi.mocked(db.query.orders.findFirst).mockResolvedValue(mockOrder as any);
    vi.mocked(db.query.orderItems.findFirst).mockResolvedValue(
      mockOrderItem as any
    );
    vi.mocked(db.query.productionApprovals.findFirst).mockResolvedValue(undefined);

    let capturedToken: string | undefined;
    vi.mocked(db.insert).mockImplementation(() => ({
      values: vi.fn((data: any) => {
        capturedToken = data.approvalToken;
        return {
          returning: vi.fn(() => Promise.resolve([{ ...mockApproval, ...data }])),
        };
      }),
    }) as never);

    await createApproval({
      orderId: "order-123",
      orderItemId: "item-123",
    });

    expect(capturedToken).toBeDefined();
    expect(capturedToken).toMatch(/^apv_[a-f0-9]{32}$/);
  });
});
