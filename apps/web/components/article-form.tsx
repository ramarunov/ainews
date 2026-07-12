"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { Card, CardContent } from "@/components/ui/card";

import { useCategories, useTags } from "@/hooks/use-taxonomy";
import { useMediaFile, useUploadMedia } from "@/hooks/use-media";
import { useCreateArticle, useUpdateArticle } from "@/hooks/use-articles";
import { usePublishArticle } from "@/hooks/use-articles";
import { ApiError } from "@/lib/api-client";
import type { Article } from "@/lib/types";
import { cn } from "@/lib/utils";

const articleSchema = z.object({
  title: z.string().min(10, "Title must be at least 10 characters").max(500),
  subtitle: z.string().max(500).optional().or(z.literal("")),
  slug: z.string().max(500).optional().or(z.literal("")),
  excerpt: z.string().optional().or(z.literal("")),
  content: z.string().optional().or(z.literal("")),
  primaryCategoryId: z.string().optional(),
  isBreaking: z.boolean(),
  isFeatured: z.boolean(),
});

type ArticleFormValues = z.infer<typeof articleSchema>;

export function ArticleForm({ article }: { article?: Article }) {
  const router = useRouter();
  const isEditing = !!article;

  const { data: categories } = useCategories();
  const { data: tags } = useTags();
  const { data: existingFeaturedImage } = useMediaFile(
    article?.featuredImageId ?? undefined,
  );
  const uploadMedia = useUploadMedia();
  const createArticle = useCreateArticle();
  const updateArticle = useUpdateArticle(article?.id ?? "");
  const publishArticle = usePublishArticle();

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    article?.articleTags?.map((at) => at.tag.id) ?? [],
  );
  const [featuredImageId, setFeaturedImageId] = useState<string | undefined>(
    article?.featuredImageId ?? undefined,
  );
  const [uploadedImagePreview, setUploadedImagePreview] = useState<
    string | undefined
  >(undefined);
  const featuredImagePreview =
    uploadedImagePreview ??
    existingFeaturedImage?.publicUrl ??
    existingFeaturedImage?.cdnUrl ??
    undefined;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ArticleFormValues>({
    resolver: zodResolver(articleSchema),
    defaultValues: {
      title: article?.title ?? "",
      subtitle: article?.subtitle ?? "",
      slug: article?.slug ?? "",
      excerpt: article?.excerpt ?? "",
      content: article?.content ?? "",
      primaryCategoryId: article?.primaryCategoryId ?? undefined,
      isBreaking: article?.isBreaking ?? false,
      isFeatured: article?.isFeatured ?? false,
    },
  });

  const [categoryValue, setCategoryValue] = useState<string | undefined>(
    article?.primaryCategoryId ?? undefined,
  );

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const media = await uploadMedia.mutateAsync(file);
      setFeaturedImageId(media.id);
      setUploadedImagePreview(media.publicUrl ?? media.cdnUrl ?? undefined);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    }
  };

  const buildPayload = (values: ArticleFormValues) => ({
    title: values.title,
    subtitle: values.subtitle || undefined,
    slug: values.slug || undefined,
    excerpt: values.excerpt || undefined,
    content: values.content || undefined,
    primaryCategoryId: categoryValue,
    tagIds: selectedTagIds,
    featuredImageId,
    isBreaking: values.isBreaking,
    isFeatured: values.isFeatured,
  });

  const onSave = async (values: ArticleFormValues) => {
    try {
      if (isEditing) {
        await updateArticle.mutateAsync(buildPayload(values));
        toast.success("Article saved");
      } else {
        const created = await createArticle.mutateAsync(buildPayload(values));
        toast.success("Article created");
        router.push(`/articles/${created.id}`);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    }
  };

  const onPublish = handleSubmit(async (values) => {
    try {
      if (isEditing) {
        await updateArticle.mutateAsync(buildPayload(values));
        await publishArticle.mutateAsync(article!.id);
      } else {
        const created = await createArticle.mutateAsync(buildPayload(values));
        await publishArticle.mutateAsync(created.id);
        router.push(`/articles/${created.id}`);
      }
      toast.success("Article published");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Publish failed");
    }
  });

  const saving =
    createArticle.isPending || updateArticle.isPending || publishArticle.isPending;

  return (
    <form onSubmit={handleSubmit(onSave)} className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              <div className="flex flex-col gap-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" {...register("title")} />
                {errors.title && (
                  <p className="text-sm text-destructive">{errors.title.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="subtitle">Subtitle</Label>
                <Input id="subtitle" {...register("subtitle")} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  placeholder="auto-generated from title if left blank"
                  {...register("slug")}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="excerpt">Excerpt</Label>
                <Textarea id="excerpt" rows={3} {...register("excerpt")} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="content">Content</Label>
                <Textarea id="content" rows={16} {...register("content")} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              <div className="flex flex-col gap-2">
                <Label>Category</Label>
                <Select
                  value={categoryValue}
                  onValueChange={(v) => setCategoryValue(v ?? undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.data.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2">
                  {tags?.data.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant={
                        selectedTagIds.includes(tag.id) ? "default" : "outline"
                      }
                      className="cursor-pointer select-none"
                      onClick={() => toggleTag(tag.id)}
                    >
                      {tag.name}
                    </Badge>
                  ))}
                  {tags?.data.length === 0 && (
                    <p className="text-sm text-muted-foreground">No tags yet</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Featured image</Label>
                {featuredImagePreview && (
                  <div className="relative aspect-video w-full overflow-hidden rounded-md border">
                    <Image
                      src={featuredImagePreview}
                      alt=""
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                )}
                <label
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed py-3 text-sm text-muted-foreground hover:bg-muted",
                  )}
                >
                  {uploadMedia.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Controller
                  name="isBreaking"
                  control={control}
                  render={({ field }) => (
                    <Checkbox
                      id="isBreaking"
                      checked={field.value}
                      onCheckedChange={(v) => field.onChange(!!v)}
                    />
                  )}
                />
                <Label htmlFor="isBreaking" className="font-normal">
                  Breaking news
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Controller
                  name="isFeatured"
                  control={control}
                  render={({ field }) => (
                    <Checkbox
                      id="isFeatured"
                      checked={field.value}
                      onCheckedChange={(v) => field.onChange(!!v)}
                    />
                  )}
                />
                <Label htmlFor="isFeatured" className="font-normal">
                  Featured
                </Label>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2">
            <Button type="submit" variant="outline" disabled={saving}>
              {saving ? "Saving…" : "Save draft"}
            </Button>
            <Button type="button" onClick={onPublish} disabled={saving}>
              {saving ? "Publishing…" : "Publish"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
