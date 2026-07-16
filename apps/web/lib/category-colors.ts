// Detik.com/Kompas.com-style channel branding: each news category gets its
// own accent color (detikFinance is green, detikHot is pink, etc.) rather
// than every section looking identical. Common category names/slugs map to
// a deliberately-chosen color; anything else gets a stable color from a
// hash of its slug, so an org's custom categories still look intentional
// and stay the same color across renders instead of flickering between
// options.
const NAMED_COLORS: Record<string, ColorKey> = {
  business: "amber",
  bisnis: "amber",
  ekonomi: "amber",
  finance: "amber",
  keuangan: "amber",
  technology: "violet",
  teknologi: "violet",
  tech: "violet",
  world: "sky",
  dunia: "sky",
  international: "sky",
  internasional: "sky",
  sports: "emerald",
  olahraga: "emerald",
  entertainment: "pink",
  hiburan: "pink",
  health: "teal",
  kesehatan: "teal",
  politics: "rose",
  politik: "rose",
  lifestyle: "orange",
  gaya_hidup: "orange",
  travel: "cyan",
  wisata: "cyan",
  food: "lime",
  kuliner: "lime",
  science: "indigo",
  sains: "indigo",
  opinion: "slate",
  opini: "slate",
};

const FALLBACK_ORDER: ColorKey[] = [
  "violet", "amber", "sky", "emerald", "pink", "teal", "rose", "orange", "cyan", "indigo",
];

type ColorKey =
  | "amber" | "violet" | "sky" | "emerald" | "pink" | "teal" | "rose" | "orange" | "cyan" | "indigo" | "lime" | "slate";

// Tailwind needs literal class strings to find at build time — this can't
// be constructed dynamically (e.g. `bg-${color}-600`), so every option is
// spelled out.
const COLOR_CLASSES: Record<ColorKey, { badge: string; text: string; border: string; bgSoft: string }> = {
  amber: { badge: "bg-amber-600", text: "text-amber-600", border: "border-amber-600", bgSoft: "bg-amber-50" },
  violet: { badge: "bg-violet-600", text: "text-violet-600", border: "border-violet-600", bgSoft: "bg-violet-50" },
  sky: { badge: "bg-sky-600", text: "text-sky-600", border: "border-sky-600", bgSoft: "bg-sky-50" },
  emerald: { badge: "bg-emerald-600", text: "text-emerald-600", border: "border-emerald-600", bgSoft: "bg-emerald-50" },
  pink: { badge: "bg-pink-600", text: "text-pink-600", border: "border-pink-600", bgSoft: "bg-pink-50" },
  teal: { badge: "bg-teal-600", text: "text-teal-600", border: "border-teal-600", bgSoft: "bg-teal-50" },
  rose: { badge: "bg-rose-600", text: "text-rose-600", border: "border-rose-600", bgSoft: "bg-rose-50" },
  orange: { badge: "bg-orange-600", text: "text-orange-600", border: "border-orange-600", bgSoft: "bg-orange-50" },
  cyan: { badge: "bg-cyan-600", text: "text-cyan-600", border: "border-cyan-600", bgSoft: "bg-cyan-50" },
  indigo: { badge: "bg-indigo-600", text: "text-indigo-600", border: "border-indigo-600", bgSoft: "bg-indigo-50" },
  lime: { badge: "bg-lime-600", text: "text-lime-600", border: "border-lime-600", bgSoft: "bg-lime-50" },
  slate: { badge: "bg-slate-600", text: "text-slate-600", border: "border-slate-600", bgSoft: "bg-slate-50" },
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
