/**
 * Notification Preferences Page - MasonArt E-commerce Platform
 *
 * Allows users to manage their email and SMS notification preferences.
 * Supports optimistic updates with rollback on error.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  Mail,
  Smartphone,
  Loader2,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  Package,
  Truck,
  MapPin,
  Home,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { notificationPreferencesApi, type NotificationPreferencesResponse } from "~/lib/api";

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute("/_authed/account/notifications")({
  head: () => ({
    meta: [
      { title: "Notification Preferences | MasonArt" },
      { name: "description", content: "Manage your email and SMS notification preferences." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotificationPreferencesPage,
});

// ============================================================================
// Types
// ============================================================================

interface NotificationToggleProps {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  isLoading: boolean;
  onChange: (enabled: boolean) => void;
}

interface NotificationGroup {
  id: string;
  label: string;
  description: string;
  icon: typeof Package;
  emailKey: keyof NotificationPreferencesResponse["preferences"]["email"];
  smsKey: keyof NotificationPreferencesResponse["preferences"]["sms"];
}

// ============================================================================
// Notification Groups Configuration
// ============================================================================

const NOTIFICATION_GROUPS: NotificationGroup[] = [
  {
    id: "orderConfirmation",
    label: "Order Confirmation",
    description: "When your order is placed and confirmed",
    icon: Package,
    emailKey: "orderConfirmation",
    smsKey: "orderConfirmation",
  },
  {
    id: "shipped",
    label: "Order Shipped",
    description: "When your order is shipped with tracking info",
    icon: Truck,
    emailKey: "shipped",
    smsKey: "shipped",
  },
  {
    id: "outForDelivery",
    label: "Out for Delivery",
    description: "When your order is out for delivery",
    icon: MapPin,
    emailKey: "outForDelivery",
    smsKey: "outForDelivery",
  },
  {
    id: "delivered",
    label: "Delivered",
    description: "When your order has been delivered",
    icon: Home,
    emailKey: "delivered",
    smsKey: "delivered",
  },
];

// ============================================================================
// Main Component
// ============================================================================

function NotificationPreferencesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<
    NotificationPreferencesResponse["preferences"] | null
  >(null);
  const [loadingToggles, setLoadingToggles] = useState<Set<string>>(new Set());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch preferences on mount
  useEffect(() => {
    async function fetchPreferences() {
      try {
        const response = await notificationPreferencesApi.get();
        setPreferences(response.preferences);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load preferences");
      } finally {
        setIsLoading(false);
      }
    }

    fetchPreferences();
  }, []);

  // Handle preference toggle with optimistic update
  const handleToggle = useCallback(
    async (channel: "email" | "sms", key: string, enabled: boolean) => {
      if (!preferences) return;

      const toggleKey = `${channel}${key.charAt(0).toUpperCase() + key.slice(1)}`;
      const toggleId = `${channel}-${key}`;

      // Store previous value for rollback
      const previousValue =
        channel === "email"
          ? preferences.email[key as keyof typeof preferences.email]
          : preferences.sms[key as keyof typeof preferences.sms];

      // Optimistic update
      setPreferences((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [channel]: {
            ...prev[channel],
            [key]: enabled,
          },
        };
      });

      // Set loading state for this toggle
      setLoadingToggles((prev) => new Set(prev).add(toggleId));
      setError(null);
      setSuccessMessage(null);

      try {
        await notificationPreferencesApi.update({
          [toggleKey]: enabled,
        } as Record<string, boolean>);

        setSuccessMessage("Preferences updated");
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (err) {
        // Rollback on error
        setPreferences((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            [channel]: {
              ...prev[channel],
              [key]: previousValue,
            },
          };
        });
        setError(err instanceof Error ? err.message : "Failed to update preferences");
      } finally {
        setLoadingToggles((prev) => {
          const next = new Set(prev);
          next.delete(toggleId);
          return next;
        });
      }
    },
    [preferences]
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container-wide py-8 lg:py-12">
          <div className="mx-auto max-w-2xl">
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-12 w-12 animate-spin text-brand-500" />
              <p className="mt-4 text-muted-foreground">Loading preferences...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state (initial load failed)
  if (!preferences) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container-wide py-8 lg:py-12">
          <div className="mx-auto max-w-2xl">
            <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
              <h2 className="mt-4 text-lg font-semibold text-red-900">
                Unable to Load Preferences
              </h2>
              <p className="mt-2 text-sm text-red-700">
                {error || "Something went wrong. Please try again."}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide py-8 lg:py-12">
        {/* Back Link */}
        <a
          href="/account"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Account
        </a>

        <div className="mx-auto max-w-2xl">
          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100">
                <Bell className="h-6 w-6 text-brand-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Notification Preferences</h1>
                <p className="text-sm text-muted-foreground">
                  Choose how you want to be notified about your orders
                </p>
              </div>
            </div>
          </div>

          {/* Success/Error Messages */}
          {successMessage && (
            <div className="mb-6 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <p className="text-sm font-medium text-green-800">{successMessage}</p>
            </div>
          )}

          {error && (
            <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          )}

          {/* Notification Sections */}
          <div className="space-y-6">
            {/* Email Notifications */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-6 py-4">
                <Mail className="h-5 w-5 text-brand-500" />
                <div>
                  <h2 className="font-semibold text-foreground">Email Notifications</h2>
                  <p className="text-xs text-muted-foreground">Sent to your account email</p>
                </div>
              </div>
              <div className="divide-y divide-border">
                {NOTIFICATION_GROUPS.map((group) => (
                  <NotificationToggle
                    key={`email-${group.id}`}
                    id={`email-${group.id}`}
                    label={group.label}
                    description={group.description}
                    enabled={preferences.email[group.emailKey]}
                    isLoading={loadingToggles.has(`email-${group.emailKey}`)}
                    onChange={(enabled) => handleToggle("email", group.emailKey, enabled)}
                  />
                ))}
              </div>
            </div>

            {/* SMS Notifications */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-6 py-4">
                <Smartphone className="h-5 w-5 text-brand-500" />
                <div>
                  <h2 className="font-semibold text-foreground">SMS Notifications</h2>
                  <p className="text-xs text-muted-foreground">Sent to your phone number</p>
                </div>
              </div>
              <div className="divide-y divide-border">
                {NOTIFICATION_GROUPS.map((group) => (
                  <NotificationToggle
                    key={`sms-${group.id}`}
                    id={`sms-${group.id}`}
                    label={group.label}
                    description={group.description}
                    enabled={preferences.sms[group.smsKey]}
                    isLoading={loadingToggles.has(`sms-${group.smsKey}`)}
                    onChange={(enabled) => handleToggle("sms", group.smsKey, enabled)}
                  />
                ))}
              </div>
            </div>

            {/* Info Card */}
            <div className="rounded-xl border border-border bg-muted/30 p-6">
              <h3 className="text-sm font-semibold text-foreground">About Notifications</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Email notifications are sent to your account email address. SMS notifications
                require a verified phone number. Important order and security notifications may
                still be sent regardless of these preferences.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// NotificationToggle Component
// ============================================================================

function NotificationToggle({
  id,
  label,
  description,
  enabled,
  isLoading,
  onChange,
}: NotificationToggleProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4">
      <div className="flex-1 pr-4">
        <label htmlFor={id} className="text-sm font-medium text-foreground cursor-pointer">
          {label}
        </label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={isLoading}
        onClick={() => onChange(!enabled)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          enabled ? "bg-brand-500" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
            enabled ? "translate-x-5" : "translate-x-0"
          )}
        >
          {isLoading && (
            <span className="flex h-full w-full items-center justify-center">
              <Loader2 className="h-3 w-3 animate-spin text-brand-500" />
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

export default NotificationPreferencesPage;
