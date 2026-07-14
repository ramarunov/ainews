import { PublicHeader } from "@/components/public/public-header";
import { PublicFooter } from "@/components/public/public-footer";
import { getCategories } from "@/lib/public-api";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const categories = await getCategories();

  return (
    <div className="pulse-daily flex min-h-full flex-1 flex-col bg-background text-foreground">
      <PublicHeader categories={categories} />
      <main className="flex flex-1 flex-col">{children}</main>
      <PublicFooter categories={categories} />
    </div>
  );
}
