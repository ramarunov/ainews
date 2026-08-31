import Image from "next/image";
import Link from "next/link";
import type { PublicAuthor } from "@/lib/types";
import { getT, type Locale } from "@/lib/i18n";

export function AuthorBox({ author, locale = "id" }: { author: PublicAuthor; locale?: Locale }) {
  const initial = (author.displayName ?? "?").charAt(0).toUpperCase();
  const t = getT(locale);
  const href = `${locale === "en" ? "/en/author" : "/author"}/${author.slug ?? author.id}`;
  const bio = locale === "en" && author.bioEn ? author.bioEn : author.bio;

  return (
    <div className="mt-10 flex flex-col gap-4 rounded-xl border bg-[var(--zone)] p-6 sm:flex-row sm:items-start">
      {author.avatarUrl ? (
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted shadow-sm">
          <Image src={author.avatarUrl} alt={author.displayName ?? ""} fill className="object-cover" />
        </div>
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-black text-primary-foreground shadow-sm">
          {initial}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
          {t("article.writtenBy")}
        </p>
        <Link href={href} className="w-fit text-lg font-black hover:text-primary hover:underline">
          {author.displayName}
        </Link>
        {bio && <p className="text-sm leading-relaxed text-muted-foreground">{bio}</p>}
        <Link href={href} className="mt-1 w-fit text-sm font-bold text-primary hover:underline">
          {t("article.moreByAuthor")} {author.displayName} &rarr;
        </Link>
      </div>
    </div>
  );
}
