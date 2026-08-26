"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FootballMatch } from "@/lib/football-api";

function formatMatchDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function TeamBadge({ src, name }: { src?: string; name: string }) {
  if (!src) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-black text-muted-foreground">
        {name.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  // Plain <img>, not next/image - badges are small (~50px) icons from a
  // third-party host (r2.thesportsdb.com) not worth adding to
  // next.config.ts's image remotePatterns just for this.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={name} className="h-12 w-12 shrink-0 object-contain" />;
}

function MatchCard({ match }: { match: FootballMatch }) {
  return (
    <div
      // Fixed width, not a grid fraction - a wide-enough card is what
      // actually keeps a long team name/badge from overflowing (the
      // earlier 6-per-row grid squeezed cards too narrow for that);
      // scroll-snap-align makes each card settle fully into view instead
      // of stopping half-scrolled.
      className="flex w-64 shrink-0 flex-col items-center gap-3 rounded-lg border bg-card p-4 text-center [scroll-snap-align:start]"
    >
      <span className="text-xs font-semibold text-muted-foreground">
        {formatMatchDate(match.date)}
        {match.time && ` · ${match.time.slice(0, 5)} WIB`}
      </span>
      <div className="flex w-full items-center justify-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <TeamBadge src={match.homeTeamBadge} name={match.homeTeam} />
          <span className="line-clamp-2 w-full text-xs font-bold leading-tight break-words">
            {match.homeTeam}
          </span>
        </div>
        <span className="shrink-0 text-xs font-black text-muted-foreground/60">VS</span>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <TeamBadge src={match.awayTeamBadge} name={match.awayTeam} />
          <span className="line-clamp-2 w-full text-xs font-bold leading-tight break-words">
            {match.awayTeam}
          </span>
        </div>
      </div>
      {match.venue && (
        <span className="line-clamp-1 text-xs text-muted-foreground">{match.venue}</span>
      )}
    </div>
  );
}

// Same wheel-to-horizontal + click-arrow pattern as the header's category
// nav strip (public-header.tsx) - a mouse has no native horizontal-scroll
// gesture, so without this the carousel would look "stuck" past the first
// 3 visible cards. Shows 3 cards per view on desktop (3 * 16rem card width
// fits the 6xl content column), scroll-snap keeps a card from settling
// half-visible when scrolling stops.
export function FootballScheduleCarousel({ matches }: { matches: FootballMatch[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateScrollButtons();
    window.addEventListener("resize", updateScrollButtons);
    return () => window.removeEventListener("resize", updateScrollButtons);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches.length]);

  const scrollBy = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }
  };

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={updateScrollButtons}
        onWheel={handleWheel}
        className="no-scrollbar flex gap-4 overflow-x-auto [scroll-snap-type:x_mandatory]"
      >
        {matches.map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}
      </div>

      {canScrollLeft && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 h-full w-10 bg-gradient-to-r from-background to-transparent"
          />
          <button
            type="button"
            aria-label="Geser jadwal ke kiri"
            onClick={() => scrollBy(-264)}
            className={cn(
              "absolute top-1/2 left-1 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-muted",
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </>
      )}

      {canScrollRight && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 h-full w-10 bg-gradient-to-l from-background to-transparent"
          />
          <button
            type="button"
            aria-label="Geser jadwal ke kanan"
            onClick={() => scrollBy(264)}
            className="absolute top-1/2 right-1 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}
