import Image from "next/image";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { ArticleCard } from "@/components/public/article-card";
import { getAuthorProfile, getPublishedArticles } from "@/lib/public-api";
import { getRootDomain } from "@/lib/site-url";
import { SITE_NAME } from "@/lib/brand";

interface Props {
  // Named `slug` to match the current URL shape (/author/{slug}), but
  // getAuthorProfile() also accepts a raw user id here - see
  // UsersService.generateSlug and PublicSiteService.getAuthorProfile for why
  // both need to keep working.
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const author = await getAuthorProfile(slug);
  if (!author) return {};
  return {
    // No manual "— SITE_NAME" suffix - the root layout's title template
    // already appends it to every page title.
    title: author.displayName ?? "Author",
    description: author.bio ?? `Articles by ${author.displayName} on ${SITE_NAME}.`,
  };
}

export default async function AuthorPage({ params }: Props) {
  const { slug } = await params;
  const author = await getAuthorProfile(slug);
  if (!author) notFound();

  // A pre-slug link (/author/{uuid}) or a not-yet-backfilled author's id
  // still resolves above, but once the author has a real slug that's the
  // one canonical URL - redirect there instead of rendering a second copy.
  if (author.slug && author.slug !== slug) {
    const rootDomain = getRootDomain();
    const requestHostname = (await headers()).get("host")?.split(":")[0] ?? "";
    if (!requestHostname || requestHostname === rootDomain) {
      permanentRedirect(`/author/${author.slug}`);
    }
  }

  const { data: articles } = await getPublishedArticles({ authorId: author.id, limit: 20 });

  const authorUrl = `https://${getRootDomain()}/author/${author.slug ?? author.id}`;

  // A dereferenceable Person entity (not just a bare name string on each
  // article's NewsArticle.author) is what Google's E-E-A-T guidance
  // actually wants - see SeoService.generateArticleSchema's author.url,
  // which links back to this same page.
  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: author.displayName,
    description: author.bio || undefined,
    image: author.avatarUrl || undefined,
    url: authorUrl,
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
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Penulis</p>
            <h1 className="text-2xl font-black tracking-tight md:text-3xl">{author.displayName}</h1>
            {author.bio && <p className="mt-1 max-w-2xl text-muted-foreground">{author.bio}</p>}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-16">
        {articles.length === 0 && (
          <p className="py-12 text-center text-muted-foreground">
            Belum ada artikel yang diterbitkan oleh penulis ini.
          </p>
        )}

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} variant="medium" />
          ))}
        </div>
      </div>
    </div>
  );
}
