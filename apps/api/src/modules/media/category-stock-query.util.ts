// Pexels (like most stock-photo libraries) is tagged predominantly in
// English, so searching with the org's own Indonesian category name
// directly tends to return weak/irrelevant matches. Maps each of this
// project's named categories (see category-colors.ts on the frontend for
// the same "known Indonesian/English name -> stable value" pattern) to a
// reliable English search term; anything unmapped falls back to a generic
// news-photo query rather than searching for the raw, possibly-non-English
// category name.
const CATEGORY_STOCK_QUERIES: Record<string, string> = {
  business: 'business finance',
  bisnis: 'business finance',
  ekonomi: 'business finance',
  finance: 'business finance',
  keuangan: 'business finance',
  sports: 'sports stadium',
  olahraga: 'sports stadium',
  politics: 'politics government',
  politik: 'politics government',
  technology: 'technology computer',
  teknologi: 'technology computer',
  tech: 'technology computer',
  automotive: 'automotive car',
  otomotif: 'automotive car',
  otomotive: 'automotive car',
  health: 'health medical',
  kesehatan: 'health medical',
  travel: 'travel destination',
  wisata: 'travel destination',
  entertainment: 'entertainment celebrity',
  hiburan: 'entertainment celebrity',
  celebrity: 'entertainment celebrity',
  selebriti: 'entertainment celebrity',
  world: 'world global city',
  dunia: 'world global city',
  international: 'world global city',
  internasional: 'world global city',
  lifestyle: 'lifestyle',
  gaya_hidup: 'lifestyle',
  food: 'food cuisine',
  kuliner: 'food cuisine',
  science: 'science research',
  sains: 'science research',
  opinion: 'newspaper',
  opini: 'newspaper',
};

const DEFAULT_QUERY = 'newspaper journalism';

export function buildStockPhotoQuery(categoryNameOrSlug: string | null | undefined): string {
  if (!categoryNameOrSlug) return DEFAULT_QUERY;
  const key = categoryNameOrSlug.toLowerCase().trim().replace(/[\s-]+/g, '_');
  return CATEGORY_STOCK_QUERIES[key] ?? DEFAULT_QUERY;
}
