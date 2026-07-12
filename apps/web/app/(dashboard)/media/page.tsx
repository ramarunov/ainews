"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDeleteMedia, useMediaList, useUploadMedia } from "@/hooks/use-media";
import { ApiError } from "@/lib/api-client";

const TYPE_OPTIONS = [
  { value: "ALL", label: "All types" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "application", label: "Documents" },
];

export default function MediaLibraryPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("ALL");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError } = useMediaList({
    page,
    limit: 24,
    search: search || undefined,
    type: type === "ALL" ? undefined : type,
  });
  const uploadMedia = useUploadMedia();
  const deleteMedia = useDeleteMedia();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadMedia.mutateAsync(file);
      toast.success("File uploaded");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMedia.mutateAsync(id);
      toast.success("File deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Media Library</h1>
        <label
          className={cn(
            buttonVariants({ variant: "default" }),
            "cursor-pointer",
            uploadMedia.isPending && "pointer-events-none opacity-50",
          )}
        >
          {uploadMedia.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Upload
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
          />
        </label>
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-4 space-y-0">
          <Input
            placeholder="Search media…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="max-w-xs"
          />
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v ?? "ALL");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <CardTitle className="sr-only">Media</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          )}
          {isError && (
            <p className="py-8 text-center text-sm text-destructive">
              Failed to load media.
            </p>
          )}
          {data && data.data.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No media files yet.
            </p>
          )}
          {data && data.data.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {data.data.map((media) => {
                  const url = media.publicUrl ?? media.cdnUrl;
                  const isImage = media.mimeType.startsWith("image/");
                  return (
                    <div key={media.id} className="group relative">
                      <div className="relative aspect-square overflow-hidden rounded-md border bg-muted">
                        {isImage && url ? (
                          <Image
                            src={url}
                            alt={media.altText ?? media.originalName}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                            {media.originalName}
                          </div>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {media.originalName}
                      </p>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => handleDelete(media.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">
                  Page {data.meta.page} of {Math.max(data.meta.totalPages, 1)} ·{" "}
                  {data.meta.total} total
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.meta.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
