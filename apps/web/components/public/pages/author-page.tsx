import Image from "next/image";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ArticleCard } from "@/components/public/article-card";
import { getAuthorProfile, getPublishedArticles } from "@/lib/public-api";
import { getRootDomain } from "@/lib/site-url";
import { SITE_NAME } from "@/lib/brand";
import { getT, type Locale } from "@/lib/i18n";

// getAuthorProfile() accepts either the author's slug (/author/{slug}) or a
// raw user id (older links / not-yet-backfilled authors).
interface Args {
  idOrSlug: string;
  locale: Locale;
}

export async function buildAuthorMetadata({ idOrSlug, locale }: Args): Promise<Metadata> {
  const author = await getAuthorProfile(idOrSlug);
  if (!author) return {};
  const t = getT(locale);
  return {
    title: author.displayName ?? t("article.author"),
    description: author.bio ?? `Articles by ${author.displayName} on ${SITE_NAME}.`,
  };
}

export async function AuthorPage({ idOrSlug, locale }: Args) {
  const t = getT(locale);
  const lang = locale === "en" ? "en" : undefined;
  const authorBase = locale === "en" ? "/en/author" : "/author";

  const author = await getAuthorProfile(idOrSlug);
  if (!author) notFound();

  // Once an author has a real slug that's the one canonical URL - redirect
  // a /author/{uuid} (or stale-slug) hit there.
  if (author.slug && author.slug !== idOrSlug) {
    permanentRedirect(`${authorBase}/${author.slug}`);
  }

  const { data: articles } = await getPublishedArticles({
    authorId: author.id,
    limit: 20,
    language: lang,
  });

  const authorUrl = `https://${getRootDomain()}${authorBase}/${author.slug ?? author.id}`;

  const sameAs = author.sameAs?.filter(Boolean) ?? [];
  const knowsAbout = author.knowsAbout?.filter(Boolean) ?? [];
  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: author.displayName,
    description: author.bio || undefined,
    image: author.avatarUrl || undefined,
    url: authorUrl,
    jobTitle: author.jobTitle || undefined,
    worksFor: { "@type": "NewsMediaOrganization", name: SITE_NAME },
    sameAs: sameAs.length > 0 ? sameAs : undefined,
    knowsAbout: knowsAbout.length > 0 ? knowsAbout : undefined,
  };

  return (
    <div className="flex flex-col gap-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema).replace(/</g, "\\u003c") }}
      />
      <div className="bg-[var(--zone)] py-10">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-5 px-4">
          {author.avatarUrl ? (
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-muted shadow-sm">
              <Image src={author.avatarUrl} alt={author.displayName ?? ""} fill className="object-cover" />
            </div>
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary text-2xl font-black text-primary-foreground shadow-sm">
              {(author.displayName ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
              {t("article.author")}
            </p>
            <h1 className="text-2xl font-black tracking-tight md:text-3xl">{author.displayName}</h1>
            {author.jobTitle && (
              <p className="mt-0.5 text-sm font-semibold text-primary">{author.jobTitle}</p>
            )}
            {author.bio && <p className="mt-1 max-w-2xl text-muted-foreground">{author.bio}</p>}
            {sameAs.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {sameAs.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="me noopener noreferrer"
                    className="text-muted-foreground underline hover:text-primary"
                  >
                    {new URL(url).hostname.replace(/^www\./, "")}
                  </a>
                ))}
              </div>
            )}
            {knowsAbout.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {knowsAbout.map((topic) => (
                  <span
                    key={topic}
                    className="rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-16">
        {articles.length === 0 && (
          <p className="py-12 text-center text-muted-foreground">{t("category.emptyAuthor")}</p>
        )}

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} variant="medium" locale={locale} />
          ))}
        </div>
      </div>
    </div>
  );
}
