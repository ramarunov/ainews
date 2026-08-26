// Homepage "Jadwal Pertandingan Liga 1" widget data source - TheSportsDB
// (thesportsdb.com), a free, keyless-for-practical-purposes API (the "123"
// test key is Google's own documented public free-tier key, not a secret
// this app owns - confirmed live it works today with no signup).
//
// 4790 is TheSportsDB's league id for "Indonesian Super League" (Liga 1).
const LEAGUE_ID = "4790";
const API_BASE = "https://www.thesportsdb.com/api/v1/json/123";

export interface FootballMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamBadge?: string;
  awayTeamBadge?: string;
  /** ISO date, e.g. "2026-09-04" */
  date: string;
  /** As returned by the API - unclear whether this is WIB or UTC (no
   * documentation either way); displayed as-is with a "WIB" label as a
   * best-effort assumption. */
  time?: string;
  venue?: string;
}

interface RawEvent {
  idEvent: string;
  strHomeTeam: string;
  strAwayTeam: string;
  strHomeTeamBadge?: string;
  strAwayTeamBadge?: string;
  dateEvent: string;
  strTime?: string;
  strVenue?: string;
}

// TheSportsDB's season lookup endpoint (search_all_seasons.php) turned out
// to be stale for this league (only listed seasons up through "2023-2024"
// even though eventsseason.php already has real fixtures for "2026-2027"),
// so the current season string can't be looked up via their API - computed
// here instead from today's date, matching the Jul-Jun season convention
// this league's current data uses. Falls back to a single-year format
// (used in this league's older seasons per search_all_seasons.php) if the
// primary guess comes back empty.
function currentSeasonGuesses(): string[] {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-12
  const spanGuess = month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  const singleYearGuess = String(year);
  return [spanGuess, singleYearGuess];
}

async function fetchSeasonEvents(season: string): Promise<RawEvent[]> {
  const url = `${API_BASE}/eventsseason.php?id=${LEAGUE_ID}&s=${encodeURIComponent(season)}`;
  // 30-minute revalidate: fixtures don't change minute-to-minute, and this
  // is a courtesy to a free third-party API rather than a rate-limit
  // necessity (their free tier allows 30 req/min).
  const res = await fetch(url, { next: { revalidate: 1800 } });
  if (!res.ok) return [];
  const data = (await res.json()) as { events?: RawEvent[] | null };
  return data.events ?? [];
}

// Never throws - a homepage widget going down because a free third-party
// API changed shape or is temporarily unreachable is not an acceptable
// trade-off, so every failure mode here just yields an empty list, which
// the widget component treats as "don't render this section."
export async function getUpcomingLiga1Matches(limit = 6): Promise<FootballMatch[]> {
  try {
    let events: RawEvent[] = [];
    for (const season of currentSeasonGuesses()) {
      events = await fetchSeasonEvents(season);
      if (events.length > 0) break;
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    return events
      .filter((e) => e.dateEvent && e.dateEvent >= todayIso)
      .sort((a, b) => a.dateEvent.localeCompare(b.dateEvent))
      .slice(0, limit)
      .map((e) => ({
        id: e.idEvent,
        homeTeam: e.strHomeTeam,
        awayTeam: e.strAwayTeam,
        homeTeamBadge: e.strHomeTeamBadge || undefined,
        awayTeamBadge: e.strAwayTeamBadge || undefined,
        date: e.dateEvent,
        time: e.strTime || undefined,
        venue: e.strVenue || undefined,
      }));
  } catch {
    return [];
  }
}
