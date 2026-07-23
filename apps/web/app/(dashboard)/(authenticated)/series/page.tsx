"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { MoreHorizontal, Plus } from "lucide-react";

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
  useCreateSeries,
  useDeleteSeries,
  useSeriesDetail,
  useSeriesList,
  useUpdateSeries,
} from "@/hooks/use-series";
import { ApiError } from "@/lib/api-client";
import type { ArticleSeries } from "@/lib/types";

const seriesSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  slug: z.string().max(255).optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
});

type SeriesFormValues = z.infer<typeof seriesSchema>;

function SeriesFormDialog({
  open,
  onOpenChange,
  series,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  series?: ArticleSeries;
}) {
  const isEditing = !!series;
  const createSeries = useCreateSeries();
  const updateSeries = useUpdateSeries(series?.id ?? "");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SeriesFormValues>({
    resolver: zodResolver(seriesSchema),
    values: {
      name: series?.name ?? "",
      slug: series?.slug ?? "",
      description: series?.description ?? "",
    },
  });

  const onSubmit = async (values: SeriesFormValues) => {
    const payload = {
      name: values.name,
      slug: values.slug || undefined,
      description: values.description || undefined,
    };
    try {
      if (isEditing) {
        await updateSeries.mutateAsync(payload);
        toast.success("Series updated");
      } else {
        await createSeries.mutateAsync(payload);
        toast.success("Series created");
      }
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    }
  };

  const saving = createSeries.isPending || updateSeries.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit series" : "New series"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="series-name">Name</Label>
            <Input id="series-name" {...register("name")} />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="series-slug">Slug</Label>
            <Input id="series-slug" placeholder="auto-generated if blank" {...register("slug")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="series-description">Description</Label>
            <Textarea id="series-description" rows={2} {...register("description")} />
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

function SeriesArticlesDialog({
  seriesId,
  onOpenChange,
}: {
  seriesId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = useSeriesDetail(seriesId ?? undefined);

  return (
    <Dialog open={!!seriesId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{data?.name ?? "Series articles"}</DialogTitle>
        </DialogHeader>
        {isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        )}
        {data && data.articles.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No articles assigned to this series yet — assign one from the article editor.
          </p>
        )}
        {data && data.articles.length > 0 && (
          <ol className="flex flex-col gap-2">
            {data.articles.map((article, i) => (
              <li key={article.id} className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{i + 1}.</span>
                <Link href={`/articles/${article.id}`} className="flex-1 hover:underline">
                  {article.title}
                </Link>
                <Badge variant="outline">{article.status}</Badge>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function SeriesPage() {
  const { data, isLoading, isError } = useSeriesList();
  const deleteSeries = useDeleteSeries();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSeries, setEditingSeries] = useState<ArticleSeries | undefined>(undefined);
  const [viewingSeriesId, setViewingSeriesId] = useState<string | null>(null);

  const openCreate = () => {
    setEditingSeries(undefined);
    setDialogOpen(true);
  };

  const openEdit = (series: ArticleSeries) => {
    setEditingSeries(series);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSeries.mutateAsync(id);
      toast.success("Series deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    }
  };

  const series = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Series</h1>
          <p className="text-sm text-muted-foreground">
            Group related articles into an ordered series or collection.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Series
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All series</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          )}
          {isError && (
            <p className="py-8 text-center text-sm text-destructive">
              Failed to load series.
            </p>
          )}
          {!isLoading && series.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No series yet.
            </p>
          )}
          {series.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Articles</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {series.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => setViewingSeriesId(s.id)}
                      >
                        {s.name}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.slug}</TableCell>
                    <TableCell>{s.articleCount ?? 0}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className={buttonVariants({ variant: "ghost", size: "icon" })}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(s)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleDelete(s.id)}
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

      <SeriesFormDialog open={dialogOpen} onOpenChange={setDialogOpen} series={editingSeries} />
      <SeriesArticlesDialog seriesId={viewingSeriesId} onOpenChange={() => setViewingSeriesId(null)} />
    </div>
  );
}
