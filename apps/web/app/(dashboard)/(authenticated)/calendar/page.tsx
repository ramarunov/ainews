"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useArticleCalendar, type CalendarArticle } from "@/hooks/use-articles";
import { cn } from "@/lib/utils";
import type { ArticleStatus } from "@/lib/types";

const STATUS_VARIANT: Record<ArticleStatus, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  IN_REVIEW: "outline",
  APPROVED: "outline",
  SCHEDULED: "outline",
  PUBLISHED: "default",
  ARCHIVED: "secondary",
  REJECTED: "destructive",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function articleDate(article: CalendarArticle): Date {
  const raw = article.status === "PUBLISHED" ? article.publishedAt : article.scheduledAt;
  return new Date(raw ?? article.scheduledAt ?? article.publishedAt ?? "");
}

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getUTCFullYear());
  const [month, setMonth] = useState(today.getUTCMonth() + 1); // 1-12

  const { data: articles, isLoading, isError } = useArticleCalendar(year, month);

  const goToPreviousMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    setYear(today.getUTCFullYear());
    setMonth(today.getUTCMonth() + 1);
  };

  const articlesByDay = useMemo(() => {
    const map = new Map<number, CalendarArticle[]>();
    for (const article of articles ?? []) {
      const day = articleDate(article).getUTCDate();
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(article);
    }
    return map;
  }, [articles]);

  const firstDayOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startWeekday = firstDayOfMonth.getUTCDay(); // 0 = Sunday

  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });

  const isToday = (day: number) =>
    year === today.getUTCFullYear() && month === today.getUTCMonth() + 1 && day === today.getUTCDate();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Editorial Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Scheduled and published articles for {MONTH_NAMES[month - 1]} {year}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPreviousMonth} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={goToToday}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={goToNextMonth} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
      {isError && (
        <p className="py-8 text-center text-sm text-destructive">Failed to load calendar.</p>
      )}

      {!isLoading && !isError && (
        <Card>
          <CardContent className="p-2">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                <div key={label} className="py-2">
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex h-28 flex-col gap-1 rounded-md border p-1.5",
                    cell.day === null && "border-transparent bg-transparent",
                    cell.day !== null && isToday(cell.day) && "border-primary",
                  )}
                >
                  {cell.day !== null && (
                    <>
                      <span className="shrink-0 text-xs text-muted-foreground">{cell.day}</span>
                      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                        {(articlesByDay.get(cell.day) ?? []).map((article) => (
                          <Link
                            key={article.id}
                            href={`/articles/${article.id}`}
                            className="flex flex-col gap-0.5 rounded border bg-muted/40 px-1.5 py-1 text-xs hover:bg-muted"
                          >
                            <span className="truncate font-medium">{article.title}</span>
                            <Badge
                              variant={STATUS_VARIANT[article.status]}
                              className="w-fit px-1 py-0 text-[10px]"
                            >
                              {article.status}
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
