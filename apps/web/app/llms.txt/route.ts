import { headers } from "next/headers";
import { getCategories } from "@/lib/public-api";
import { getCategoryUrl, getRootDomain, resolveHostCategory } from "@/lib/site-url";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/brand";

// llms.txt (llmstxt.org) - an emerging, not-yet-formal convention some
// publishers now serve alongside robots.txt specifically for LLM/AI
// crawlers and agents (ChatGPT, Perplexity, Claude, etc.) doing
// retrieval/GEO rather than traditional indexing: a short, plain-language
// map of what this site/host is and where its content lives, in the
// Markdown shape those tools already parse well. Host-scoped exactly like
// robots.ts/sitemap.ts/feed - the apex describes the whole aggregator +
// every top-level category, a category subdomain describes just that
// topic + its own subcategories.
export async function GET() {
  const hostname = (await headers()).get("host")?.split(":")[0] ?? "";
  const rootDomain = getRootDomain();
  const categories = await getCategories();
  const activeCategory = resolveHostCategory(hostname, rootDomain, categories);
  const apexUrl = `https://${rootDomain}`;

  const lines: string[] = [];

  if (activeCategory) {
    const children = categories.filter(
      (c) => c.parentId === activeCategory.id && c.isActive !== false,
    );
    const categoryUrl = getCategoryUrl(activeCategory, rootDomain);

    lines.push(`# ${activeCategory.name} — ${SITE_NAME}`, "");
    lines.push(
      `> ${activeCategory.description || `Berita ${activeCategory.name} terbaru dari ${SITE_NAME}.`}`,
      "",
    );
    lines.push(
      `Bagian dari ${SITE_NAME} (${apexUrl}), portal berita berbasis AI. Artikel yang dibantu AI ditandai secara transparan dengan label "AI-assisted" di setiap halaman; setiap artikel mencantumkan penulis, tanggal terbit, dan tanggal revisi terakhir.`,
      "",
    );

    if (children.length > 0) {
      lines.push("## Sub-topik", "");
      for (const child of children) {
        lines.push(`- [${child.name}](${getCategoryUrl(child, rootDomain)})`);
      }
      lines.push("");
    }

    lines.push("## Sumber Daya", "");
    lines.push(`- [Sitemap](${categoryUrl}/sitemap.xml)`);
    lines.push(`- [RSS Feed](${categoryUrl}/feed)`);
    lines.push(`- [Semua Kanal](${apexUrl})`);
  } else {
    const topLevel = categories.filter((c) => !c.parentId && c.isActive !== false);

    lines.push(`# ${SITE_NAME}`, "");
    lines.push(`> ${SITE_TAGLINE}`, "");
    lines.push(
      `${SITE_NAME} adalah portal berita berbasis AI. Artikel yang dibantu AI ditandai secara transparan dengan label "AI-assisted" di setiap halaman; setiap artikel mencantumkan penulis, tanggal terbit, dan tanggal revisi terakhir. Setiap kategori utama memiliki subdomain sendiri (lihat daftar di bawah) yang mengelompokkan artikel dan sub-topiknya.`,
      "",
    );

    if (topLevel.length > 0) {
      lines.push("## Kategori", "");
      for (const category of topLevel) {
        const desc = category.description ? `: ${category.description}` : "";
        lines.push(`- [${category.name}](${getCategoryUrl(category, rootDomain)})${desc}`);
      }
      lines.push("");
    }

    lines.push("## Sumber Daya", "");
    lines.push(`- [Sitemap](${apexUrl}/sitemap.xml)`);
    lines.push(`- [RSS Feed](${apexUrl}/feed)`);
    lines.push(`- [Tentang Kami](${apexUrl}/about)`);
  }

  return new Response(lines.join("\n") + "\n", {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
