"use client";

import { useState } from "react";
import Link from "next/link";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useArticleSearch, useSearchAnalytics, useSemanticSearch } from "@/hooks/use-search";
import type { ArticleStatus } from "@/lib/types";

function SearchAnalyticsTab() {
  const { data, isLoading, isError } = useSearchAnalytics(30);

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  }
  if (isError || !data) {
    return (
      <p className="py-8 text-center text-sm text-destructive">
        Failed to load search analytics.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Last {data.period.days} days</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{data.totalSearches}</p>
          <p className="text-sm text-muted-foreground">total searches</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top queries</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topQueries.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No searches yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Query</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topQueries.map((row) => (
                    <TableRow key={row.query}>
                      <TableCell className="font-medium">{row.query}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Zero-result queries</CardTitle>
          </CardHeader>
          <CardContent>
            {data.zeroResultQueries.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No zero-result searches — nice.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Query</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.zeroResultQueries.map((row) => (
                    <TableRow key={row.query}>
                      <TableCell className="font-medium">{row.query}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SemanticSearchTab() {
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");

  const { data, isLoading, isError } = useSemanticSearch(query, 10);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(inputValue.trim());
  };

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onSubmit}>
        <Input
          placeholder="Describe what you're looking for in your own words…"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="max-w-lg"
        />
      </form>
      <p className="text-xs text-muted-foreground">
        Meaning-based search — finds conceptually related articles even if they
        don&apos;t share any of these exact words. Only articles published since
        semantic search was enabled (or backfilled) are searchable this way.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Results</CardTitle>
        </CardHeader>
        <CardContent>
          {!query && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Enter a description to get started.
            </p>
          )}
          {query && isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">Searching…</p>
          )}
          {query && isError && (
            <p className="py-8 text-center text-sm text-destructive">Search failed.</p>
          )}
          {query && data && data.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No semantically related articles found.
            </p>
          )}
          {query && data && data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Excerpt</TableHead>
                  <TableHead className="text-right">Similarity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((result) => (
                  <TableRow key={result.id}>
                    <TableCell className="font-medium">
                      <Link href={`/articles/${result.id}`} className="hover:underline">
                        {result.title}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-96 truncate text-muted-foreground">
                      {result.excerpt ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {(result.similarity * 100).toFixed(0)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const STATUS_VARIANT: Record<ArticleStatus, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  IN_REVIEW: "outline",
  APPROVED: "outline",
  SCHEDULED: "outline",
  PUBLISHED: "default",
  ARCHIVED: "secondary",
  REJECTED: "destructive",
};

export default function SearchPage() {
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");

  const { data, isLoading, isError } = useArticleSearch({ q: query, limit: 20 });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(inputValue.trim());
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Search</h1>

      <Tabs defaultValue="search">
        <TabsList>
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="semantic">Semantic</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="flex flex-col gap-6 pt-4">
          <form onSubmit={onSubmit}>
            <Input
              placeholder="Search articles by title, subtitle, excerpt, or content…"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="max-w-lg"
            />
          </form>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Results</CardTitle>
            </CardHeader>
            <CardContent>
              {!query && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Enter a search term to get started.
                </p>
              )}
              {query && isLoading && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Searching…
                </p>
              )}
              {query && isError && (
                <p className="py-8 text-center text-sm text-destructive">
                  Search failed.
                </p>
              )}
              {query && data && data.data.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No results for &ldquo;{query}&rdquo;.
                </p>
              )}
              {query && data && data.data.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.map((article) => (
                      <TableRow key={article.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/articles/${article.id}`}
                            className="hover:underline"
                          >
                            {article.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {article.primaryCategory?.name ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[article.status]}>
                            {article.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(article.updatedAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="semantic" className="pt-4">
          <SemanticSearchTab />
        </TabsContent>

        <TabsContent value="analytics" className="pt-4">
          <SearchAnalyticsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
