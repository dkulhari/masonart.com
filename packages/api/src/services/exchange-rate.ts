/**
 * Exchange Rate Service
 *
 * Fetches live USD/INR exchange rates with Redis caching.
 * Used for converting AI API costs (USD) to wallet amounts (INR).
 */

import { getCached, setCached } from "../lib/redis";

// ============================================================================
// Configuration
// ============================================================================

/** Cache key for exchange rate */
const EXCHANGE_RATE_CACHE_KEY = "exchange-rate:usd-inr";

/** Cache TTL: 1 hour */
const EXCHANGE_RATE_CACHE_TTL = 3600;

/** Fallback exchange rate if API fails */
const FALLBACK_EXCHANGE_RATE = 83.0;

/** Exchange rate API URL (free tier) */
const EXCHANGE_RATE_API_URL =
  "https://api.exchangerate-api.com/v4/latest/USD";

// ============================================================================
// Types
// ============================================================================

/**
 * Exchange rate API response
 */
interface ExchangeRateApiResponse {
  provider: string;
  WARNING_UPGRADE_TO_V6: string;
  terms: string;
  base: string;
  date: string;
  time_last_updated: number;
  rates: {
    INR: number;
    [key: string]: number;
  };
}

/**
 * Cached exchange rate data
 */
interface CachedExchangeRate {
  rate: number;
  fetchedAt: string;
  source: "api" | "fallback";
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get the current USD to INR exchange rate
 *
 * Fetches from external API with 1-hour Redis cache.
 * Falls back to a hardcoded rate if API is unavailable.
 *
 * @returns Exchange rate (e.g., 83.45 means 1 USD = 83.45 INR)
 */
export async function getExchangeRate(): Promise<number> {
  // Try to get from cache first
  const cached = await getCached<CachedExchangeRate>(EXCHANGE_RATE_CACHE_KEY);
  if (cached) {
    return cached.rate;
  }

  // Fetch fresh rate from API
  try {
    const response = await fetch(EXCHANGE_RATE_API_URL, {
      headers: {
        Accept: "application/json",
      },
      // 10 second timeout
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Exchange rate API error: ${response.status}`);
    }

    const data = (await response.json()) as ExchangeRateApiResponse;
    const rate = data.rates?.INR;

    if (typeof rate !== "number" || rate <= 0) {
      throw new Error("Invalid exchange rate from API");
    }

    // Cache the rate
    const cacheData: CachedExchangeRate = {
      rate,
      fetchedAt: new Date().toISOString(),
      source: "api",
    };
    await setCached(EXCHANGE_RATE_CACHE_KEY, cacheData, EXCHANGE_RATE_CACHE_TTL);

    return rate;
  } catch (error) {
    // Log error in non-test environments
    if (process.env.NODE_ENV !== "test") {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.warn(`Failed to fetch exchange rate: ${errorMessage}. Using fallback.`);
    }

    // Cache the fallback rate for a shorter period (15 minutes)
    const cacheData: CachedExchangeRate = {
      rate: FALLBACK_EXCHANGE_RATE,
      fetchedAt: new Date().toISOString(),
      source: "fallback",
    };
    await setCached(EXCHANGE_RATE_CACHE_KEY, cacheData, 900);

    return FALLBACK_EXCHANGE_RATE;
  }
}

/**
 * Convert USD cents to INR paise using live exchange rate
 *
 * @param usdCents - Amount in USD cents (e.g., 100 = $1.00)
 * @returns Amount in INR paise (e.g., 8300 = Rs 83.00)
 */
export async function convertUsdCentsToInrPaise(usdCents: number): Promise<{
  paise: number;
  exchangeRate: number;
}> {
  const exchangeRate = await getExchangeRate();

  // Convert: USD cents -> USD -> INR -> paise
  // usdCents / 100 = USD
  // USD * exchangeRate = INR
  // INR * 100 = paise
  const paise = Math.round((usdCents / 100) * exchangeRate * 100);

  return { paise, exchangeRate };
}

/**
 * Get exchange rate info including cache status
 *
 * Useful for admin dashboards to see rate details.
 */
export async function getExchangeRateInfo(): Promise<{
  rate: number;
  fetchedAt: string | null;
  source: "api" | "fallback" | "fresh";
  isCached: boolean;
}> {
  const cached = await getCached<CachedExchangeRate>(EXCHANGE_RATE_CACHE_KEY);

  if (cached) {
    return {
      rate: cached.rate,
      fetchedAt: cached.fetchedAt,
      source: cached.source,
      isCached: true,
    };
  }

  // Fetch fresh
  const rate = await getExchangeRate();
  return {
    rate,
    fetchedAt: new Date().toISOString(),
    source: "fresh",
    isCached: false,
  };
}
