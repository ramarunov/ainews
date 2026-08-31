import type { Metadata } from "next";
import { TagPage, buildTagMetadata } from "@/components/public/pages/tag-page";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  return buildTagMetadata({ slug, page: Math.max(1, Number(pageParam) || 1), locale: "en" });
}

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  return <TagPage slug={slug} page={Math.max(1, Number(pageParam) || 1)} locale="en" />;
}
