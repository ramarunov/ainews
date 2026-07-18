"use client";

import { useState } from "react";
import Image from "next/image";
import { Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCategoryColors } from "@/lib/category-colors";
import { SITE_NAME } from "@/lib/brand";

export function CategoryPlaceholder({
  categoryName,
  categorySlug,
  className,
}: {
  categoryName?: string | null;
  categorySlug?: string | null;
  className?: string;
}) {
  const colors = getCategoryColors(categorySlug ?? categoryName);
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden",
        colors.badge,
        className,
      )}
    >
      <Newspaper className="absolute -right-3 -bottom-3 h-24 w-24 text-white/15" strokeWidth={1.5} />
      <span className="relative px-4 text-center text-sm font-black tracking-wide text-white/90 uppercase">
        {categoryName ?? SITE_NAME}
      </span>
    </div>
  );
}

// A featured image URL existing doesn't guarantee it's a usable photo —
// this dataset's demo images are all 1x1 test pixels, which render as a
// solid color block stretched over the whole card (not a broken-image
// icon, so it's easy to mistake for a real design bug). Rather than trust
// the URL blindly, check the image's actual decoded dimensions once it
// loads and swap to the same branded placeholder used for "no image at
// all" if it's absurdly small - a real photo will always clear this bar.
const MIN_USABLE_DIMENSION = 32;

export function SmartArticleImage({
  src,
  alt,
  categoryName,
  categorySlug,
  className,
}: {
  src: string;
  alt: string;
  categoryName?: string | null;
  categorySlug?: string | null;
  className?: string;
}) {
  const [isUnusable, setIsUnusable] = useState(false);

  if (isUnusable) {
    return <CategoryPlaceholder categoryName={categoryName} categorySlug={categorySlug} className={className} />;
  }

  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      <Image
        src={src}
        alt={alt}
        fill
        unoptimized
        className="object-cover transition-transform duration-300 group-hover:scale-105"
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth < MIN_USABLE_DIMENSION || img.naturalHeight < MIN_USABLE_DIMENSION) {
            setIsUnusable(true);
          }
        }}
        onError={() => setIsUnusable(true)}
      />
    </div>
  );
}
