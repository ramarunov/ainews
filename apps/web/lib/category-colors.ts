// Distinct-hue-per-channel branding (detik.com-style): each category family
// gets its own recognizable hue (hard news red, business green, tech blue,
// sports orange, entertainment pink, ...) instead of a shade of one color -
// this is what makes a dense multi-channel nav/mega-menu/homepage scannable
// at a glance. The site's own chrome (logo, buttons, global cross-category
// section labels like "Berita Terkini") intentionally stays on the site's
// `--primary` (violet) brand color, defined in globals.css's `.pulse-daily`
// block - violet is deliberately NOT assigned to any category below, so
// brand chrome never gets confused with a specific channel's color.
// Common category names/slugs (English + the real Indonesian slugs this org
// actually uses) map to a deliberately-chosen hue; anything else gets a
// stable hue from a hash of its slug, so a custom category still looks
// intentional and stays the same hue across renders instead of flickering
// between options.
const NAMED_COLORS: Record<string, ColorKey> = {
  // Hard news / law / government / disaster - red
  berita: "red600",
  news: "red600",
  nasional: "red600",
  peristiwa: "red600",
  bencana_alam: "red700",
  hukum: "red700",
  politik: "red700",
  politics: "red700",
  pemerintahan: "red700",

  // Business / finance / career / infrastructure - green
  business: "green600",
  bisnis: "green600",
  ekonomi: "green600",
  economy: "green600",
  finance: "green600",
  keuangan: "green600",
  karir: "green700",
  career: "green700",
  infrastruktur: "green700",
  infrastructure: "green700",

  // Education - emerald
  pendidikan: "emerald600",
  education: "emerald600",
  // Environment - emerald (deeper shade, distinct from education)
  lingkungan: "emerald700",
  environment: "emerald700",

  // Health - teal
  health: "teal600",
  kesehatan: "teal600",

  // Automotive / transportation - cyan
  automotive: "cyan600",
  otomotif: "cyan600",
  otomotive: "cyan600",
  transportasi: "cyan700",
  transportation: "cyan700",

  // Technology / science / gaming - blue
  technology: "blue600",
  teknologi: "blue600",
  tech: "blue600",
  science: "blue700",
  sains: "blue700",
  game: "blue700",

  // Travel / weather - sky
  travel: "sky600",
  wisata: "sky600",
  cuaca: "sky600",
  weather: "sky600",

  // International / religion / history - indigo
  world: "indigo600",
  dunia: "indigo600",
  international: "indigo600",
  internasional: "indigo600",
  agama: "indigo600",
  religion: "indigo600",
  historical: "indigo700",
  hari_raya: "indigo700",

  // Entertainment / celebrity / film / music - pink
  entertainment: "pink600",
  hiburan: "pink600",
  celebrity: "pink600",
  selebriti: "pink600",
  film: "pink600",
  bioskop: "pink700",
  drama: "pink700",
  musik: "pink700",
  music: "pink700",
  viral: "pink700",

  // Relationships / women - rose
  relationship: "rose600",
  perempuan: "rose600",
  women: "rose600",

  // Lifestyle / food / beauty / misc - amber
  lifestyle: "amber600",
  gaya_hidup: "amber600",
  food: "amber600",
  kuliner: "amber600",
  kecantikan: "amber700",
  beauty: "amber700",
  serba_serbi: "amber700",

  // Regional / cities - stone (neutral, not a topical hue)
  bogor: "stone600",
  daerah: "stone600",
  lampung: "stone600",

  // Opinion / uncategorized - deep neutral
  opinion: "stone700",
  opini: "stone700",
  uncategorized: "stone700",
};

// Ordered for maximum perceptual distinctness between consecutive fallback
// picks, so hash-assigned custom categories don't cluster into near-
// identical tones the way a naive list ordering could.
const FALLBACK_ORDER: ColorKey[] = [
  "red600", "green600", "blue600", "orange600", "pink600", "amber600",
  "teal600", "indigo600", "cyan600", "rose600", "sky600", "emerald600",
  "red700", "green700", "blue700", "pink700", "amber700", "cyan700",
  "indigo700", "emerald700", "stone600", "stone700",
];

type ColorKey =
  | "red600" | "red700"
  | "orange600"
  | "green600" | "green700"
  | "emerald600" | "emerald700"
  | "teal600"
  | "cyan600" | "cyan700"
  | "blue600" | "blue700"
  | "sky600"
  | "indigo600" | "indigo700"
  | "pink600" | "pink700"
  | "rose600"
  | "amber600" | "amber700"
  | "stone600" | "stone700";

// Tailwind needs literal class strings to find at build time - this can't
// be constructed dynamically (e.g. `bg-${color}-600`), so every option is
// spelled out.
const COLOR_CLASSES: Record<ColorKey, { badge: string; text: string; border: string; bgSoft: string }> = {
  red600: { badge: "bg-red-600", text: "text-red-600", border: "border-red-600", bgSoft: "bg-red-50" },
  red700: { badge: "bg-red-700", text: "text-red-700", border: "border-red-700", bgSoft: "bg-red-50" },
  orange600: { badge: "bg-orange-600", text: "text-orange-600", border: "border-orange-600", bgSoft: "bg-orange-50" },
  green600: { badge: "bg-green-600", text: "text-green-600", border: "border-green-600", bgSoft: "bg-green-50" },
  green700: { badge: "bg-green-700", text: "text-green-700", border: "border-green-700", bgSoft: "bg-green-50" },
  emerald600: { badge: "bg-emerald-600", text: "text-emerald-600", border: "border-emerald-600", bgSoft: "bg-emerald-50" },
  emerald700: { badge: "bg-emerald-700", text: "text-emerald-700", border: "border-emerald-700", bgSoft: "bg-emerald-50" },
  teal600: { badge: "bg-teal-600", text: "text-teal-600", border: "border-teal-600", bgSoft: "bg-teal-50" },
  cyan600: { badge: "bg-cyan-600", text: "text-cyan-600", border: "border-cyan-600", bgSoft: "bg-cyan-50" },
  cyan700: { badge: "bg-cyan-700", text: "text-cyan-700", border: "border-cyan-700", bgSoft: "bg-cyan-50" },
  blue600: { badge: "bg-blue-600", text: "text-blue-600", border: "border-blue-600", bgSoft: "bg-blue-50" },
  blue700: { badge: "bg-blue-700", text: "text-blue-700", border: "border-blue-700", bgSoft: "bg-blue-50" },
  sky600: { badge: "bg-sky-600", text: "text-sky-600", border: "border-sky-600", bgSoft: "bg-sky-50" },
  indigo600: { badge: "bg-indigo-600", text: "text-indigo-600", border: "border-indigo-600", bgSoft: "bg-indigo-50" },
  indigo700: { badge: "bg-indigo-700", text: "text-indigo-700", border: "border-indigo-700", bgSoft: "bg-indigo-50" },
  // Pink-600 fails white-text contrast at small sizes - bumped to 700 for
  // any full-bleed (badge) usage while keeping text/border at the lighter
  // 600 tone for on-white contexts (small card labels, underlines).
  pink600: { badge: "bg-pink-700", text: "text-pink-600", border: "border-pink-600", bgSoft: "bg-pink-50" },
  pink700: { badge: "bg-pink-700", text: "text-pink-700", border: "border-pink-700", bgSoft: "bg-pink-50" },
  rose600: { badge: "bg-rose-600", text: "text-rose-600", border: "border-rose-600", bgSoft: "bg-rose-50" },
  // Amber-600 also fails white-text contrast - same badge/text split as pink.
  amber600: { badge: "bg-amber-700", text: "text-amber-600", border: "border-amber-600", bgSoft: "bg-amber-50" },
  amber700: { badge: "bg-amber-700", text: "text-amber-700", border: "border-amber-700", bgSoft: "bg-amber-50" },
  stone600: { badge: "bg-stone-600", text: "text-stone-600", border: "border-stone-600", bgSoft: "bg-stone-50" },
  stone700: { badge: "bg-stone-700", text: "text-stone-700", border: "border-stone-700", bgSoft: "bg-stone-50" },
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
