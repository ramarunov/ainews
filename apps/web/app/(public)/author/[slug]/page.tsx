import type { Metadata } from "next";
import { AuthorPage, buildAuthorMetadata } from "@/components/public/pages/author-page";

// ISR: cache the rendered page at the edge, revalidate in the background.
export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return buildAuthorMetadata({ idOrSlug: slug, locale: "id" });
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  return <AuthorPage idOrSlug={slug} locale="id" />;
}
