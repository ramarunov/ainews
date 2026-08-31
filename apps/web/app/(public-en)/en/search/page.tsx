import type { Metadata } from "next";
import { SearchPage, buildSearchMetadata } from "@/components/public/pages/search-page";

export const metadata: Metadata = buildSearchMetadata("en");

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function Page({ searchParams }: Props) {
  const { q = "", page: pageParam } = await searchParams;
  return <SearchPage q={q} page={Math.max(1, Number(pageParam) || 1)} locale="en" />;
}
