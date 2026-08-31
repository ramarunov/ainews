import type { Metadata } from "next";
import { ArticleCard } from "@/components/public/article-card";
import { getPublishedArticles } from "@/lib/public-api";
import { getRootDomain } from "@/lib/site-url";
import { SITE_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} — English Edition` },
  description:
    "English translations of the latest Indonesian news — politics, business, technology, sport and more.",
  alternates: {
    canonical: `https://${getRootDomain()}/en`,
    languages: {
      id: `https://${getRootDomain()}/`,
      en: `https://${getRootDomain()}/en`,
      "x-default": `https://${getRootDomain()}/`,
    },
  },
  openGraph: {
    title: `${SITE_NAME} — English Edition`,
    description: "English translations of the latest Indonesian news.",
    url: `https://${getRootDomain()}/en`,
    siteName: SITE_NAME,
    locale: "en_US",
    type: "website",
  },
};

export default async function EnglishHome() {
  const { data: articles } = await getPublishedArticles({ language: "en", limit: 24 });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <header className="mb-8 flex flex-col gap-2 border-b pb-6">
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">English Edition</h1>
        <p className="max-w-2xl text-muted-foreground">
          English translations of the latest Indonesian news from {SITE_NAME}, for the diaspora,
          expats and anyone following Indonesia from abroad.
        </p>
      </header>

      {articles.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          <p className="font-semibold">Translations are on the way.</p>
          <p className="mt-1 text-sm">
            We&rsquo;re rolling out English versions of our reporting. Check back shortly, or read
            the{" "}
            <a href={`https://${getRootDomain()}/`} className="text-primary underline">
              Indonesian edition
            </a>{" "}
            in the meantime.
          </p>
        </div>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} locale="en" />
          ))}
        </div>
      )}
    </div>
  );
}
