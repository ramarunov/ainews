import type { Metadata } from "next";
import { HomePage, buildHomeMetadata } from "@/components/public/pages/home-page";

export function generateMetadata(): Promise<Metadata> {
  return buildHomeMetadata("en");
}

export default async function EnglishHome() {
  return <HomePage locale="en" />;
}
