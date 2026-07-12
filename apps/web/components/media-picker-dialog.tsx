"use client";

import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMediaList } from "@/hooks/use-media";
import type { MediaFile } from "@/lib/types";

export function MediaPickerDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (media: MediaFile) => void;
}) {
  const { data, isLoading } = useMediaList({ limit: 50, type: "image" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose from library</DialogTitle>
        </DialogHeader>
        {isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        )}
        {data && data.data.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No images uploaded yet.
          </p>
        )}
        {data && data.data.length > 0 && (
          <div className="grid max-h-96 grid-cols-4 gap-3 overflow-y-auto">
            {data.data.map((media) => (
              <button
                key={media.id}
                type="button"
                onClick={() => {
                  onSelect(media);
                  onOpenChange(false);
                }}
                className="relative aspect-square overflow-hidden rounded-md border hover:ring-2 hover:ring-ring"
              >
                {(media.publicUrl ?? media.cdnUrl) && (
                  <Image
                    src={(media.publicUrl ?? media.cdnUrl)!}
                    alt={media.altText ?? ""}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
