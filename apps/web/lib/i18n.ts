// Lightweight 2-locale i18n for the public reader site. The Indonesian
// edition lives at `/`, the English translation edition at `/en/`. Server
// Components get the locale from their route (the `/en/*` route group
// passes "en"; everything else is "id"), never from a hook.

export type Locale = "id" | "en";

export const LOCALES: Locale[] = ["id", "en"];
export const DEFAULT_LOCALE: Locale = "id";

export function isLocale(v: string | undefined | null): v is Locale {
  return v === "id" || v === "en";
}

// Prefix a site-relative path with the locale segment ("/foo" -> "/en/foo"
// for en, unchanged for id). Absolute URLs and already-prefixed paths pass
// through.
export function localizePath(path: string, locale: Locale): string {
  if (locale === "id") return path;
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  if (path === "/en" || path.startsWith("/en/")) return path;
  return `/en${path === "/" ? "" : path}`;
}

const MESSAGES = {
  id: {
    "nav.home": "Beranda",
    "nav.latest": "Berita Terbaru",
    "nav.search": "Cari",
    "article.readingTime": "menit baca",
    "article.aiAssisted": "Dibantu AI",
    "article.by": "Oleh",
    "article.author": "Penulis",
    "article.share": "Bagikan",
    "article.readAlso": "Baca juga:",
    "article.relatedBand": "Baca Juga",
    "article.moreInCategory": "Lainnya di",
    "article.keyPoints": "Poin Penting",
    "article.faqHeading": "Pertanyaan yang Sering Diajukan",
    "article.publishedOn": "Diterbitkan",
    "article.updatedOn": "Diperbarui",
    "category.emptyAuthor": "Belum ada artikel yang diterbitkan oleh penulis ini.",
    "category.emptyCategory": "Belum ada artikel di kategori ini.",
    "search.title": "Cari di",
    "search.placeholder": "Cari berita, topik, atau nama tokoh…",
    "search.button": "Cari",
    "search.prompt": "Masukkan kata kunci di atas untuk mulai mencari.",
    "search.noResults": "Tidak ada hasil untuk",
    "search.resultsFor": "hasil untuk",
    "footer.rights": "Seluruh hak cipta dilindungi.",
    "footer.poweredBy": "Didukung oleh AI Native News CMS",
    "lang.switchTo": "English",
  },
  en: {
    "nav.home": "Home",
    "nav.latest": "Latest News",
    "nav.search": "Search",
    "article.readingTime": "min read",
    "article.aiAssisted": "AI-assisted",
    "article.by": "By",
    "article.author": "Author",
    "article.share": "Share",
    "article.readAlso": "Read also:",
    "article.relatedBand": "Read Also",
    "article.moreInCategory": "More in",
    "article.keyPoints": "Key Points",
    "article.faqHeading": "Frequently Asked Questions",
    "article.publishedOn": "Published",
    "article.updatedOn": "Updated",
    "category.emptyAuthor": "This author has no published articles yet.",
    "category.emptyCategory": "No articles in this category yet.",
    "search.title": "Search",
    "search.placeholder": "Search news, topics, or people…",
    "search.button": "Search",
    "search.prompt": "Enter a keyword above to start searching.",
    "search.noResults": "No results for",
    "search.resultsFor": "results for",
    "footer.rights": "All rights reserved.",
    "footer.poweredBy": "Powered by AI Native News CMS",
    "lang.switchTo": "Bahasa Indonesia",
  },
} as const;

export type MessageKey = keyof (typeof MESSAGES)["id"];

/** Returns a `t(key)` translator bound to `locale`. */
export function getT(locale: Locale) {
  const dict = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  return (key: MessageKey): string => dict[key] ?? MESSAGES.id[key] ?? key;
}

export const OG_LOCALE: Record<Locale, string> = {
  id: "id_ID",
  en: "en_US",
};
