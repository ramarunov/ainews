// Homepage sidebar "Harga Emas" widget data source - the free, keyless
// logam-mulia-api (https://github.com/iamutaki/logam-mulia-api), a
// community-run scraper that mirrors several Indonesian gold retailers'
// published prices as JSON. Using its "logammulia" source specifically -
// that's Antam's own precious-metals subsidiary (logammulia.com), the most
// authoritative reference for "harga emas Antam" that Indonesian readers
// actually look for, rather than a reseller's marked-up price.
const API_URL = "https://logam-mulia-api.iamutaki.workers.dev/api/prices/logammulia";

export interface GoldPrice {
  /** In grams, e.g. 1, 5, 10 */
  weight: number;
  sellPrice: number;
  buybackPrice: number | null;
  currency: string;
  /** ISO date, e.g. "2026-08-26" */
  recordedDate: string;
}

interface RawEntry {
  weight: number;
  sellPrice: number;
  buybackPrice: number | null;
  currency: string;
  recordedDate: string;
}

// Never throws - same reasoning as lib/football-api.ts: a free third-party
// API changing shape or going down should just mean the widget silently
// doesn't render, not a broken homepage.
export async function getGoldPrices(): Promise<GoldPrice[]> {
  try {
    // 1-hour revalidate - Antam republishes its price list at most a
    // handful of times a day, so this is already generous, and a courtesy
    // to a free, community-run API rather than a rate-limit necessity.
    const res = await fetch(API_URL, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: RawEntry[] | null };
    const entries = data.data ?? [];
    return entries
      .filter((e) => typeof e.weight === "number" && typeof e.sellPrice === "number")
      .sort((a, b) => a.weight - b.weight)
      .map((e) => ({
        weight: e.weight,
        sellPrice: e.sellPrice,
        buybackPrice: e.buybackPrice ?? null,
        currency: e.currency || "IDR",
        recordedDate: e.recordedDate,
      }));
  } catch {
    return [];
  }
}
