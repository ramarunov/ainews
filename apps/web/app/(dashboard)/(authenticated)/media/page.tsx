"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Pencil, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useDeleteMedia,
  useGenerateAltText,
  useMediaList,
  useUpdateMedia,
  useUploadMedia,
} from "@/hooks/use-media";
import { ApiError } from "@/lib/api-client";
import type { MediaFile } from "@/lib/types";

function EditMediaDialog({
  media,
  onOpenChange,
}: {
  media: MediaFile;
  onOpenChange: (open: boolean) => void;
}) {
  // Keyed by media.id from the parent, so a fresh instance (and fresh
  // initial state below) mounts whenever a different file is opened.
  const [altText, setAltText] = useState(media.altText ?? "");
  const [caption, setCaption] = useState(media.caption ?? "");
  const updateMedia = useUpdateMedia();
  const generateAltText = useGenerateAltText();
  const isImage = media.mimeType.startsWith("image/");

  const handleGenerate = async () => {
    try {
      const updated = await generateAltText.mutateAsync(media.id);
      setAltText(updated.altText ?? "");
      toast.success("Alt text generated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to generate alt text");
    }
  };

  const handleSave = async () => {
    try {
      await updateMedia.mutateAsync({ id: media.id, altText, caption });
      toast.success("Media details saved");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit media details</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="media-alt-text">Alt text</Label>
              {isImage && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={generateAltText.isPending}
                  onClick={handleGenerate}
                >
                  {generateAltText.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Generate with AI
                </Button>
              )}
            </div>
            <Textarea
              id="media-alt-text"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="Describe what's in the image for screen readers"
              rows={2}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="media-caption">Caption</Label>
            <Input
              id="media-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Optional caption shown alongside the image"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={updateMedia.isPending}>
            {updateMedia.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
  const [editingMedia, setEditingMedia] = useState<MediaFile | null>(null);
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
                      <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          onClick={() => setEditingMedia(media)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          onClick={() => handleDelete(media.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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

      {editingMedia && (
        <EditMediaDialog
          key={editingMedia.id}
          media={editingMedia}
          onOpenChange={(open) => !open && setEditingMedia(null)}
        />
      )}
    </div>
  );
}
