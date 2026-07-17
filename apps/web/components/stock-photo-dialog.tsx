"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSearchStockPhotos, useAttachStockPhoto } from "@/hooks/use-stock-photos";
import { ApiError } from "@/lib/api-client";
import type { MediaFile, StockPhotoResult } from "@/lib/types";

export function StockPhotoDialog({
  open,
  onOpenChange,
  onSelect,
  defaultQuery,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (media: MediaFile) => void;
  defaultQuery?: string;
}) {
  const [query, setQuery] = useState(defaultQuery ?? "");
  const search = useSearchStockPhotos();
  const attach = useAttachStockPhoto();
  const [attachingId, setAttachingId] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      await search.mutateAsync(query.trim());
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Search failed");
    }
  };

  const handlePick = async (result: StockPhotoResult) => {
    setAttachingId(result.id);
    try {
      const media = await attach.mutateAsync({
        fullUrl: result.fullUrl,
        photographer: result.photographer,
        alt: result.alt,
      });
      onSelect(media);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to attach photo");
    } finally {
      setAttachingId(null);
    }
  };

  const results = search.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Search stock photos</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="e.g. business finance, sports stadium…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <Button type="submit" disabled={!query.trim() || search.isPending}>
            {search.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Real photos via Pexels — no AI-generated images, so nothing risks looking like a
          fabricated photo of a real event or person.
        </p>

        {search.isError && (
          <p className="py-4 text-center text-sm text-destructive">
            {search.error instanceof ApiError ? search.error.message : "Search failed"}
          </p>
        )}
        {!search.isPending && search.isSuccess && results.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No results — try a different search term.
          </p>
        )}
        {results.length > 0 && (
          <div className="grid max-h-96 grid-cols-3 gap-3 overflow-y-auto">
            {results.map((result) => (
              <button
                key={result.id}
                type="button"
                disabled={attachingId !== null}
                onClick={() => handlePick(result)}
                className="group relative aspect-video overflow-hidden rounded-md border hover:ring-2 hover:ring-ring disabled:opacity-50"
              >
                <Image
                  src={result.thumbnailUrl}
                  alt={result.alt ?? ""}
                  fill
                  className="object-cover"
                  unoptimized
                />
                {attachingId === result.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </div>
                )}
                <span className="absolute right-0 bottom-0 left-0 truncate bg-black/60 px-1.5 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100">
                  {result.photographer}
                </span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
