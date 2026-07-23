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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "@/hooks/use-taxonomy";
import { ApiError } from "@/lib/api-client";
import { getRootDomain } from "@/lib/site-url";
import type { Category } from "@/lib/types";

// Mirrors apps/api/src/modules/categories/dto/category.dto.ts's
// SUBDOMAIN_PATTERN (RFC 1035 DNS label) — this is client-side UX only
// (immediate feedback instead of a round-trip); the API re-validates and
// enforces uniqueness/reserved-word rejection regardless.
const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const categorySchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  slug: z.string().max(255).optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
  imageUrl: z.string().max(500).optional().or(z.literal("")),
  metaTitle: z.string().max(255).optional().or(z.literal("")),
  metaDescription: z.string().max(500).optional().or(z.literal("")),
  subdomain: z
    .string()
    .max(63)
    .regex(SUBDOMAIN_PATTERN, "Use lowercase letters, numbers, and hyphens only")
    .optional()
    .or(z.literal("")),
  isActive: z.boolean(),
  parentId: z.string().optional(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category;
  categories: Category[];
}) {
  const isEditing = !!category;
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory(category?.id ?? "");
  const rootDomain = getRootDomain();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    values: {
      name: category?.name ?? "",
      slug: category?.slug ?? "",
      description: category?.description ?? "",
      imageUrl: category?.imageUrl ?? "",
      metaTitle: category?.metaTitle ?? "",
      metaDescription: category?.metaDescription ?? "",
      subdomain: category?.subdomain ?? "",
      isActive: category?.isActive ?? true,
      parentId: category?.parentId ?? undefined,
    },
  });

  const [parentId, setParentId] = useState<string | undefined>(category?.parentId ?? undefined);
  const subdomainValue = watch("subdomain");

  const onSubmit = async (values: CategoryFormValues) => {
    // Same normalization as the API's CreateCategoryDto.subdomain
    // @Transform - applied here too so the live preview and the value sent
    // to the server always agree with each other.
    const subdomain = values.subdomain
      ? values.subdomain.trim().toLowerCase().replace(/[\s_]+/g, "-")
      : undefined;
    const payload = {
      name: values.name,
      slug: values.slug || undefined,
      description: values.description || undefined,
      imageUrl: values.imageUrl || undefined,
      metaTitle: values.metaTitle || undefined,
      metaDescription: values.metaDescription || undefined,
      subdomain,
      isActive: values.isActive,
      parentId,
    };
    try {
      if (isEditing) {
        await updateCategory.mutateAsync(payload);
        toast.success("Category updated");
      } else {
        await createCategory.mutateAsync(payload);
        toast.success("Category created");
      }
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    }
  };

  const saving = createCategory.isPending || updateCategory.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit category" : "New category"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" {...register("name")} />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-slug">Slug</Label>
            <Input id="cat-slug" placeholder="auto-generated if blank" {...register("slug")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-description">Description</Label>
            <Textarea id="cat-description" rows={2} {...register("description")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-subdomain">Subdomain</Label>
            <Input
              id="cat-subdomain"
              placeholder="e.g. kesehatan"
              {...register("subdomain")}
            />
            {errors.subdomain && (
              <p className="text-sm text-destructive">{errors.subdomain.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {subdomainValue
                ? `Preview: https://${subdomainValue.trim().toLowerCase().replace(/[\s_]+/g, "-")}.${rootDomain}`
                : `Leave blank to keep this category on ${rootDomain}/category/…`}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-image">Logo / image URL</Label>
            <Input id="cat-image" placeholder="https://…" {...register("imageUrl")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-meta-title">Meta title</Label>
            <Input
              id="cat-meta-title"
              placeholder={category ? `${category.name} Terbaru Hari Ini | BeritaBot` : undefined}
              {...register("metaTitle")}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-meta-description">Meta description</Label>
            <Textarea id="cat-meta-description" rows={2} {...register("metaDescription")} />
          </div>
          <div className="flex items-center gap-2">
            <Controller
              name="isActive"
              control={control}
              render={({ field }) => (
                <Checkbox
                  id="cat-active"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(!!v)}
                />
              )}
            />
            <Label htmlFor="cat-active" className="font-normal">
              Active (publicly reachable)
            </Label>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Parent category</Label>
            {(() => {
              // Base UI's <Select.Value> only reliably shows the matched
              // item's label (instead of falling back to the raw value -
              // here a UUID) when the root is given an explicit
              // value->label `items` map.
              const parentOptions = categories.filter((c) => c.id !== category?.id);
              const items = Object.fromEntries(parentOptions.map((c) => [c.id, c.name]));
              return (
                <Select items={items} value={parentId} onValueChange={(v) => setParentId(v ?? undefined)}>
                  <SelectTrigger>
                    <SelectValue placeholder="None (top-level)" />
                  </SelectTrigger>
                  <SelectContent>
                    {parentOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              );
            })()}
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

export default function CategoriesPage() {
  const { data, isLoading, isError } = useCategories();
  const deleteCategory = useDeleteCategory();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | undefined>(undefined);
  const rootDomain = getRootDomain();

  const openCreate = () => {
    setEditingCategory(undefined);
    setDialogOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditingCategory(category);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCategory.mutateAsync(id);
      toast.success("Category deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    }
  };

  const categories = data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Category
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All categories</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          )}
          {isError && (
            <p className="py-8 text-center text-sm text-destructive">
              Failed to load categories.
            </p>
          )}
          {!isLoading && categories.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No categories yet.
            </p>
          )}
          {categories.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Subdomain</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((cat) => (
                  <TableRow key={cat.id}>
                    <TableCell className="font-medium">{cat.name}</TableCell>
                    <TableCell className="text-muted-foreground">{cat.slug}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {cat.subdomain ? `${cat.subdomain}.${rootDomain}` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {categories.find((c) => c.id === cat.parentId)?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={cat.isActive === false ? "secondary" : "default"}>
                        {cat.isActive === false ? "Inactive" : "Active"}
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
                          <DropdownMenuItem onClick={() => openEdit(cat)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleDelete(cat.id)}
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

      <CategoryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editingCategory}
        categories={categories}
      />
    </div>
  );
}
