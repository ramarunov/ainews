"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, MoreHorizontal } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useCreateTag,
  useDeleteTag,
  useTags,
  useUpdateTag,
} from "@/hooks/use-taxonomy";
import { ApiError } from "@/lib/api-client";
import type { Tag } from "@/lib/types";

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

const tagSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional().or(z.literal("")),
  color: z
    .string()
    .regex(HEX_COLOR_RE, "Must be a hex color like #FF5733")
    .optional()
    .or(z.literal("")),
});

type TagFormValues = z.infer<typeof tagSchema>;

function TagFormDialog({
  open,
  onOpenChange,
  tag,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag?: Tag;
}) {
  const isEditing = !!tag;
  const createTag = useCreateTag();
  const updateTag = useUpdateTag(tag?.id ?? "");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TagFormValues>({
    resolver: zodResolver(tagSchema),
    values: {
      name: tag?.name ?? "",
      description: tag?.description ?? "",
      color: tag?.color ?? "",
    },
  });

  const onSubmit = async (values: TagFormValues) => {
    const payload = {
      name: values.name,
      description: values.description || undefined,
      color: values.color || undefined,
    };
    try {
      if (isEditing) {
        await updateTag.mutateAsync(payload);
        toast.success("Tag updated");
      } else {
        await createTag.mutateAsync(payload);
        toast.success("Tag created");
      }
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    }
  };

  const saving = createTag.isPending || updateTag.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit tag" : "New tag"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tag-name">Name</Label>
            <Input id="tag-name" {...register("name")} />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tag-description">Description</Label>
            <Textarea id="tag-description" rows={2} {...register("description")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tag-color">Color</Label>
            <Input id="tag-color" placeholder="#FF5733" {...register("color")} />
            {errors.color && (
              <p className="text-sm text-destructive">{errors.color.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function TagsPage() {
  const { data, isLoading, isError } = useTags();
  const deleteTag = useDeleteTag();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | undefined>(undefined);

  const openCreate = () => {
    setEditingTag(undefined);
    setDialogOpen(true);
  };

  const openEdit = (tag: Tag) => {
    setEditingTag(tag);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTag.mutateAsync(id);
      toast.success("Tag deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    }
  };

  const tags = data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tags</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Tag
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All tags</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          )}
          {isError && (
            <p className="py-8 text-center text-sm text-destructive">
              Failed to load tags.
            </p>
          )}
          {!isLoading && tags.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No tags yet.
            </p>
          )}
          {tags.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tags.map((tag) => (
                  <TableRow key={tag.id}>
                    <TableCell className="font-medium">
                      <Badge
                        variant="outline"
                        style={
                          tag.color
                            ? { borderColor: tag.color, color: tag.color }
                            : undefined
                        }
                      >
                        {tag.name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{tag.slug}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className={buttonVariants({ variant: "ghost", size: "icon" })}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(tag)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleDelete(tag.id)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <TagFormDialog open={dialogOpen} onOpenChange={setDialogOpen} tag={editingTag} />
    </div>
  );
}
