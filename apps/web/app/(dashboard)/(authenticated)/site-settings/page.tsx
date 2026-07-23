"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SettingScriptForm } from "@/components/setting-script-form";
import {
  useSiteFooter,
  useUpdateSiteFooter,
  useHomepageWidgets,
  useUpdateHomepageWidgets,
  useHomepageSeo,
  useUpdateHomepageSeo,
  useCustomScripts,
  useUpdateCustomScripts,
  useSiteBranding,
  useUpdateSiteBranding,
} from "@/hooks/use-site-settings";
import { useUploadBrandingAsset } from "@/hooks/use-media";
import { useAuthStore } from "@/lib/auth-store";
import { ApiError } from "@/lib/api-client";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/brand";
import type {
  CustomScriptsSetting,
  FooterColumn,
  FooterLink,
  FooterWidget,
  FooterWidgetType,
  HomepageSeoSetting,
  HomepageWidget,
  HomepageWidgetType,
  SiteBrandingSetting,
  SiteFooterSetting,
} from "@/lib/types";

const WIDGET_TYPE_OPTIONS: { value: HomepageWidgetType; label: string }[] = [
  { value: "trending", label: "Trending Articles" },
  { value: "categories", label: "Popular Categories" },
  { value: "custom_html", label: "Custom HTML" },
];

function CardSkeleton() {
  return <div className="h-24 animate-pulse rounded-md bg-muted" />;
}

const FOOTER_WIDGET_TYPE_OPTIONS: { value: FooterWidgetType; label: string }[] = [
  { value: "text", label: "Text / HTML" },
  { value: "links", label: "Custom links" },
  { value: "categories", label: "Category list (auto)" },
  { value: "pages", label: "Page list (auto)" },
];

const FOOTER_COLUMN_COUNT = 4;

function newFooterWidget(type: FooterWidgetType): FooterWidget {
  const base = { id: crypto.randomUUID(), type, title: "" };
  if (type === "text") return { ...base, content: "" };
  if (type === "links") return { ...base, links: [] };
  return base;
}

// Matches PublicFooter's own DEFAULT_FOOTER_COLUMNS fallback, so what a
// superadmin sees pre-filled here the first time they open this card is
// exactly what visitors already see on the live site (kept in sync
// manually - see that file's header comment for why there's no shared
// module for it).
function defaultFooterColumns(): FooterColumn[] {
  return [
    { widgets: [{ id: crypto.randomUUID(), type: "text", title: "", content: `${SITE_TAGLINE}.` }] },
    { widgets: [{ id: crypto.randomUUID(), type: "categories", title: "Kategori" }] },
    {
      widgets: [
        {
          id: crypto.randomUUID(),
          type: "links",
          title: "Tautan",
          links: [{ label: "Cari Berita", url: "/search" }],
        },
      ],
    },
    { widgets: [{ id: crypto.randomUUID(), type: "pages", title: "Halaman" }] },
  ];
}

function FooterCard({ isSuperadmin }: { isSuperadmin: boolean }) {
  const { data, isLoading } = useSiteFooter(isSuperadmin);

  if (isLoading) return <CardSkeleton />;

  return <FooterForm initial={data?.columns?.length ? data : { columns: defaultFooterColumns() }} />;
}

function FooterWidgetEditor({
  widget,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  widget: FooterWidget;
  onChange: (patch: Partial<FooterWidget>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const links = widget.links ?? [];
  const addLink = () => {
    if (links.length >= 12) return;
    onChange({ links: [...links, { label: "", url: "" }] });
  };
  const removeLink = (idx: number) => onChange({ links: links.filter((_, i) => i !== idx) });
  const updateLink = (idx: number, patch: Partial<FooterLink>) =>
    onChange({ links: links.map((l, i) => (i === idx ? { ...l, ...patch } : l)) });

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={widget.type}
          onValueChange={(v) => onChange(newFooterWidget(v as FooterWidgetType))}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FOOTER_WIDGET_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="min-w-32 flex-1"
          placeholder="Heading (optional)"
          value={widget.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" disabled={!canMoveUp} onClick={onMoveUp}>
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" disabled={!canMoveDown} onClick={onMoveDown}>
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {widget.type === "text" && (
        <Textarea
          rows={3}
          placeholder="Plain text or HTML…"
          value={widget.content ?? ""}
          onChange={(e) => onChange({ content: e.target.value })}
        />
      )}

      {widget.type === "links" && (
        <div className="flex flex-col gap-2">
          {links.map((link, idx) => (
            <div key={idx} className="flex gap-2">
              <Input
                placeholder="Label"
                value={link.label}
                onChange={(e) => updateLink(idx, { label: e.target.value })}
              />
              <Input
                placeholder="/search or https://…"
                value={link.url}
                onChange={(e) => updateLink(idx, { url: e.target.value })}
              />
              <Button variant="ghost" size="icon" onClick={() => removeLink(idx)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            disabled={links.length >= 12}
            onClick={addLink}
          >
            <Plus className="h-4 w-4" /> Add link
          </Button>
        </div>
      )}

      {(widget.type === "categories" || widget.type === "pages") && (
        <p className="text-xs text-muted-foreground">
          {widget.type === "categories"
            ? "Populated automatically from your category list - nothing to configure here."
            : "Populated automatically from your published Pages - nothing to configure here."}
        </p>
      )}
    </div>
  );
}

function FooterColumnEditor({
  column,
  onChange,
}: {
  column: FooterColumn;
  onChange: (column: FooterColumn) => void;
}) {
  const updateWidget = (idx: number, patch: Partial<FooterWidget>) =>
    onChange({ widgets: column.widgets.map((w, i) => (i === idx ? { ...w, ...patch } : w)) });
  const removeWidget = (idx: number) =>
    onChange({ widgets: column.widgets.filter((_, i) => i !== idx) });
  const addWidget = () => onChange({ widgets: [...column.widgets, newFooterWidget("text")] });
  const moveWidget = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= column.widgets.length) return;
    const next = [...column.widgets];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ widgets: next });
  };

  return (
    <div className="flex flex-col gap-3">
      {column.widgets.map((widget, idx) => (
        <FooterWidgetEditor
          key={widget.id}
          widget={widget}
          onChange={(patch) => updateWidget(idx, patch)}
          onRemove={() => removeWidget(idx)}
          onMoveUp={() => moveWidget(idx, -1)}
          onMoveDown={() => moveWidget(idx, 1)}
          canMoveUp={idx > 0}
          canMoveDown={idx < column.widgets.length - 1}
        />
      ))}
      <Button variant="outline" size="sm" className="self-start" onClick={addWidget}>
        <Plus className="h-4 w-4" /> Add widget
      </Button>
    </div>
  );
}

function FooterForm({ initial }: { initial: SiteFooterSetting }) {
  const update = useUpdateSiteFooter();
  const [columns, setColumns] = useState<FooterColumn[]>(() =>
    Array.from(
      { length: FOOTER_COLUMN_COUNT },
      (_, i) => initial.columns[i] ?? { widgets: [] },
    ),
  );
  const [saving, setSaving] = useState(false);

  const updateColumn = (idx: number, column: FooterColumn) =>
    setColumns((cols) => cols.map((c, i) => (i === idx ? column : c)));

  const handleSave = async () => {
    setSaving(true);
    try {
      await update.mutateAsync({ columns });
      toast.success("Footer saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {columns.map((column, idx) => (
          <div key={idx} className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground uppercase">Column {idx + 1}</Label>
            <FooterColumnEditor column={column} onChange={(c) => updateColumn(idx, c)} />
          </div>
        ))}
      </div>
      <Button size="sm" className="self-end" disabled={saving} onClick={handleSave}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

function HomepageWidgetsCard({ isSuperadmin }: { isSuperadmin: boolean }) {
  const { data, isLoading } = useHomepageWidgets(isSuperadmin);

  if (isLoading) return <CardSkeleton />;

  return <HomepageWidgetsForm initial={data?.widgets ?? [{ type: "trending", enabled: true }]} />;
}

function HomepageWidgetsForm({ initial }: { initial: HomepageWidget[] }) {
  const update = useUpdateHomepageWidgets();
  const [widgets, setWidgets] = useState<HomepageWidget[]>(initial);
  const [saving, setSaving] = useState(false);

  const addWidget = () => setWidgets((w) => [...w, { type: "trending", enabled: true }]);
  const removeWidget = (idx: number) => setWidgets((w) => w.filter((_, i) => i !== idx));
  const updateWidget = (idx: number, patch: Partial<HomepageWidget>) =>
    setWidgets((w) => w.map((widget, i) => (i === idx ? { ...widget, ...patch } : widget)));
  const moveWidget = (idx: number, dir: -1 | 1) => {
    setWidgets((w) => {
      const target = idx + dir;
      if (target < 0 || target >= w.length) return w;
      const next = [...w];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await update.mutateAsync({ widgets });
      toast.success("Homepage widgets saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {widgets.map((widget, idx) => (
        <div key={idx} className="flex flex-col gap-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={widget.type}
              onValueChange={(v) => updateWidget(idx, { type: v as HomepageWidgetType })}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WIDGET_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`widget-${idx}-enabled`}
                checked={widget.enabled}
                onCheckedChange={(v) => updateWidget(idx, { enabled: !!v })}
              />
              <Label htmlFor={`widget-${idx}-enabled`} className="text-sm font-normal">
                Enabled
              </Label>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                disabled={idx === 0}
                onClick={() => moveWidget(idx, -1)}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={idx === widgets.length - 1}
                onClick={() => moveWidget(idx, 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => removeWidget(idx)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {widget.type === "custom_html" && (
            <Textarea
              rows={3}
              placeholder="<div>…</div>"
              value={widget.html ?? ""}
              onChange={(e) => updateWidget(idx, { html: e.target.value })}
              className="font-mono text-xs"
            />
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" className="self-start" onClick={addWidget}>
        <Plus className="h-4 w-4" /> Add widget
      </Button>
      <Button size="sm" className="self-end" disabled={saving} onClick={handleSave}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

function HomepageSeoCard({ isSuperadmin }: { isSuperadmin: boolean }) {
  const { data, isLoading } = useHomepageSeo(isSuperadmin);

  if (isLoading) return <CardSkeleton />;

  return <HomepageSeoForm initial={data ?? {}} />;
}

function HomepageSeoForm({ initial }: { initial: HomepageSeoSetting }) {
  const update = useUpdateHomepageSeo();
  const [title, setTitle] = useState(initial.title ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [ogImageUrl, setOgImageUrl] = useState(initial.ogImageUrl ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await update.mutateAsync({
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        ogImageUrl: ogImageUrl.trim() || undefined,
      });
      toast.success("Homepage SEO saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="seo-title">Title</Label>
        <Input
          id="seo-title"
          placeholder={`${SITE_NAME} — ${SITE_TAGLINE}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="seo-description">Description</Label>
        <Textarea
          id="seo-description"
          rows={2}
          placeholder={`The latest breaking news, analysis, and stories from ${SITE_NAME}.`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="seo-og-image">OG Image URL</Label>
        <Input
          id="seo-og-image"
          placeholder="https://…"
          value={ogImageUrl}
          onChange={(e) => setOgImageUrl(e.target.value)}
        />
      </div>
      <Button size="sm" className="self-end" disabled={saving} onClick={handleSave}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

function BrandingCard({ isSuperadmin }: { isSuperadmin: boolean }) {
  const { data, isLoading } = useSiteBranding(isSuperadmin);

  if (isLoading) return <CardSkeleton />;

  return <BrandingForm initial={data ?? {}} />;
}

function BrandingAssetSlot({
  label,
  description,
  defaultSrc,
  value,
  onChange,
}: {
  label: string;
  description: string;
  defaultSrc: string;
  value?: string;
  onChange: (url: string | undefined) => void;
}) {
  const uploadAsset = useUploadBrandingAsset();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const media = await uploadAsset.mutateAsync(file);
      onChange(media.publicUrl ?? media.cdnUrl ?? undefined);
      toast.success(`${label} uploaded`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="flex items-center gap-4">
        <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
          <Image
            src={value || defaultSrc}
            alt={label}
            fill
            className="object-contain p-1"
            unoptimized
          />
        </div>
        <div className="flex gap-2">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
            {uploadAsset.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </label>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>
              Reset to default
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function BrandingForm({ initial }: { initial: SiteBrandingSetting }) {
  const update = useUpdateSiteBranding();
  const [logoUrl, setLogoUrl] = useState<string | undefined>(initial.logoUrl);
  const [faviconUrl, setFaviconUrl] = useState<string | undefined>(initial.faviconUrl);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await update.mutateAsync({ logoUrl, faviconUrl });
      toast.success("Branding saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <BrandingAssetSlot
        label="Logo"
        description="Shown on the public site header, login page, and dashboard sidebar."
        defaultSrc="/brand/logo.png"
        value={logoUrl}
        onChange={setLogoUrl}
      />
      <BrandingAssetSlot
        label="Favicon"
        description="Shown as the browser tab icon. Use a square image for best results."
        defaultSrc="/icon"
        value={faviconUrl}
        onChange={setFaviconUrl}
      />
      <Button size="sm" className="self-end" disabled={saving} onClick={handleSave}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

function CustomScriptsCard({ isSuperadmin }: { isSuperadmin: boolean }) {
  const { data, isLoading } = useCustomScripts(isSuperadmin);

  if (isLoading) return <CardSkeleton />;

  return (
    <CustomScriptsForm
      initial={
        data ?? {
          header: { enabled: false, html: "" },
          footer: { enabled: false, html: "" },
        }
      }
    />
  );
}

function CustomScriptsForm({ initial }: { initial: CustomScriptsSetting }) {
  const update = useUpdateCustomScripts();
  // Tracks the last-known combined value so saving one slot (header/footer)
  // doesn't clobber the other with stale data - SettingScriptForm only
  // reports the slot it owns, not the full CustomScriptsSetting shape.
  const currentRef = useRef(initial);

  return (
    <>
      <SettingScriptForm
        idPrefix="custom-script-header"
        label="Header Script"
        description="Injected near the top of every public page (not literally inside <head> — most analytics tags, e.g. GA4, tolerate this)."
        placeholder="<script>…</script>"
        initial={initial.header}
        onSave={async (value) => {
          const next = { ...currentRef.current, header: value };
          await update.mutateAsync(next);
          currentRef.current = next;
        }}
      />
      <SettingScriptForm
        idPrefix="custom-script-footer"
        label="Footer Script"
        description="Injected at the very bottom of every public page."
        placeholder="<script>…</script>"
        initial={initial.footer}
        onSave={async (value) => {
          const next = { ...currentRef.current, footer: value };
          await update.mutateAsync(next);
          currentRef.current = next;
        }}
      />
    </>
  );
}

export default function SiteSettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isSuperadmin = user?.isSuperadmin ?? false;

  useEffect(() => {
    if (user && !isSuperadmin) {
      router.replace("/articles");
    }
  }, [user, isSuperadmin, router]);

  if (!isSuperadmin) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Site Settings</h1>
        <p className="text-sm text-muted-foreground">
          Control the public reader site&apos;s branding, footer, homepage sidebar widgets,
          homepage SEO, and custom scripts — no code changes needed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Branding</CardTitle>
          <CardDescription>
            The logo and browser tab icon shown across the site and dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BrandingCard isSuperadmin={isSuperadmin} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Footer</CardTitle>
          <CardDescription>
            WordPress-style widgets, 4 columns. Add a Text/HTML block, a
            custom link list, or an auto-updating category/page list to each
            column, and reorder them freely.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FooterCard isSuperadmin={isSuperadmin} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Homepage Widgets</CardTitle>
          <CardDescription>
            Choose what appears in the homepage sidebar, and in what order.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HomepageWidgetsCard isSuperadmin={isSuperadmin} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Homepage SEO</CardTitle>
          <CardDescription>
            Override the homepage&apos;s title/description meta tags. Leave blank to use the
            defaults.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HomepageSeoCard isSuperadmin={isSuperadmin} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom Scripts</CardTitle>
          <CardDescription>
            Raw HTML/script for analytics (e.g. GTM/GA). Injected near the top and bottom of every
            public page — not literally inside &lt;head&gt;.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <CustomScriptsCard isSuperadmin={isSuperadmin} />
        </CardContent>
      </Card>
    </div>
  );
}
