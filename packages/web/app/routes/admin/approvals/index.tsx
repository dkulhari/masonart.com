/**
 * Admin Approvals Management Page - MasonArt E-commerce Platform
 *
 * Production photo approval management dashboard with:
 * - Stats cards showing pending upload, pending approval, changes requested counts
 * - Filterable approval list with status tabs
 * - Quick actions for viewing and managing approvals
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  RefreshCw,
  AlertCircle,
  Clock,
  CheckCircle2,
  Camera,
  Calendar,
  ExternalLink,
  Package,
  Image,
  MessageSquare,
  Timer,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { getApiUrl } from "~/lib/utils";
import { StatsCard, StatsCardGrid, StatsCardSkeleton } from "~/components/admin/StatsCard";

// ============================================================================
// Route Configuration
// ============================================================================

const searchParamsSchema = z.object({
  page: z.coerce.number().positive().optional().default(1),
  pageSize: z.coerce.number().positive().max(100).optional().default(20),
  status: z
    .enum(["pending_upload", "pending_approval", "changes_requested", "approved", "expired"])
    .optional(),
  search: z.string().optional(),
});

export const Route = createFileRoute("/admin/approvals/" as any)({
  validateSearch: (search) => searchParamsSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Photo Approvals | Admin | MasonArt" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminApprovalsPage,
});

// ============================================================================
// Types
// ============================================================================

interface ApprovalPhoto {
  id: string;
  url: string;
  thumbnailUrl: string | null;
}

interface ApprovalOrder {
  id: string;
  orderNumber: string;
  status: string;
  shippingAddress: {
    fullName?: string;
  } | null;
}

interface ApprovalOrderItem {
  id: string;
  snapshot: {
    title?: string;
    sizeLabel?: string;
  } | null;
}

interface Approval {
  id: string;
  orderId: string;
  orderItemId: string;
  status: "pending_upload" | "pending_approval" | "changes_requested" | "approved" | "expired";
  approvalToken: string;
  deadlineAt: string | null;
  approvedAt: string | null;
  reminderSentAt: string | null;
  createdAt: string;
  updatedAt: string;
  order: ApprovalOrder | null;
  orderItem: ApprovalOrderItem | null;
  photos: ApprovalPhoto[];
}

interface ApprovalStats {
  byStatus: {
    pending_upload: number;
    pending_approval: number;
    changes_requested: number;
    approved: number;
    expired: number;
    total: number;
  };
  recentApproved: number;
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ============================================================================
// Status Tab Component
// ============================================================================

const statusTabs = [
  { value: undefined, label: "All", icon: Package },
  { value: "pending_upload", label: "Pending Upload", icon: Camera },
  { value: "pending_approval", label: "Pending Approval", icon: Clock },
  { value: "changes_requested", label: "Changes Requested", icon: MessageSquare },
  { value: "approved", label: "Approved", icon: CheckCircle2 },
  { value: "expired", label: "Expired", icon: Timer },
] as const;

function StatusTabs({
  currentStatus,
  onStatusChange,
  stats,
}: {
  currentStatus: string | undefined;
  onStatusChange: (status: string | undefined) => void;
  stats: ApprovalStats["byStatus"] | null;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {statusTabs.map((tab) => {
        const Icon = tab.icon;
        const count = tab.value ? stats?.[tab.value] : stats?.total;
        const isActive = currentStatus === tab.value;

        return (
          <button
            key={tab.value ?? "all"}
            onClick={() => onStatusChange(tab.value)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{tab.label}</span>
            {count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs",
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Approval Card Component
// ============================================================================

function ApprovalCard({ approval }: { approval: Approval }) {
  const statusColors: Record<string, string> = {
    pending_upload: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    pending_approval: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    changes_requested: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    expired: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  };

  const statusLabels: Record<string, string> = {
    pending_upload: "Pending Upload",
    pending_approval: "Pending Approval",
    changes_requested: "Changes Requested",
    approved: "Approved",
    expired: "Expired",
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getDeadlineStatus = () => {
    if (!approval.deadlineAt) return null;
    const deadline = new Date(approval.deadlineAt);
    const now = new Date();
    const hoursLeft = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursLeft < 0) return { text: "Expired", className: "text-red-600" };
    if (hoursLeft < 24)
      return { text: `${Math.round(hoursLeft)}h left`, className: "text-orange-600" };
    if (hoursLeft < 48) return { text: "1 day left", className: "text-yellow-600" };
    return { text: `${Math.round(hoursLeft / 24)} days left`, className: "text-gray-600" };
  };

  const deadlineStatus = getDeadlineStatus();

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-1 text-xs font-medium",
                statusColors[approval.status]
              )}
            >
              {statusLabels[approval.status]}
            </span>
            {deadlineStatus && approval.status !== "approved" && approval.status !== "expired" && (
              <span className={cn("flex items-center gap-1 text-xs", deadlineStatus.className)}>
                <Timer className="h-3 w-3" />
                {deadlineStatus.text}
              </span>
            )}
          </div>

          <div className="mt-2">
            {approval.order && (
              <a
                href={`/admin/orders/${approval.order.id}`}
                className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Order #{approval.order.orderNumber}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {approval.orderItem?.snapshot?.title && (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {approval.orderItem.snapshot.title}
                {approval.orderItem.snapshot.sizeLabel && (
                  <span className="ml-1 text-gray-500">
                    ({approval.orderItem.snapshot.sizeLabel})
                  </span>
                )}
              </p>
            )}
          </div>

          <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Created {formatDate(approval.createdAt)}
            </span>
            {approval.photos?.length > 0 && (
              <span className="flex items-center gap-1">
                <Image className="h-3 w-3" />
                {approval.photos.length} photo{approval.photos.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Photo Thumbnails */}
        {approval.photos?.length > 0 && (
          <div className="ml-4 flex -space-x-2">
            {approval.photos.slice(0, 3).map((photo, index) => (
              <div
                key={photo.id}
                className="h-12 w-12 overflow-hidden rounded-lg border-2 border-white shadow-sm dark:border-gray-800"
                style={{ zIndex: 3 - index }}
              >
                <img
                  src={photo.thumbnailUrl || photo.url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
            {approval.photos.length > 3 && (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-white bg-gray-100 text-xs font-medium text-gray-600 shadow-sm dark:border-gray-800 dark:bg-gray-700 dark:text-gray-400">
                +{approval.photos.length - 3}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
        <a
          href={`/admin/approvals/${approval.id}`}
          className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          View Details
          <ExternalLink className="h-3 w-3" />
        </a>
        {approval.status === "pending_upload" && (
          <a
            href={`/admin/approvals/${approval.id}?action=upload`}
            className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
          >
            <Camera className="h-3 w-3" />
            Upload Photos
          </a>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function AdminApprovalsPage() {
  const search = Route.useSearch() as {
    page?: number;
    pageSize?: number;
    status?: string;
    search?: string;
  };

  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [stats, setStats] = useState<ApprovalStats | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/approvals/stats`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStats(data.data);
        }
      }
    } catch (err) {
      console.error("Error fetching stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Fetch approvals
  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.page) params.set("page", String(search.page));
      if (search.pageSize) params.set("pageSize", String(search.pageSize));
      if (search.status) params.set("status", search.status);

      const response = await fetch(`${getApiUrl()}/api/admin/approvals?${params}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch approvals");
      }

      const data = await response.json();
      if (data.success) {
        setApprovals(data.data.approvals);
        setPagination(data.data.pagination);
      } else {
        throw new Error(data.error || "Failed to fetch approvals");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [search.page, search.pageSize, search.status]);

  useEffect(() => {
    fetchStats();
    fetchApprovals();
  }, [fetchStats, fetchApprovals]);

  const handleStatusChange = (status: string | undefined) => {
    const url = new URL(window.location.href);
    if (status) {
      url.searchParams.set("status", status);
    } else {
      url.searchParams.delete("status");
    }
    url.searchParams.set("page", "1");
    window.location.href = url.toString();
  };

  const handleRefresh = () => {
    fetchStats();
    fetchApprovals();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Photo Approvals</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage production photo approvals for made-to-order items
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* Stats Grid */}
        <StatsCardGrid>
          {statsLoading ? (
            <>
              <StatsCardSkeleton />
              <StatsCardSkeleton />
              <StatsCardSkeleton />
              <StatsCardSkeleton />
            </>
          ) : stats ? (
            <>
              <StatsCard
                title="Pending Upload"
                value={stats.byStatus.pending_upload}
                icon={Camera}
                trend="neutral"
                trendLabel="Awaiting photos"
              />
              <StatsCard
                title="Pending Approval"
                value={stats.byStatus.pending_approval}
                icon={Clock}
                trend="neutral"
                trendLabel="Awaiting customer"
              />
              <StatsCard
                title="Changes Requested"
                value={stats.byStatus.changes_requested}
                icon={MessageSquare}
                trend={stats.byStatus.changes_requested > 0 ? "down" : "neutral"}
                trendLabel={
                  stats.byStatus.changes_requested > 0 ? "Needs attention" : "None pending"
                }
              />
              <StatsCard
                title="Recently Approved"
                value={stats.recentApproved}
                icon={CheckCircle2}
                trend="up"
                trendLabel="Last 7 days"
              />
            </>
          ) : null}
        </StatsCardGrid>

        {/* Status Tabs */}
        <div className="mb-6 mt-8">
          <StatusTabs
            currentStatus={search.status}
            onStatusChange={handleStatusChange}
            stats={stats?.byStatus ?? null}
          />
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
            <div className="flex items-center gap-2 text-red-800 dark:text-red-400">
              <AlertCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Approvals List */}
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : approvals.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-800">
              <Package className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
                No approvals found
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {search.status
                  ? `No approvals with "${statusTabs.find((t) => t.value === search.status)?.label}" status`
                  : "No approvals in the system yet"}
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {approvals.map((approval) => (
                  <ApprovalCard key={approval.id} approval={approval} />
                ))}
              </div>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-6 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Showing {(pagination.page - 1) * pagination.pageSize + 1} to{" "}
                    {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{" "}
                    {pagination.total} approvals
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const url = new URL(window.location.href);
                        url.searchParams.set("page", String(pagination.page - 1));
                        window.location.href = url.toString();
                      }}
                      disabled={pagination.page <= 1}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => {
                        const url = new URL(window.location.href);
                        url.searchParams.set("page", String(pagination.page + 1));
                        window.location.href = url.toString();
                      }}
                      disabled={pagination.page >= pagination.totalPages}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
