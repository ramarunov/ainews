import type { Metadata } from "next";
import { AuthorPage, buildAuthorMetadata } from "@/components/public/pages/author-page";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return buildAuthorMetadata({ idOrSlug: slug, locale: "en" });
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  return <AuthorPage idOrSlug={slug} locale="en" />;
}
