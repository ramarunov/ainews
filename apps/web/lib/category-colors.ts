// Simple, single-hue channel branding: every category is a shade of the
// site's dominant purple rather than its own unrelated color — darker/richer
// tones read as "heavier" sections (e.g. Dunia), lighter ones as brighter
// sections (e.g. Otomotif), but nothing ever leaves the violet/purple family.
// Common category names/slugs map to a deliberately-chosen tone; anything
// else gets a stable tone from a hash of its slug, so an org's custom
// categories still look intentional and stay the same tone across renders
// instead of flickering between options.
const NAMED_COLORS: Record<string, ColorKey> = {
  business: "violet600",
  bisnis: "violet600",
  ekonomi: "violet600",
  finance: "violet600",
  keuangan: "violet600",
  sports: "purple600",
  olahraga: "purple600",
  politics: "violet800",
  politik: "violet800",
  technology: "purple800",
  teknologi: "purple800",
  tech: "purple800",
  automotive: "violet700",
  otomotif: "violet700",
  otomotive: "violet700",
  health: "purple700",
  kesehatan: "purple700",
  travel: "violet900",
  wisata: "violet900",
  entertainment: "purple900",
  hiburan: "purple900",
  celebrity: "purple900",
  selebriti: "purple900",
  world: "violet950",
  dunia: "violet950",
  international: "violet950",
  internasional: "violet950",
  lifestyle: "violet600",
  gaya_hidup: "violet600",
  food: "purple600",
  kuliner: "purple600",
  science: "violet800",
  sains: "violet800",
  opinion: "purple800",
  opini: "purple800",
};

const FALLBACK_ORDER: ColorKey[] = [
  "violet600", "purple600", "violet800", "purple800",
  "violet700", "purple700", "violet900", "purple900", "violet950",
];

type ColorKey =
  | "violet600" | "violet700" | "violet800" | "violet900" | "violet950"
  | "purple600" | "purple700" | "purple800" | "purple900";

// Tailwind needs literal class strings to find at build time — this can't
// be constructed dynamically (e.g. `bg-${color}-600`), so every option is
// spelled out.
const COLOR_CLASSES: Record<ColorKey, { badge: string; text: string; border: string; bgSoft: string }> = {
  violet600: { badge: "bg-violet-600", text: "text-violet-600", border: "border-violet-600", bgSoft: "bg-violet-50" },
  violet700: { badge: "bg-violet-700", text: "text-violet-700", border: "border-violet-700", bgSoft: "bg-violet-50" },
  violet800: { badge: "bg-violet-800", text: "text-violet-800", border: "border-violet-800", bgSoft: "bg-violet-50" },
  violet900: { badge: "bg-violet-900", text: "text-violet-900", border: "border-violet-900", bgSoft: "bg-violet-50" },
  violet950: { badge: "bg-violet-950", text: "text-violet-950", border: "border-violet-950", bgSoft: "bg-violet-50" },
  purple600: { badge: "bg-purple-600", text: "text-purple-600", border: "border-purple-600", bgSoft: "bg-purple-50" },
  purple700: { badge: "bg-purple-700", text: "text-purple-700", border: "border-purple-700", bgSoft: "bg-purple-50" },
  purple800: { badge: "bg-purple-800", text: "text-purple-800", border: "border-purple-800", bgSoft: "bg-purple-50" },
  purple900: { badge: "bg-purple-900", text: "text-purple-900", border: "border-purple-900", bgSoft: "bg-purple-50" },
};

function hashToIndex(value: string, mod: number): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % mod;
}

export function getCategoryColorKey(slugOrName: string): ColorKey {
  const key = slugOrName.toLowerCase().replace(/[\s-]+/g, "_");
  if (NAMED_COLORS[key]) return NAMED_COLORS[key];
  return FALLBACK_ORDER[hashToIndex(key, FALLBACK_ORDER.length)];
}

export function getCategoryColors(slugOrName: string | undefined | null) {
  if (!slugOrName) {
    return { badge: "bg-primary", text: "text-primary", border: "border-primary", bgSoft: "bg-accent" };
  }
  return COLOR_CLASSES[getCategoryColorKey(slugOrName)];
}
