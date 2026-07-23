"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, MoreHorizontal } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { RichTextEditor } from "@/components/rich-text-editor";
import { useCreatePage, useDeletePage, usePages, useUpdatePage } from "@/hooks/use-pages";
import { ApiError } from "@/lib/api-client";
import { getRootDomain } from "@/lib/site-url";
import type { Page } from "@/lib/types";

const pageSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  slug: z.string().max(255).optional().or(z.literal("")),
  content: z.string().optional().or(z.literal("")),
  metaTitle: z.string().max(255).optional().or(z.literal("")),
  metaDescription: z.string().max(500).optional().or(z.literal("")),
  isPublished: z.boolean(),
});

type PageFormValues = z.infer<typeof pageSchema>;

function PageFormDialog({
  open,
  onOpenChange,
  page,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page?: Page;
}) {
  const isEditing = !!page;
  const createPage = useCreatePage();
  const updatePage = useUpdatePage(page?.id ?? "");
  const rootDomain = getRootDomain();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors },
  } = useForm<PageFormValues>({
    resolver: zodResolver(pageSchema),
    values: {
      title: page?.title ?? "",
      slug: page?.slug ?? "",
      content: page?.content ?? "",
      metaTitle: page?.metaTitle ?? "",
      metaDescription: page?.metaDescription ?? "",
      isPublished: page?.isPublished ?? false,
    },
  });

  const slugValue = watch("slug");

  const onSubmit = async (values: PageFormValues) => {
    const payload = {
      title: values.title,
      slug: values.slug || undefined,
      content: values.content || undefined,
      metaTitle: values.metaTitle || undefined,
      metaDescription: values.metaDescription || undefined,
      isPublished: values.isPublished,
    };
    try {
      if (isEditing) {
        await updatePage.mutateAsync(payload);
        toast.success("Page updated");
      } else {
        await createPage.mutateAsync(payload);
        toast.success("Page created");
      }
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    }
  };

  const saving = createPage.isPending || updatePage.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit page" : "New page"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="page-title">Title</Label>
            <Input id="page-title" {...register("title")} />
            {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="page-slug">Slug</Label>
            <Input id="page-slug" placeholder="auto-generated if blank" {...register("slug")} />
            <p className="text-xs text-muted-foreground">
              Preview: https://{rootDomain}/{(slugValue || "...").trim().toLowerCase().replace(/[\s_]+/g, "-")}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="page-content">Content</Label>
            <Controller
              name="content"
              control={control}
              render={({ field }) => (
                <RichTextEditor content={field.value ?? ""} onChange={field.onChange} />
              )}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="page-meta-title">Meta title</Label>
            <Input id="page-meta-title" {...register("metaTitle")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="page-meta-description">Meta description</Label>
            <Textarea id="page-meta-description" rows={2} {...register("metaDescription")} />
          </div>
          <div className="flex items-center gap-2">
            <Controller
              name="isPublished"
              control={control}
              render={({ field }) => (
                <Checkbox
                  id="page-published"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(!!v)}
                />
              )}
            />
            <Label htmlFor="page-published" className="font-normal">
              Published (publicly reachable)
            </Label>
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

export default function PagesPage() {
  const { data, isLoading, isError } = usePages();
  const deletePage = useDeletePage();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<Page | undefined>(undefined);
  const rootDomain = getRootDomain();

  const openCreate = () => {
    setEditingPage(undefined);
    setDialogOpen(true);
  };

  const openEdit = (page: Page) => {
    setEditingPage(page);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePage.mutateAsync(id);
      toast.success("Page deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    }
  };

  const pages = data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pages</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Page
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All pages</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
          {isError && (
            <p className="py-8 text-center text-sm text-destructive">Failed to load pages.</p>
          )}
          {!isLoading && pages.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No pages yet — create About Us, Contact, Disclaimer, or Privacy Policy to get started.
            </p>
          )}
          {pages.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.title}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.isPublished ? (
                        <a
                          href={`https://${rootDomain}/${p.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary hover:underline"
                        >
                          /{p.slug}
                        </a>
                      ) : (
                        <span>/{p.slug}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.isPublished ? "default" : "secondary"}>
                        {p.isPublished ? "Published" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className={buttonVariants({ variant: "ghost", size: "icon" })}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(p)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleDelete(p.id)}
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

      <PageFormDialog open={dialogOpen} onOpenChange={setDialogOpen} page={editingPage} />
    </div>
  );
}
