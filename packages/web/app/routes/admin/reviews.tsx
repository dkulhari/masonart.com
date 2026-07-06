/**
 * Admin Reviews Moderation Page - MasonArt E-commerce Platform
 *
 * Review moderation dashboard with:
 * - Stats cards showing pending, approved, rejected counts
 * - Filterable review list with status, search
 * - Quick approve/reject actions
 * - Bulk moderation support
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
  RefreshCw,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  Star,
  Check,
  X,
  ExternalLink,
  User,
  MoreHorizontal,
  Search,
  Filter,
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
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  search: z.string().optional(),
  sortBy: z.enum(["newest", "oldest", "rating"]).optional().default("newest"),
});

type SearchParams = z.infer<typeof searchParamsSchema>;

export const Route = createFileRoute("/admin/reviews")({
  validateSearch: (search) => searchParamsSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Reviews | Admin | MasonArt" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminReviewsPage,
});

// ============================================================================
// Types
// ============================================================================

interface ReviewAuthor {
  id: string;
  name: string | null;
  email: string;
}

interface ReviewProduct {
  id: string;
  title: string;
  slug: string;
}

interface AdminReview {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  title: string | null;
  content: string | null;
  status: "pending" | "approved" | "rejected";
  moderatorId: string | null;
  moderatorNotes: string | null;
  createdAt: string;
  updatedAt: string;
  author: ReviewAuthor | null;
  product: ReviewProduct | null;
}

interface ReviewStats {
  pending: number;
  approved: number;
  rejected: number;
  today: number;
  averageRating: number;
  total: number;
}

interface PaginatedResponse {
  items: AdminReview[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchReviews(params: SearchParams): Promise<PaginatedResponse> {
  const queryParams = new URLSearchParams();

  queryParams.set("page", String(params.page));
  queryParams.set("pageSize", String(params.pageSize));
  queryParams.set("sortBy", params.sortBy);

  if (params.status) {
    queryParams.set("status", params.status);
  }

  if (params.search) {
    queryParams.set("search", params.search);
  }

  const response = await fetch(`${getApiUrl()}/api/admin/reviews?${queryParams.toString()}`, {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch reviews");
  }

  return response.json();
}

async function fetchReviewStats(): Promise<ReviewStats> {
  const response = await fetch(`${getApiUrl()}/api/admin/reviews/stats`, {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch review statistics");
  }

  return response.json();
}

async function moderateReview(
  reviewId: string,
  status: "approved" | "rejected",
  moderatorNotes?: string
): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/admin/reviews/${reviewId}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status, moderatorNotes }),
  });

  if (!response.ok) {
    throw new Error("Failed to moderate review");
  }
}

async function deleteReview(reviewId: string): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/admin/reviews/${reviewId}`, {
    method: "DELETE",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to delete review");
  }
}

// ============================================================================
// Component
// ============================================================================

function AdminReviewsPage() {
  const navigate = useNavigate();
  const searchParams = Route.useSearch();

  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedReviews, setSelectedReviews] = useState<Set<string>>(new Set());
  const [expandedReview, setExpandedReview] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.search || "");

  // Fetch reviews
  const loadReviews = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchReviews(searchParams);
      setReviews(data.items);
      setPagination({
        total: data.total,
        page: data.page,
        pageSize: data.pageSize,
        totalPages: data.totalPages,
        hasNextPage: data.hasNextPage,
        hasPreviousPage: data.hasPreviousPage,
      });
    } catch {
      setError("Failed to load reviews. Please try again.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [searchParams]);

  // Fetch stats
  const loadStats = useCallback(async () => {
    try {
      const data = await fetchReviewStats();
      setStats(data);
    } catch {
      // Stats error is non-critical, don't show error banner
    } finally {
      setIsStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    loadReviews();
    loadStats();
  }, [loadReviews, loadStats]);

  // Refresh handler
  const handleRefresh = () => {
    setIsRefreshing(true);
    setIsStatsLoading(true);
    loadReviews();
    loadStats();
  };

  // Update URL params
  const updateSearch = (updates: Partial<SearchParams>) => {
    navigate({
      to: "/admin/reviews",
      search: {
        ...searchParams,
        ...updates,
        page:
          updates.page ||
          (updates.status !== undefined || updates.search !== undefined ? 1 : searchParams.page),
      },
    });
  };

  // Handle search submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSearch({ search: searchQuery || undefined });
  };

  // Handle approve
  const handleApprove = async (reviewId: string) => {
    try {
      await moderateReview(reviewId, "approved");
      setIsRefreshing(true);
      await loadReviews();
      await loadStats();
    } catch {
      setError("Failed to approve review. Please try again.");
    }
  };

  // Handle reject
  const handleReject = async (reviewId: string, notes?: string) => {
    try {
      await moderateReview(reviewId, "rejected", notes);
      setIsRefreshing(true);
      await loadReviews();
      await loadStats();
    } catch {
      setError("Failed to reject review. Please try again.");
    }
  };

  // Handle delete
  const handleDelete = async (reviewId: string) => {
    if (!confirm("Are you sure you want to permanently delete this review?")) {
      return;
    }

    try {
      await deleteReview(reviewId);
      setIsRefreshing(true);
      await loadReviews();
      await loadStats();
    } catch {
      setError("Failed to delete review. Please try again.");
    }
  };

  // Handle bulk approve
  const handleBulkApprove = async () => {
    if (selectedReviews.size === 0) return;

    if (!confirm(`Are you sure you want to approve ${selectedReviews.size} reviews?`)) {
      return;
    }

    try {
      await Promise.all(Array.from(selectedReviews).map((id) => moderateReview(id, "approved")));
      setSelectedReviews(new Set());
      setIsRefreshing(true);
      await loadReviews();
      await loadStats();
    } catch {
      setError("Failed to approve some reviews. Please try again.");
    }
  };

  // Handle bulk reject
  const handleBulkReject = async () => {
    if (selectedReviews.size === 0) return;

    if (!confirm(`Are you sure you want to reject ${selectedReviews.size} reviews?`)) {
      return;
    }

    try {
      await Promise.all(Array.from(selectedReviews).map((id) => moderateReview(id, "rejected")));
      setSelectedReviews(new Set());
      setIsRefreshing(true);
      await loadReviews();
      await loadStats();
    } catch {
      setError("Failed to reject some reviews. Please try again.");
    }
  };

  // Toggle review selection
  const toggleSelection = (reviewId: string) => {
    const newSelection = new Set(selectedReviews);
    if (newSelection.has(reviewId)) {
      newSelection.delete(reviewId);
    } else {
      newSelection.add(reviewId);
    }
    setSelectedReviews(newSelection);
  };

  // Toggle all selection
  const toggleSelectAll = () => {
    if (selectedReviews.size === reviews.length) {
      setSelectedReviews(new Set());
    } else {
      setSelectedReviews(new Set(reviews.map((r) => r.id)));
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Reviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Moderate customer reviews ({pagination.total} total)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <StatsCardGrid columns={{ default: 2, sm: 2, lg: 4 }}>
        {isStatsLoading ? (
          <>
            <StatsCardSkeleton />
            <StatsCardSkeleton />
            <StatsCardSkeleton />
            <StatsCardSkeleton />
          </>
        ) : (
          <>
            <StatsCard
              title="Pending Reviews"
              value={stats?.pending ?? 0}
              icon={Clock}
              variant="warning"
              href="/admin/reviews?status=pending"
            />
            <StatsCard
              title="Approved"
              value={stats?.approved ?? 0}
              icon={CheckCircle2}
              variant="success"
              href="/admin/reviews?status=approved"
            />
            <StatsCard
              title="Rejected"
              value={stats?.rejected ?? 0}
              icon={XCircle}
              variant="danger"
              href="/admin/reviews?status=rejected"
            />
            <StatsCard
              title="Today"
              value={stats?.today ?? 0}
              icon={Calendar}
              variant="info"
              description={
                stats?.averageRating ? `Avg rating: ${stats.averageRating.toFixed(1)}` : undefined
              }
            />
          </>
        )}
      </StatsCardGrid>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-sm font-medium underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filters and Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Status Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {(["all", "pending", "approved", "rejected"] as const).map((status) => (
            <button
              key={status}
              onClick={() => updateSearch({ status: status === "all" ? undefined : status })}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                (status === "all" && !searchParams.status) || searchParams.status === status
                  ? "bg-brand-500 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
              {status === "pending" && stats?.pending ? (
                <span className="ml-1.5 rounded-full bg-white/20 px-1.5 text-xs">
                  {stats.pending}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by product or author..."
            className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:w-64"
          />
        </form>
      </div>

      {/* Bulk Actions */}
      {selectedReviews.size > 0 && (
        <div className="flex items-center gap-4 rounded-lg border border-brand-200 bg-brand-50 p-3">
          <span className="text-sm font-medium text-brand-700">
            {selectedReviews.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkApprove}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              <Check className="h-3.5 w-3.5" />
              Approve All
            </button>
            <button
              onClick={handleBulkReject}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              <X className="h-3.5 w-3.5" />
              Reject All
            </button>
          </div>
          <button
            onClick={() => setSelectedReviews(new Set())}
            className="ml-auto text-sm text-muted-foreground hover:text-foreground"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Reviews Table */}
      {isLoading && !isRefreshing ? (
        <ReviewsTableSkeleton />
      ) : reviews.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">No reviews found</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedReviews.size === reviews.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-border"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Product
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Author
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Rating
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground md:table-cell">
                  Preview
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground sm:table-cell">
                  Date
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reviews.map((review) => (
                <ReviewRow
                  key={review.id}
                  review={review}
                  isSelected={selectedReviews.has(review.id)}
                  isExpanded={expandedReview === review.id}
                  onToggleSelect={() => toggleSelection(review.id)}
                  onToggleExpand={() =>
                    setExpandedReview(expandedReview === review.id ? null : review.id)
                  }
                  onApprove={() => handleApprove(review.id)}
                  onReject={(notes) => handleReject(review.id, notes)}
                  onDelete={() => handleDelete(review.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          {/* Page Info */}
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </p>

          {/* Page Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateSearch({ page: pagination.page - 1 })}
              disabled={!pagination.hasPreviousPage}
              className="flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => updateSearch({ page: pagination.page + 1 })}
              disabled={!pagination.hasNextPage}
              className="flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Review Row Component
// ============================================================================

interface ReviewRowProps {
  review: AdminReview;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onApprove: () => void;
  onReject: (notes?: string) => void;
  onDelete: () => void;
}

function ReviewRow({
  review,
  isSelected,
  isExpanded,
  onToggleSelect,
  onToggleExpand,
  onApprove,
  onReject,
  onDelete,
}: ReviewRowProps) {
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  const handleRejectSubmit = () => {
    onReject(rejectNotes || undefined);
    setShowRejectModal(false);
    setRejectNotes("");
  };

  const statusStyles = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };

  return (
    <>
      <tr
        className={cn(
          "transition-colors hover:bg-muted/50",
          isSelected && "bg-brand-50/50",
          isExpanded && "bg-muted/30"
        )}
      >
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="h-4 w-4 rounded border-border"
          />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleExpand}
              className="font-medium text-foreground hover:text-brand-600"
            >
              {review.product?.title || "Unknown Product"}
            </button>
            {review.product && (
              <a
                href={`/posters/${review.product.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {review.author?.name?.[0]?.toUpperCase() || <User className="h-3.5 w-3.5" />}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {review.author?.name || "Anonymous"}
              </p>
              <p className="text-xs text-muted-foreground">{review.author?.email}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                className={cn(
                  "h-4 w-4",
                  i < review.rating ? "fill-amber-400 text-amber-400" : "fill-muted text-muted"
                )}
              />
            ))}
          </div>
        </td>
        <td className="hidden max-w-xs px-4 py-3 md:table-cell">
          <p className="truncate text-sm text-muted-foreground">
            {review.title || review.content || "No content"}
          </p>
        </td>
        <td className="px-4 py-3">
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
              statusStyles[review.status]
            )}
          >
            {review.status}
          </span>
        </td>
        <td className="hidden px-4 py-3 sm:table-cell">
          <time className="text-sm text-muted-foreground">
            {new Date(review.createdAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </time>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1">
            {review.status === "pending" && (
              <>
                <button
                  onClick={onApprove}
                  className="rounded-lg p-1.5 text-green-600 hover:bg-green-50"
                  title="Approve"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setShowRejectModal(true)}
                  className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                  title="Reject"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-border bg-card py-1 shadow-lg">
                    <button
                      onClick={() => {
                        onToggleExpand();
                        setShowMenu(false);
                      }}
                      className="flex w-full items-center px-3 py-1.5 text-sm text-foreground hover:bg-muted"
                    >
                      View Details
                    </button>
                    {review.status !== "approved" && (
                      <button
                        onClick={() => {
                          onApprove();
                          setShowMenu(false);
                        }}
                        className="flex w-full items-center px-3 py-1.5 text-sm text-green-600 hover:bg-muted"
                      >
                        Approve
                      </button>
                    )}
                    {review.status !== "rejected" && (
                      <button
                        onClick={() => {
                          setShowRejectModal(true);
                          setShowMenu(false);
                        }}
                        className="flex w-full items-center px-3 py-1.5 text-sm text-red-600 hover:bg-muted"
                      >
                        Reject
                      </button>
                    )}
                    <button
                      onClick={() => {
                        onDelete();
                        setShowMenu(false);
                      }}
                      className="flex w-full items-center px-3 py-1.5 text-sm text-red-600 hover:bg-muted"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </td>
      </tr>

      {/* Expanded Row */}
      {isExpanded && (
        <tr className="bg-muted/20">
          <td colSpan={8} className="px-4 py-4">
            <div className="space-y-3">
              {review.title && (
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Title</p>
                  <p className="text-sm text-foreground">{review.title}</p>
                </div>
              )}
              {review.content && (
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Content</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{review.content}</p>
                </div>
              )}
              {review.moderatorNotes && (
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Moderator Notes
                  </p>
                  <p className="text-sm text-muted-foreground">{review.moderatorNotes}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <>
          <tr>
            <td colSpan={8}>
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
                  <h3 className="text-lg font-semibold text-foreground">Reject Review</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add optional notes explaining the rejection reason.
                  </p>
                  <textarea
                    value={rejectNotes}
                    onChange={(e) => setRejectNotes(e.target.value)}
                    placeholder="Rejection reason (optional)..."
                    rows={3}
                    className="mt-4 w-full rounded-lg border border-border bg-background p-3 text-sm placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setShowRejectModal(false);
                        setRejectNotes("");
                      }}
                      className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRejectSubmit}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Reject Review
                    </button>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </>
      )}
    </>
  );
}

// ============================================================================
// Skeleton
// ============================================================================

function ReviewsTableSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/50 px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="h-4 w-4 rounded bg-muted" />
          <div className="h-4 w-20 rounded bg-muted" />
          <div className="h-4 w-16 rounded bg-muted" />
          <div className="h-4 w-12 rounded bg-muted" />
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-4 w-16 rounded bg-muted" />
          <div className="h-4 w-16 rounded bg-muted" />
        </div>
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <div className="h-4 w-4 rounded bg-muted" />
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-muted" />
              <div className="h-4 w-24 rounded bg-muted" />
            </div>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }, (_, j) => (
                <div key={j} className="h-4 w-4 rounded bg-muted" />
              ))}
            </div>
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="h-5 w-16 rounded-full bg-muted" />
            <div className="h-4 w-20 rounded bg-muted" />
            <div className="flex gap-1">
              <div className="h-7 w-7 rounded bg-muted" />
              <div className="h-7 w-7 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AdminReviewsPage;
