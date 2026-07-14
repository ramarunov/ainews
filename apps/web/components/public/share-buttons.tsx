"use client";

import { useState } from "react";
import { Link2, Share2, X } from "lucide-react";

export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const shareLinks = [
    {
      label: "Share on X",
      icon: X,
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
    },
    {
      label: "Share on Facebook",
      icon: Share2,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
  ];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser — not worth
      // surfacing an error toast for a share button on a public page.
    }
  };

  return (
    <div className="flex items-center gap-2">
      {shareLinks.map(({ label, icon: Icon, href }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={label}
          className="flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground hover:border-primary hover:text-primary"
        >
          <Icon className="h-4 w-4" />
        </a>
      ))}
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy link"
        className="flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground hover:border-primary hover:text-primary"
      >
        <Link2 className="h-4 w-4" />
      </button>
      {copied && <span className="text-xs text-muted-foreground">Link copied</span>}
    </div>
  );
}
