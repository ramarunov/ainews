import type { Metadata } from "next";
import { CategoryPage, buildCategoryMetadata } from "@/components/public/pages/category-page";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  return buildCategoryMetadata({ slug, page: Math.max(1, Number(pageParam) || 1), locale: "id" });
}

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  return <CategoryPage slug={slug} page={Math.max(1, Number(pageParam) || 1)} locale="id" />;
}
