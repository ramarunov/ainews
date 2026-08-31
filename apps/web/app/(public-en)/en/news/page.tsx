import type { Metadata } from "next";
import { NewsPage, buildNewsMetadata } from "@/components/public/pages/news-page";

export const metadata: Metadata = buildNewsMetadata("en");

interface Props {
  searchParams: Promise<{ page?: string }>;
}

export default async function Page({ searchParams }: Props) {
  const { page: pageParam } = await searchParams;
  return <NewsPage page={Math.max(1, Number(pageParam) || 1)} locale="en" />;
}
