import { getUpcomingLiga1Matches } from "@/lib/football-api";
import { getT, type Locale } from "@/lib/i18n";
import { FootballScheduleCarousel } from "./football-schedule-carousel";

// Homepage-only widget (see app/(public)/page.tsx) - not part of the
// admin-configurable HomepageWidget system (homepage-widget.tsx), which is
// sidebar-scoped and per-org configurable; this is a fixed, full-width
// section sourced from a free third-party API (see lib/football-api.ts),
// not this org's own content. Data fetching stays server-side (async
// Server Component); the actual scroll/carousel interactivity needs client
// state, so that part lives in FootballScheduleCarousel.
export async function FootballScheduleWidget({ locale = "id" }: { locale?: Locale }) {
  // 9 (not the default 6) so there's a second and third "page" to scroll
  // to in the carousel, not just one screenful.
  const matches = await getUpcomingLiga1Matches(9);
  if (matches.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-6xl px-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 rounded-full bg-primary" />
          <h2 className="text-base font-black tracking-tight uppercase">
            {getT(locale)("football.title")}
          </h2>
        </div>
        <FootballScheduleCarousel matches={matches} />
      </div>
    </section>
  );
}
