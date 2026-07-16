import { PublicHeader } from "@/components/public/public-header";
import { PublicFooter } from "@/components/public/public-footer";
import { getCategories } from "@/lib/public-api";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const categories = await getCategories();
  // Rendered once per request/revalidate on the server and passed down as a
  // plain string — avoids a client-side `new Date()` in PublicHeader, which
  // would mismatch between server and client render (hydration warning).
  const today = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="pulse-daily flex min-h-full flex-1 flex-col bg-background text-foreground">
      <PublicHeader categories={categories} today={today} />
      <main className="flex flex-1 flex-col">{children}</main>
      <PublicFooter categories={categories} />
    </div>
  );
}
