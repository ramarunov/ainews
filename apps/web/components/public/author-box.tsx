import Image from "next/image";
import Link from "next/link";
import type { PublicAuthor } from "@/lib/types";

export function AuthorBox({ author }: { author: PublicAuthor }) {
  const initial = (author.displayName ?? "?").charAt(0).toUpperCase();

  return (
    <div className="mt-10 flex flex-col gap-4 rounded-xl border bg-[var(--zone)] p-6 sm:flex-row sm:items-start">
      {author.avatarUrl ? (
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted shadow-sm">
          <Image src={author.avatarUrl} alt={author.displayName ?? ""} fill className="object-cover" unoptimized />
        </div>
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-black text-primary-foreground shadow-sm">
          {initial}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Ditulis oleh</p>
        <Link href={`/author/${author.id}`} className="w-fit text-lg font-black hover:text-primary hover:underline">
          {author.displayName}
        </Link>
        {author.bio && <p className="text-sm leading-relaxed text-muted-foreground">{author.bio}</p>}
        <Link
          href={`/author/${author.id}`}
          className="mt-1 w-fit text-sm font-bold text-primary hover:underline"
        >
          Lihat semua artikel oleh {author.displayName} &rarr;
        </Link>
      </div>
    </div>
  );
}
