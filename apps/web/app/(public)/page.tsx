import type { Metadata } from "next";
import { HomePage, buildHomeMetadata } from "@/components/public/pages/home-page";

// Thin wrapper - the homepage view (shared with the English edition at
// app/(public-en)/en/page.tsx) lives in components/public/pages/home-page.tsx.
export function generateMetadata(): Promise<Metadata> {
  return buildHomeMetadata("id");
}

export default async function Page() {
  return <HomePage locale="id" />;
}
