/**
 * Utility Functions
 *
 * Common utility functions for the chobii.art web application.
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with proper precedence handling.
 * Combines clsx for conditional classes and tailwind-merge for deduplication.
 *
 * @example
 * cn("px-4 py-2", "px-2") // => "py-2 px-2"
 * cn("text-red-500", condition && "text-blue-500") // conditional classes
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format price in INR currency format
 *
 * @example
 * formatPrice(1999.99) // => "₹1,999.99"
 * formatPrice("1999.99") // => "₹1,999.99"
 */
export function formatPrice(
  price: number | string,
  options: {
    currency?: string;
    locale?: string;
    showSymbol?: boolean;
  } = {}
): string {
  const { currency = "INR", locale = "en-IN", showSymbol = true } = options;
  const numericPrice = typeof price === "string" ? parseFloat(price) : price;

  if (isNaN(numericPrice)) {
    return showSymbol ? "₹0.00" : "0.00";
  }

  const formatted = new Intl.NumberFormat(locale, {
    style: showSymbol ? "currency" : "decimal",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericPrice);

  return formatted;
}

/**
 * Generate a URL-safe slug from a string
 *
 * @example
 * slugify("Hello World!") // => "hello-world"
 * slugify("Abstract Art #1") // => "abstract-art-1"
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w-]+/g, "") // Remove all non-word chars
    .replace(/--+/g, "-") // Replace multiple - with single -
    .replace(/^-+/, "") // Trim - from start of text
    .replace(/-+$/, ""); // Trim - from end of text
}

/**
 * Truncate a string to a maximum length with ellipsis
 *
 * @example
 * truncate("Hello World", 8) // => "Hello..."
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Generate initials from a name
 *
 * @example
 * getInitials("John Doe") // => "JD"
 * getInitials("Jane") // => "J"
 */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Format a date relative to now (e.g., "2 days ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const targetDate = typeof date === "string" ? new Date(date) : date;
  const diffInSeconds = Math.floor(
    (now.getTime() - targetDate.getTime()) / 1000
  );

  const intervals: { [key: string]: number } = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
  };

  for (const [unit, seconds] of Object.entries(intervals)) {
    const interval = Math.floor(diffInSeconds / seconds);
    if (interval >= 1) {
      const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
      return rtf.format(-interval, unit as Intl.RelativeTimeFormatUnit);
    }
  }

  return "just now";
}

/**
 * Format a date in a consistent format
 *
 * @example
 * formatDate(new Date()) // => "December 27, 2024"
 */
export function formatDate(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const targetDate = typeof date === "string" ? new Date(date) : date;
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
    ...options,
  };
  return new Intl.DateTimeFormat("en-IN", defaultOptions).format(targetDate);
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Check if we're running on the client (browser) side
 */
export function isClient(): boolean {
  return typeof window !== "undefined";
}

/**
 * Check if we're running on the server side
 */
export function isServer(): boolean {
  return typeof window === "undefined";
}

/**
 * Generate a random string for IDs
 */
export function generateId(prefix = ""): string {
  const id = Math.random().toString(36).substring(2, 15);
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Get absolute URL for SSR/client compatibility
 */
export function getAbsoluteUrl(path: string = ""): string {
  // On server, use environment variable
  if (isServer()) {
    const baseUrl = process.env.VITE_APP_URL ?? "http://localhost:3001";
    return `${baseUrl}${path}`;
  }

  // On client, use window.location
  return `${window.location.origin}${path}`;
}

/**
 * Get API URL for making requests
 *
 * In development:
 * - Server-side: Returns the full API URL (http://localhost:3000)
 * - Client-side: Returns the full API URL for cross-origin requests
 *
 * In production, both should use the same domain or configured API URL.
 */
export function getApiUrl(): string {
  // Default API URL for development
  const defaultApiUrl = "http://localhost:3000";

  // In browser, check for environment variable. MUST be ?? (not ||): the
  // production image is built with VITE_API_URL="" so browser API calls are
  // relative (same-origin) — || would discard the empty string and bake
  // localhost:3000 into the prod bundle (cc #96).
  if (isClient() && typeof import.meta !== "undefined") {
    const envUrl = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL;
    return envUrl ?? defaultApiUrl;
  }

  // On server (SSR container), this is a runtime env var: http://api:3000
  return process.env.VITE_API_URL ?? defaultApiUrl;
}

/**
 * Calculate total price for a cart item
 */
export function calculateItemTotal(
  unitPrice: number | string,
  framePrice: number | string,
  quantity: number
): number {
  const unit =
    typeof unitPrice === "string" ? parseFloat(unitPrice) : unitPrice;
  const frame =
    typeof framePrice === "string" ? parseFloat(framePrice) : framePrice;
  return (unit + frame) * quantity;
}

/**
 * Format dimension in inches or cm
 */
export function formatDimension(
  widthInches: number,
  heightInches: number,
  unit: "inches" | "cm" = "inches"
): string {
  if (unit === "cm") {
    const widthCm = Math.round(widthInches * 2.54);
    const heightCm = Math.round(heightInches * 2.54);
    return `${widthCm} x ${heightCm} cm`;
  }
  return `${widthInches}" x ${heightInches}"`;
}

/**
 * Get placeholder image URL
 */
export function getPlaceholderImage(
  width: number,
  height: number,
  text = ""
): string {
  const encodedText = encodeURIComponent(text || `${width}x${height}`);
  return `https://placehold.co/${width}x${height}/1a1a1a/fafafa?text=${encodedText}`;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate Indian phone number
 */
export function isValidPhone(phone: string): boolean {
  // Indian phone number: 10 digits, optionally starting with +91
  const phoneRegex = /^(\+91[\-\s]?)?[6-9]\d{9}$/;
  return phoneRegex.test(phone.replace(/\s/g, ""));
}

/**
 * Validate Indian postal code
 */
export function isValidPostalCode(postalCode: string): boolean {
  const postalRegex = /^[1-9][0-9]{5}$/;
  return postalRegex.test(postalCode);
}
