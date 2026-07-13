"use client";

import { useState } from "react";
import Link from "next/link";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAnalyticsDashboard } from "@/hooks/use-analytics";

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold">{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}

function DailyViewsChart({ data }: { data: { date: string; views: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.views));

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No views recorded yet.</p>;
  }

  return (
    <div className="flex h-40 items-end gap-1">
      {data.map((day) => (
        <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-primary/70"
            style={{ height: `${Math.max(2, (day.views / max) * 100)}%` }}
            title={`${new Date(day.date).toLocaleDateString()}: ${day.views} views`}
          />
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError } = useAnalyticsDashboard(days);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Article views and reach across your organization.
          </p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && <p className="text-sm text-destructive">Failed to load analytics.</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard label="Total views" value={data.totalViews} />
            <SummaryCard label="Total articles" value={data.totalArticles} />
            <SummaryCard label={`Published (last ${days}d)`} value={data.publishedInPeriod} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily views</CardTitle>
            </CardHeader>
            <CardContent>
              <DailyViewsChart data={data.dailyViews} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top articles</CardTitle>
            </CardHeader>
            <CardContent>
              {data.topArticles.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No article views yet.
                </p>
              )}
              <div className="flex flex-col divide-y">
                {data.topArticles.map((article) => (
                  <div
                    key={article.articleId}
                    className="flex items-center justify-between py-3"
                  >
                    {article.slug ? (
                      <Link
                        href={`/articles/${article.articleId}`}
                        className="font-medium hover:underline"
                      >
                        {article.title}
                      </Link>
                    ) : (
                      <span className="font-medium text-muted-foreground">
                        {article.title ?? "Deleted article"}
                      </span>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {article.views.toLocaleString()} views
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
