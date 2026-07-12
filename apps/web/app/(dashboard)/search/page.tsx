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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useArticleSearch } from "@/hooks/use-search";
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
    </div>
  );
}
