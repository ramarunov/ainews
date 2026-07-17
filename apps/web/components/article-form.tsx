"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Upload, ImagePlus, Images, Star, Plus } from "lucide-react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  useCategories,
  useTags,
  useCreateCategory,
  useCreateTag,
} from "@/hooks/use-taxonomy";
import { useAssignArticleToSeries, useSeriesList } from "@/hooks/use-series";
import { useMediaFile, useUploadMedia } from "@/hooks/use-media";
import { useCreateArticle, useUpdateArticle } from "@/hooks/use-articles";
import { usePublishArticle } from "@/hooks/use-articles";
import { ApiError } from "@/lib/api-client";
import type { Article, MediaFile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/rich-text-editor";
import { SeoPanel } from "@/components/seo-panel";
import { GeoPanel } from "@/components/geo-panel";
import { AiToolsPanel } from "@/components/ai-tools-panel";
import { AiPipelinePanel } from "@/components/ai-pipeline-panel";
import { MediaPickerDialog } from "@/components/media-picker-dialog";
import { StockPhotoDialog } from "@/components/stock-photo-dialog";

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
  const createCategory = useCreateCategory();
  const createTag = useCreateTag();
  const { data: seriesList } = useSeriesList();
  const assignToSeries = useAssignArticleToSeries();
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
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [stockPhotoOpen, setStockPhotoOpen] = useState(false);
  const featuredImagePreview =
    uploadedImagePreview ??
    existingFeaturedImage?.publicUrl ??
    existingFeaturedImage?.cdnUrl ??
    undefined;

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
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

  const liveTitle = watch("title");
  const liveContent = watch("content");
  const liveExcerpt = watch("excerpt");
  const liveSlug = watch("slug");

  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(
    () =>
      new Set(
        article?.articleCategories?.map((ac) => ac.category.id) ??
          (article?.primaryCategoryId ? [article.primaryCategoryId] : []),
      ),
  );
  const [primaryCategoryId, setPrimaryCategoryId] = useState<string | undefined>(
    article?.primaryCategoryId ?? undefined,
  );
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [seriesValue, setSeriesValue] = useState<string | undefined>(
    article?.seriesId ?? undefined,
  );
  const [seriesOrderValue, setSeriesOrderValue] = useState<string>(
    article?.seriesOrder != null ? String(article.seriesOrder) : "",
  );

  // Series membership is saved immediately (not part of the main form
  // submit) since it needs an existing article id — same reason this
  // control only renders once the article has been created at least once.
  const handleSeriesChange = async (seriesId: string | undefined) => {
    if (!article) return;
    setSeriesValue(seriesId);
    try {
      await assignToSeries.mutateAsync({
        articleId: article.id,
        seriesId: seriesId ?? null,
        seriesOrder: seriesOrderValue ? Number(seriesOrderValue) : undefined,
      });
      toast.success(seriesId ? "Added to series" : "Removed from series");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update series");
    }
  };

  const handleSeriesOrderBlur = async () => {
    if (!article || !seriesValue) return;
    try {
      await assignToSeries.mutateAsync({
        articleId: article.id,
        seriesId: seriesValue,
        seriesOrder: seriesOrderValue ? Number(seriesOrderValue) : undefined,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update series order");
    }
  };

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  };

  const toggleCategory = (id: string, checked: boolean) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    // Unchecking the current primary, or checking the very first category,
    // needs a sensible primary to fall back to rather than silently
    // leaving primaryCategoryId pointing at something no longer selected.
    if (!checked && primaryCategoryId === id) {
      setPrimaryCategoryId(undefined);
    } else if (checked && !primaryCategoryId) {
      setPrimaryCategoryId(id);
    }
  };

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      const created = await createCategory.mutateAsync({ name });
      setSelectedCategoryIds((prev) => new Set(prev).add(created.id));
      if (!primaryCategoryId) setPrimaryCategoryId(created.id);
      setNewCategoryName("");
      toast.success(`Category "${created.name}" created`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create category");
    }
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    try {
      const created = await createTag.mutateAsync({ name });
      setSelectedTagIds((prev) => [...prev, created.id]);
      setNewTagName("");
      toast.success(`Tag "${created.name}" created`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create tag");
    }
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

  const handleMediaPick = (media: MediaFile) => {
    setFeaturedImageId(media.id);
    setUploadedImagePreview(media.publicUrl ?? media.cdnUrl ?? undefined);
  };

  const buildPayload = (values: ArticleFormValues) => ({
    title: values.title,
    subtitle: values.subtitle || undefined,
    slug: values.slug || undefined,
    excerpt: values.excerpt || undefined,
    content: values.content || undefined,
    primaryCategoryId,
    categoryIds: [...selectedCategoryIds],
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
                <Controller
                  name="content"
                  control={control}
                  render={({ field }) => (
                    <RichTextEditor content={field.value ?? ""} onChange={field.onChange} />
                  )}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="pt-6">
              <Tabs defaultValue="details">
                <TabsList className="w-full">
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="seo">SEO</TabsTrigger>
                  <TabsTrigger value="geo">GEO</TabsTrigger>
                  <TabsTrigger value="ai">AI Tools</TabsTrigger>
                  {article?.isAiAssisted && (
                    <TabsTrigger value="ai-pipeline">AI Pipeline</TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="details" className="flex flex-col gap-4 pt-4">
                  <div className="flex flex-col gap-2">
                    <Label>Categories</Label>
                    <p className="text-xs text-muted-foreground">
                      Check every category this article belongs to. Click the star to
                      set which one is the primary category.
                    </p>
                    <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                      {categories?.data.map((cat) => {
                        const checked = selectedCategoryIds.has(cat.id);
                        return (
                          <div key={cat.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`cat-${cat.id}`}
                              checked={checked}
                              onCheckedChange={(v) => toggleCategory(cat.id, !!v)}
                            />
                            <Label htmlFor={`cat-${cat.id}`} className="flex-1 font-normal">
                              {cat.name}
                            </Label>
                            {checked && (
                              <button
                                type="button"
                                aria-label={`Set ${cat.name} as primary category`}
                                onClick={() => setPrimaryCategoryId(cat.id)}
                              >
                                <Star
                                  className={cn(
                                    "h-4 w-4",
                                    primaryCategoryId === cat.id
                                      ? "fill-primary text-primary"
                                      : "text-muted-foreground",
                                  )}
                                />
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {categories?.data.length === 0 && (
                        <p className="text-sm text-muted-foreground">No categories yet</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="New category name…"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCreateCategory();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={!newCategoryName.trim() || createCategory.isPending}
                        onClick={handleCreateCategory}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
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
                    <div className="flex gap-2">
                      <Input
                        placeholder="New tag name…"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCreateTag();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={!newTagName.trim() || createTag.isPending}
                        onClick={handleCreateTag}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="flex flex-col gap-2">
                      <Label>Series</Label>
                      <div className="flex gap-2">
                        <Select
                          value={seriesValue}
                          onValueChange={(v) => handleSeriesChange(v ?? undefined)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Not part of a series" />
                          </SelectTrigger>
                          <SelectContent>
                            {seriesList?.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {seriesValue && (
                          <Input
                            type="number"
                            min={0}
                            className="w-24"
                            placeholder="Order"
                            value={seriesOrderValue}
                            onChange={(e) => setSeriesOrderValue(e.target.value)}
                            onBlur={handleSeriesOrderBlur}
                          />
                        )}
                      </div>
                    </div>
                  )}

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
                    <div className="flex gap-2">
                      <label
                        className={cn(
                          "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed py-3 text-sm text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {uploadMedia.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setMediaPickerOpen(true)}
                      >
                        <ImagePlus className="h-4 w-4" />
                        Library
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setStockPhotoOpen(true)}
                      >
                        <Images className="h-4 w-4" />
                        Stock Photos
                      </Button>
                    </div>
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
                </TabsContent>

                <TabsContent value="seo" className="pt-4">
                  {isEditing ? (
                    <SeoPanel
                      articleId={article.id}
                      title={liveTitle}
                      content={liveContent ?? ""}
                      slug={liveSlug ?? ""}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Save this article as a draft first to unlock SEO tools.
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="geo" className="pt-4">
                  {isEditing ? (
                    <GeoPanel
                      articleId={article.id}
                      title={liveTitle}
                      content={liveContent ?? ""}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Save this article as a draft first to unlock GEO analysis.
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="ai" className="pt-4">
                  {isEditing ? (
                    <AiToolsPanel
                      articleId={article.id}
                      title={liveTitle}
                      content={liveContent ?? ""}
                      excerpt={liveExcerpt ?? ""}
                      onSetTitle={(t) => setValue("title", t)}
                      onInsertContent={(c) => setValue("content", c)}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Save this article as a draft first to unlock AI tools.
                    </p>
                  )}
                </TabsContent>

                {article?.isAiAssisted && (
                  <TabsContent value="ai-pipeline" className="pt-4">
                    <AiPipelinePanel articleId={article.id} />
                  </TabsContent>
                )}
              </Tabs>
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

      <MediaPickerDialog
        open={mediaPickerOpen}
        onOpenChange={setMediaPickerOpen}
        onSelect={handleMediaPick}
      />
      <StockPhotoDialog
        open={stockPhotoOpen}
        onOpenChange={setStockPhotoOpen}
        onSelect={handleMediaPick}
        defaultQuery={liveTitle}
      />
    </form>
  );
}
