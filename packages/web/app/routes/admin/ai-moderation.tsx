/**
 * Admin AI Moderation Dashboard - chobii.art E-commerce Platform
 *
 * AI generation moderation dashboard with:
 * - Stats cards showing pending, approved, rejected, flagged counts
 * - Filterable generation queue with status, user, style filters
 * - Quick approve/reject actions with reason selection
 * - Bulk moderation support
 * - Image preview modal
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
  Flag,
  Eye,
  Check,
  X,
  User,
  Image,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { getApiUrl } from "~/lib/utils";
import {
  StatsCard,
  StatsCardGrid,
  StatsCardSkeleton,
} from "~/components/admin/StatsCard";
import { useConfirmDialog } from "~/components/admin/useConfirm";

// ============================================================================
// Route Configuration
// ============================================================================

const searchParamsSchema = z.object({
  page: z.coerce.number().positive().optional().default(1),
  pageSize: z.coerce.number().positive().max(100).optional().default(20),
  status: z
    .enum(["pending_review", "approved", "rejected", "flagged"])
    .optional()
    .default("pending_review"),
  sortBy: z.enum(["newest", "oldest"]).optional().default("oldest"),
  stylePreset: z.string().optional(),
  userId: z.string().optional(),
});

type SearchParams = z.infer<typeof searchParamsSchema>;

export const Route = createFileRoute("/admin/ai-moderation")({
  validateSearch: (search) => searchParamsSchema.parse(search),
  head: () => ({
    meta: [
      { title: "AI Moderation | Admin | chobii.art" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminAIModerationPage,
});

// ============================================================================
// Types
// ============================================================================

interface AIGenerationImage {
  id: string;
  imageUrl: string;
  thumbnailUrl: string;
}

interface AIGeneration {
  id: string;
  promptText: string;
  stylePreset: string;
  aspectRatio: string;
  status: string;
  moderationStatus: "pending_review" | "approved" | "rejected" | "flagged";
  moderationResult: {
    isPassed: boolean;
    flags: string[];
    riskScore: number;
  } | null;
  isFlagged: boolean;
  images: AIGenerationImage[];
  selectedImageUrl: string | null;
  createdAt: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
}

interface ModerationStats {
  pending_review: number;
  approved: number;
  rejected: number;
  flagged: number;
  total: number;
}

interface PaginatedResponse {
  generations: AIGeneration[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

const REJECTION_CATEGORIES = [
  { value: "nsfw", label: "NSFW Content" },
  { value: "violence", label: "Violence" },
  { value: "hate_speech", label: "Hate Speech" },
  { value: "copyright", label: "Copyright Violation" },
  { value: "illegal_content", label: "Illegal Content" },
  { value: "spam", label: "Spam" },
  { value: "low_quality", label: "Low Quality" },
  { value: "other", label: "Other" },
];

// ============================================================================
// API Functions
// ============================================================================

async function fetchGenerations(
  params: SearchParams
): Promise<PaginatedResponse> {
  const queryParams = new URLSearchParams();

  queryParams.set("page", String(params.page));
  queryParams.set("pageSize", String(params.pageSize));
  queryParams.set("sortBy", params.sortBy);

  if (params.status) {
    queryParams.set("status", params.status);
  }

  if (params.stylePreset) {
    queryParams.set("stylePreset", params.stylePreset);
  }

  if (params.userId) {
    queryParams.set("userId", params.userId);
  }

  const response = await fetch(
    `${getApiUrl()}/api/admin/ai-moderation?${queryParams.toString()}`,
    {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch generations");
  }

  return response.json();
}

async function fetchModerationStats(): Promise<{
  stats: ModerationStats;
  avgReviewTimeMinutes: number;
}> {
  const response = await fetch(`${getApiUrl()}/api/admin/ai-moderation/stats`, {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch moderation statistics");
  }

  return response.json();
}

async function moderateGeneration(
  generationId: string,
  action: "approved" | "rejected" | "flagged",
  reason?: string,
  category?: string
): Promise<void> {
  const response = await fetch(
    `${getApiUrl()}/api/admin/ai-moderation/${generationId}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, reason, category }),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to moderate generation");
  }
}

async function bulkModerate(
  generationIds: string[],
  action: "approve" | "reject",
  reason?: string,
  category?: string
): Promise<void> {
  const endpoint =
    action === "approve"
      ? "/api/admin/ai-moderation/bulk-approve"
      : "/api/admin/ai-moderation/bulk-reject";

  const response = await fetch(`${getApiUrl()}${endpoint}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ generationIds, reason, category }),
  });

  if (!response.ok) {
    throw new Error(`Failed to bulk ${action}`);
  }
}

// ============================================================================
// Component
// ============================================================================

function AdminAIModerationPage() {
  const navigate = useNavigate();
  const searchParams = Route.useSearch();
  const { confirmAction, dialog } = useConfirmDialog();

  const [generations, setGenerations] = useState<AIGeneration[]>([]);
  const [stats, setStats] = useState<ModerationStats | null>(null);
  const [avgReviewTime, setAvgReviewTime] = useState<number>(0);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedGenerations, setSelectedGenerations] = useState<Set<string>>(
    new Set()
  );
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{
    generationId: string;
    bulk?: boolean;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectCategory, setRejectCategory] = useState("");

  // Fetch generations
  const loadGenerations = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchGenerations(searchParams);
      setGenerations(data.generations);
      setPagination({
        total: data.pagination.total,
        page: data.pagination.page,
        pageSize: data.pagination.pageSize,
        totalPages: data.pagination.totalPages,
        hasNext: data.pagination.hasNext,
        hasPrev: data.pagination.hasPrev,
      });
    } catch {
      setError("Failed to load generations. Please try again.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [searchParams]);

  // Fetch stats
  const loadStats = useCallback(async () => {
    try {
      const data = await fetchModerationStats();
      setStats(data.stats);
      setAvgReviewTime(data.avgReviewTimeMinutes);
    } catch {
      // Stats error is non-critical
    } finally {
      setIsStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    loadGenerations();
    loadStats();
  }, [loadGenerations, loadStats]);

  // Refresh handler
  const handleRefresh = () => {
    setIsRefreshing(true);
    setIsStatsLoading(true);
    loadGenerations();
    loadStats();
  };

  // Update URL params
  const updateSearch = (updates: Partial<SearchParams>) => {
    navigate({
      to: "/admin/ai-moderation",
      search: {
        ...searchParams,
        ...updates,
        page:
          updates.page ||
          (updates.status !== undefined ? 1 : searchParams.page),
      },
    });
  };

  // Handle approve
  const handleApprove = async (generationId: string) => {
    try {
      await moderateGeneration(generationId, "approved");
      setIsRefreshing(true);
      await loadGenerations();
      await loadStats();
    } catch {
      setError("Failed to approve generation. Please try again.");
    }
  };

  // Handle reject (opens modal)
  const handleRejectClick = (generationId: string) => {
    setRejectModal({ generationId });
    setRejectReason("");
    setRejectCategory("");
  };

  // Confirm reject
  const handleRejectConfirm = async () => {
    if (!rejectModal || !rejectCategory || !rejectReason) return;

    try {
      if (rejectModal.bulk) {
        await bulkModerate(
          Array.from(selectedGenerations),
          "reject",
          rejectReason,
          rejectCategory
        );
        setSelectedGenerations(new Set());
      } else {
        await moderateGeneration(
          rejectModal.generationId,
          "rejected",
          rejectReason,
          rejectCategory
        );
      }
      setRejectModal(null);
      setIsRefreshing(true);
      await loadGenerations();
      await loadStats();
    } catch {
      setError("Failed to reject generation. Please try again.");
    }
  };

  // Handle flag
  const handleFlag = async (generationId: string) => {
    try {
      await moderateGeneration(
        generationId,
        "flagged",
        "Flagged for senior review"
      );
      setIsRefreshing(true);
      await loadGenerations();
      await loadStats();
    } catch {
      setError("Failed to flag generation. Please try again.");
    }
  };

  // Handle bulk approve
  const handleBulkApprove = async () => {
    if (selectedGenerations.size === 0) return;

    const confirmed = await confirmAction({
      title: `Approve ${selectedGenerations.size} generations?`,
      body: "They become available to the customers who generated them.",
      confirmLabel: "Approve generations",
    });

    if (!confirmed) return;

    try {
      await bulkModerate(Array.from(selectedGenerations), "approve");
      setSelectedGenerations(new Set());
      setIsRefreshing(true);
      await loadGenerations();
      await loadStats();
    } catch {
      setError("Failed to approve some generations. Please try again.");
    }
  };

  // Handle bulk reject click
  const handleBulkRejectClick = () => {
    if (selectedGenerations.size === 0) return;
    setRejectModal({ generationId: "", bulk: true });
    setRejectReason("");
    setRejectCategory("");
  };

  // Toggle selection
  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedGenerations);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedGenerations(newSelected);
  };

  // Select all on current page
  const toggleSelectAll = () => {
    if (selectedGenerations.size === generations.length) {
      setSelectedGenerations(new Set());
    } else {
      setSelectedGenerations(new Set(generations.map((g) => g.id)));
    }
  };

  // Status badge
  const getStatusBadge = (
    status: AIGeneration["moderationStatus"],
    isFlagged: boolean
  ) => {
    if (isFlagged && status !== "flagged") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
          <AlertCircle className="h-3 w-3" />
          Auto-flagged
        </span>
      );
    }

    switch (status) {
      case "pending_review":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        );
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle2 className="h-3 w-3" />
            Approved
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="h-3 w-3" />
            Rejected
          </span>
        );
      case "flagged":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
            <Flag className="h-3 w-3" />
            Flagged
          </span>
        );
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Moderation</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review and moderate AI-generated content
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw
            className={cn("h-4 w-4", isRefreshing && "animate-spin")}
          />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <StatsCardGrid>
        {isStatsLoading ? (
          <>
            <StatsCardSkeleton />
            <StatsCardSkeleton />
            <StatsCardSkeleton />
            <StatsCardSkeleton />
          </>
        ) : stats ? (
          <>
            <StatsCard
              title="Pending Review"
              value={stats.pending_review}
              icon={Clock}
              variant="warning"
              onClick={() => updateSearch({ status: "pending_review" })}
            />
            <StatsCard
              title="Approved"
              value={stats.approved}
              icon={CheckCircle2}
              variant="success"
              onClick={() => updateSearch({ status: "approved" })}
            />
            <StatsCard
              title="Rejected"
              value={stats.rejected}
              icon={XCircle}
              variant="danger"
              onClick={() => updateSearch({ status: "rejected" })}
            />
            <StatsCard
              title="Flagged"
              value={stats.flagged}
              icon={Flag}
              variant="warning"
              onClick={() => updateSearch({ status: "flagged" })}
            />
          </>
        ) : null}
      </StatsCardGrid>

      {/* Avg Review Time */}
      {!isStatsLoading && avgReviewTime > 0 && (
        <p className="text-sm text-gray-500">
          Average review time: {avgReviewTime} minutes
        </p>
      )}

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <select
          value={searchParams.status}
          onChange={(e) =>
            updateSearch({
              status: e.target.value as SearchParams["status"],
            })
          }
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="pending_review">Pending Review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="flagged">Flagged</option>
        </select>

        <select
          value={searchParams.sortBy}
          onChange={(e) =>
            updateSearch({ sortBy: e.target.value as SearchParams["sortBy"] })
          }
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="oldest">Oldest First (FIFO)</option>
          <option value="newest">Newest First</option>
        </select>

        {/* Bulk Actions */}
        {selectedGenerations.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-gray-600">
              {selectedGenerations.size} selected
            </span>
            <button
              onClick={handleBulkApprove}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100"
            >
              <Check className="h-4 w-4" />
              Approve All
            </button>
            <button
              onClick={handleBulkRejectClick}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100"
            >
              <X className="h-4 w-4" />
              Reject All
            </button>
          </div>
        )}
      </div>

      {/* Generation List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse"
            >
              <div className="aspect-square bg-gray-200 rounded-lg mb-4" />
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : generations.length === 0 ? (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <Image className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">
            No generations found
          </h3>
          <p className="text-sm text-gray-500">
            {searchParams.status === "pending_review"
              ? "All caught up! No pending reviews."
              : "No generations match your filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Select All */}
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={selectedGenerations.size === generations.length}
              onChange={toggleSelectAll}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Select all on this page
          </label>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {generations.map((generation) => (
              <div
                key={generation.id}
                className={cn(
                  "bg-white border rounded-lg overflow-hidden transition-shadow hover:shadow-md",
                  selectedGenerations.has(generation.id)
                    ? "border-blue-500 ring-2 ring-blue-200"
                    : "border-gray-200"
                )}
              >
                {/* Image */}
                <div className="relative aspect-square bg-gray-100">
                  {generation.images[0]?.thumbnailUrl ||
                  generation.selectedImageUrl ? (
                    <img
                      src={
                        generation.images[0]?.thumbnailUrl ||
                        generation.selectedImageUrl ||
                        ""
                      }
                      alt="AI Generated"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Image className="h-12 w-12 text-gray-400" />
                    </div>
                  )}

                  {/* Selection checkbox */}
                  <div className="absolute top-2 left-2">
                    <input
                      type="checkbox"
                      checked={selectedGenerations.has(generation.id)}
                      onChange={() => toggleSelection(generation.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-5 w-5"
                    />
                  </div>

                  {/* Preview button */}
                  <button
                    onClick={() =>
                      setPreviewImage(
                        generation.images[0]?.imageUrl ||
                          generation.selectedImageUrl ||
                          ""
                      )
                    }
                    className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-lg hover:bg-black/70"
                  >
                    <Eye className="h-4 w-4" />
                  </button>

                  {/* Status badge */}
                  <div className="absolute bottom-2 left-2">
                    {getStatusBadge(
                      generation.moderationStatus,
                      generation.isFlagged
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-3">
                  <p className="text-sm text-gray-700 line-clamp-2">
                    {generation.promptText}
                  </p>

                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="px-2 py-0.5 bg-gray-100 rounded">
                      {generation.stylePreset}
                    </span>
                    <span className="px-2 py-0.5 bg-gray-100 rounded">
                      {generation.aspectRatio}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <User className="h-3 w-3" />
                    <span className="truncate">
                      {generation.userName || generation.userEmail || "Unknown"}
                    </span>
                  </div>

                  <div className="text-xs text-gray-400">
                    {new Date(generation.createdAt).toLocaleString()}
                  </div>

                  {/* Risk score if flagged */}
                  {(generation.moderationResult?.riskScore ?? 0) > 0 && (
                    <div className="text-xs text-orange-600">
                      Risk Score:{" "}
                      {((generation.moderationResult?.riskScore ?? 0) * 100).toFixed(0)}%
                    </div>
                  )}

                  {/* Action buttons */}
                  {generation.moderationStatus === "pending_review" && (
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <button
                        onClick={() => handleApprove(generation.id)}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100"
                      >
                        <Check className="h-4 w-4" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleRejectClick(generation.id)}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100"
                      >
                        <X className="h-4 w-4" />
                        Reject
                      </button>
                      <button
                        onClick={() => handleFlag(generation.id)}
                        className="inline-flex items-center justify-center p-2 text-orange-700 bg-orange-50 rounded-lg hover:bg-orange-100"
                        title="Flag for senior review"
                      >
                        <Flag className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-gray-600">
            Showing {(pagination.page - 1) * pagination.pageSize + 1} -{" "}
            {Math.min(pagination.page * pagination.pageSize, pagination.total)}{" "}
            of {pagination.total}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateSearch({ page: pagination.page - 1 })}
              disabled={!pagination.hasPrev}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => updateSearch({ page: pagination.page + 1 })}
              disabled={!pagination.hasNext}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {rejectModal.bulk
                ? `Reject ${selectedGenerations.size} Generations`
                : "Reject Generation"}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category *
                </label>
                <select
                  value={rejectCategory}
                  onChange={(e) => setRejectCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a category...</option>
                  {REJECTION_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason *
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="Explain why this content is being rejected..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setRejectModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectConfirm}
                disabled={!rejectCategory || !rejectReason}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk approve asks here, in the page (#625). */}
      {dialog}
    </div>
  );
}
