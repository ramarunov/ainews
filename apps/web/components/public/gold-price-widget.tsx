import { getGoldPrices } from "@/lib/gold-price-api";

const DISPLAYED_WEIGHTS = [0.5, 1, 5, 10];

function formatIdr(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Homepage sidebar widget, placed directly below the ads.sidebar AdSlot
// (see app/(public)/page.tsx) - not part of the admin-configurable
// HomepageWidget system, same reasoning as FootballScheduleWidget: this is
// a fixed section sourced from a free third-party API
// (lib/gold-price-api.ts), not this org's own content.
export async function GoldPriceWidget() {
  const prices = await getGoldPrices();
  if (prices.length === 0) return null;

  const headline = prices.find((p) => p.weight === 1) ?? prices[0];
  const rows = prices.filter((p) => DISPLAYED_WEIGHTS.includes(p.weight));

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <h2 className="flex items-center gap-2 text-base font-black tracking-tight uppercase">
        <span className="h-4 w-1 rounded-full bg-primary" />
        Harga Emas Antam
      </h2>

      <div className="flex flex-col gap-0.5">
        <span className="text-2xl font-black tracking-tight">{formatIdr(headline.sellPrice)}</span>
        <span className="text-xs text-muted-foreground">per gram &middot; {formatDate(headline.recordedDate)}</span>
      </div>

      {rows.length > 1 && (
        <table className="w-full text-sm">
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.weight}>
                <td className="py-1.5 text-muted-foreground">{row.weight} gram</td>
                <td className="py-1.5 text-right font-semibold">{formatIdr(row.sellPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <a
        href="https://www.logammulia.com/id/harga-emas-hari-ini"
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-xs text-muted-foreground hover:text-primary hover:underline"
      >
        Sumber: Logam Mulia (Antam)
      </a>
    </div>
  );
}
