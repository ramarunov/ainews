import { getPublishedArticles } from "@/lib/public-api";
import { getRootDomain } from "@/lib/site-url";
import { SITE_NAME } from "@/lib/brand";

// RSS 2.0 feed for the English translation edition (mirrors app/feed/route.ts
// for the Indonesian site). Apex-only - the English edition has no
// per-category subdomains - so unlike the ID feed this doesn't branch on
// the Host header.
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const rootDomain = getRootDomain();
  const { data: articles } = await getPublishedArticles({ language: "en", limit: 50 });

  const channelLink = `https://${rootDomain}/en`;
  const selfUrl = `${channelLink}/feed`;

  const items = articles
    .map((article) => {
      const url = `https://${rootDomain}/en/${article.slug}`;
      const categoryName = article.primaryCategory?.name;
      return `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      ${article.publishedAt ? `<pubDate>${new Date(article.publishedAt).toUTCString()}</pubDate>` : ""}
      ${article.excerpt ? `<description>${escapeXml(article.excerpt)}</description>` : ""}
      ${categoryName ? `<category>${escapeXml(categoryName)}</category>` : ""}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`${SITE_NAME} — English`)}</title>
    <link>${channelLink}</link>
    <description>English translations of the latest Indonesian news from ${escapeXml(SITE_NAME)}.</description>
    <language>en</language>
    <atom:link href="${selfUrl}" rel="self" type="application/rss+xml" />
    <atom:link href="https://pubsubhubbub.appspot.com/" rel="hub" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
