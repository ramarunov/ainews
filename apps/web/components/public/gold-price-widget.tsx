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
    // Warm gold-toned treatment (amber, not the site's brand primary) is a
    // deliberate one-off exception - this widget's subject literally is
    // gold, and the color makes it read as its own distinct thing in the
    // sidebar rather than blending into every other bordered card there.
    <div className="flex flex-col gap-4 rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-100 p-4">
      <h2 className="flex items-center gap-2 text-base font-black tracking-tight text-amber-900 uppercase">
        <span className="h-4 w-1 rounded-full bg-amber-500" />
        Harga Emas Antam
      </h2>

      <div className="flex flex-col gap-0.5">
        <span className="text-2xl font-black tracking-tight text-amber-800">
          {formatIdr(headline.sellPrice)}
        </span>
        <span className="text-xs text-amber-700/70">
          per gram &middot; {formatDate(headline.recordedDate)}
        </span>
      </div>

      {rows.length > 1 && (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-amber-200">
            {rows.map((row) => (
              <tr key={row.weight}>
                <td className="py-1.5 text-amber-700/80">{row.weight} gram</td>
                <td className="py-1.5 text-right font-semibold text-amber-900">
                  {formatIdr(row.sellPrice)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <a
        href="https://www.logammulia.com/id/harga-emas-hari-ini"
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-xs text-amber-700/70 hover:text-amber-900 hover:underline"
      >
        Sumber: Logam Mulia (Antam)
      </a>
    </div>
  );
}
