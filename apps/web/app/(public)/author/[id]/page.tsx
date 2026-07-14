import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/public/article-card";
import { getAuthorProfile, getPublishedArticles } from "@/lib/public-api";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const author = await getAuthorProfile(id);
  if (!author) return {};
  return {
    title: `${author.displayName ?? "Author"} — Pulse Daily`,
    description: author.bio ?? `Articles by ${author.displayName} on Pulse Daily.`,
  };
}

export default async function AuthorPage({ params }: Props) {
  const { id } = await params;
  const author = await getAuthorProfile(id);
  if (!author) notFound();

  const { data: articles } = await getPublishedArticles({ authorId: id, limit: 20 });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <div className="flex items-center gap-4 border-b pb-6">
        {author.avatarUrl ? (
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
            <Image src={author.avatarUrl} alt={author.displayName ?? ""} fill className="object-cover" unoptimized />
          </div>
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary text-2xl font-black text-primary-foreground">
            {(author.displayName ?? "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-black tracking-tight">{author.displayName}</h1>
          {author.bio && <p className="mt-1 text-muted-foreground">{author.bio}</p>}
        </div>
      </div>

      {articles.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">
          No published articles from this author yet.
        </p>
      )}

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} variant="medium" />
        ))}
      </div>
    </div>
  );
}
