import { getUpcomingLiga1Matches, type FootballMatch } from "@/lib/football-api";

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
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs font-black text-muted-foreground">
        {name.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  // Plain <img>, not next/image - badges are small (~50px) icons from a
  // third-party host (r2.thesportsdb.com) not worth adding to
  // next.config.ts's image remotePatterns just for this.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={name} className="h-10 w-10 object-contain" />;
}

function MatchCard({ match }: { match: FootballMatch }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-4 text-center">
      <span className="text-xs font-semibold text-muted-foreground">
        {formatMatchDate(match.date)}
        {match.time && ` · ${match.time.slice(0, 5)} WIB`}
      </span>
      <div className="flex w-full items-center justify-center gap-3">
        <div className="flex flex-1 flex-col items-center gap-1.5">
          <TeamBadge src={match.homeTeamBadge} name={match.homeTeam} />
          <span className="line-clamp-2 text-xs font-bold leading-tight">{match.homeTeam}</span>
        </div>
        <span className="text-xs font-black text-muted-foreground/60">VS</span>
        <div className="flex flex-1 flex-col items-center gap-1.5">
          <TeamBadge src={match.awayTeamBadge} name={match.awayTeam} />
          <span className="line-clamp-2 text-xs font-bold leading-tight">{match.awayTeam}</span>
        </div>
      </div>
      {match.venue && (
        <span className="line-clamp-1 text-xs text-muted-foreground">{match.venue}</span>
      )}
    </div>
  );
}

// Homepage-only widget (see app/(public)/page.tsx) - not part of the
// admin-configurable HomepageWidget system (homepage-widget.tsx), which is
// sidebar-scoped and per-org configurable; this is a fixed, full-width
// section sourced from a free third-party API (see lib/football-api.ts),
// not this org's own content.
export async function FootballScheduleWidget() {
  const matches = await getUpcomingLiga1Matches();
  if (matches.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-6xl px-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 rounded-full bg-primary" />
          <h2 className="text-base font-black tracking-tight uppercase">
            Jadwal Pertandingan Liga 1
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      </div>
    </section>
  );
}
