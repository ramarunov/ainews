"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useExtractEntities,
  useGenerateDraft,
  useGenerateFaqs,
  useGenerateMetaDescription,
  useGenerateTitles,
  useHallucinationCheck,
  useImagePrompt,
  useQualityScore,
  useRewrite,
} from "@/hooks/use-ai-writer";
import { ApiError } from "@/lib/api-client";

function reportError(err: unknown, fallback: string) {
  toast.error(err instanceof ApiError ? err.message : fallback);
}

export function AiToolsPanel({
  articleId,
  title,
  content,
  excerpt,
  onSetTitle,
  onInsertContent,
}: {
  articleId: string;
  title: string;
  content: string;
  excerpt: string;
  onSetTitle: (title: string) => void;
  onInsertContent: (content: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <DraftTool articleId={articleId} title={title} onInsertContent={onInsertContent} />
      <TitlesTool articleId={articleId} content={content} onSetTitle={onSetTitle} />
      <RewriteTool
        articleId={articleId}
        content={content}
        onInsertContent={onInsertContent}
      />
      <MetaDescriptionTool articleId={articleId} content={content} />
      <FaqsTool articleId={articleId} content={content} />
      <QualityScoreTool articleId={articleId} title={title} content={content} />
      <HallucinationTool articleId={articleId} content={content} />
      <EntitiesTool articleId={articleId} content={content} />
      <ImagePromptTool articleId={articleId} title={title} excerpt={excerpt} />
    </div>
  );
}

function ToolSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-b pb-4 last:border-b-0 last:pb-0">
      <p className="text-sm font-medium">{label}</p>
      {children}
    </div>
  );
}

function DraftTool({
  articleId,
  title,
  onInsertContent,
}: {
  articleId: string;
  title: string;
  onInsertContent: (content: string) => void;
}) {
  const [outline, setOutline] = useState("");
  const [tone, setTone] = useState<
    "formal" | "casual" | "authoritative" | "conversational"
  >("conversational");
  const generateDraft = useGenerateDraft(articleId);

  const onGenerate = async () => {
    try {
      await generateDraft.mutateAsync({
        title,
        tone,
        outline: outline.trim() ? outline.split("\n").filter(Boolean) : undefined,
      });
    } catch (err) {
      reportError(err, "Draft generation failed");
    }
  };

  return (
    <ToolSection label="Generate Draft">
      <Textarea
        placeholder="Outline (one point per line, optional)"
        rows={3}
        value={outline}
        onChange={(e) => setOutline(e.target.value)}
      />
      <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="conversational">Conversational</SelectItem>
          <SelectItem value="formal">Formal</SelectItem>
          <SelectItem value="casual">Casual</SelectItem>
          <SelectItem value="authoritative">Authoritative</SelectItem>
        </SelectContent>
      </Select>
      <Button type="button" size="sm" onClick={onGenerate} disabled={generateDraft.isPending}>
        {generateDraft.isPending ? "Generating…" : "Generate"}
      </Button>
      {generateDraft.data && (
        <div className="flex flex-col gap-2 rounded-md border p-2">
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
            {generateDraft.data}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onInsertContent(generateDraft.data!)}
          >
            Insert into content
          </Button>
        </div>
      )}
    </ToolSection>
  );
}

function TitlesTool({
  articleId,
  content,
  onSetTitle,
}: {
  articleId: string;
  content: string;
  onSetTitle: (title: string) => void;
}) {
  const generateTitles = useGenerateTitles(articleId);

  const onGenerate = async () => {
    try {
      await generateTitles.mutateAsync({ content, count: 5 });
    } catch (err) {
      reportError(err, "Title generation failed");
    }
  };

  return (
    <ToolSection label="Generate Titles">
      <Button type="button" size="sm" onClick={onGenerate} disabled={generateTitles.isPending}>
        {generateTitles.isPending ? "Generating…" : "Suggest titles"}
      </Button>
      {generateTitles.data && (
        <div className="flex flex-col gap-1">
          {generateTitles.data.map((t, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSetTitle(t)}
              className="rounded-md border p-2 text-left text-sm hover:bg-muted"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </ToolSection>
  );
}

function RewriteTool({
  articleId,
  content,
  onInsertContent,
}: {
  articleId: string;
  content: string;
  onInsertContent: (content: string) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const rewrite = useRewrite(articleId);

  const onGenerate = async () => {
    if (!instruction.trim()) {
      toast.error("Enter a rewrite instruction first");
      return;
    }
    try {
      await rewrite.mutateAsync({ content, instruction });
    } catch (err) {
      reportError(err, "Rewrite failed");
    }
  };

  return (
    <ToolSection label="Rewrite Content">
      <Input
        placeholder="e.g. make it more concise"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
      />
      <Button type="button" size="sm" onClick={onGenerate} disabled={rewrite.isPending}>
        {rewrite.isPending ? "Rewriting…" : "Rewrite"}
      </Button>
      {rewrite.data && (
        <div className="flex flex-col gap-2 rounded-md border p-2">
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
            {rewrite.data}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onInsertContent(rewrite.data!)}
          >
            Replace content
          </Button>
        </div>
      )}
    </ToolSection>
  );
}

function MetaDescriptionTool({
  articleId,
  content,
}: {
  articleId: string;
  content: string;
}) {
  const generateMeta = useGenerateMetaDescription(articleId);

  const onGenerate = async () => {
    try {
      await generateMeta.mutateAsync({ content });
    } catch (err) {
      reportError(err, "Meta description generation failed");
    }
  };

  return (
    <ToolSection label="Meta Description">
      <Button type="button" size="sm" onClick={onGenerate} disabled={generateMeta.isPending}>
        {generateMeta.isPending ? "Generating…" : "Generate"}
      </Button>
      {generateMeta.data && (
        <p className="rounded-md border p-2 text-sm text-muted-foreground">
          {generateMeta.data}
        </p>
      )}
    </ToolSection>
  );
}

function FaqsTool({ articleId, content }: { articleId: string; content: string }) {
  const generateFaqs = useGenerateFaqs(articleId);

  const onGenerate = async () => {
    try {
      await generateFaqs.mutateAsync({ content, count: 5 });
    } catch (err) {
      reportError(err, "FAQ generation failed");
    }
  };

  return (
    <ToolSection label="Generate FAQs">
      <Button type="button" size="sm" onClick={onGenerate} disabled={generateFaqs.isPending}>
        {generateFaqs.isPending ? "Generating…" : "Generate"}
      </Button>
      {generateFaqs.data && (
        <div className="flex flex-col gap-2">
          {generateFaqs.data.map((faq, i) => (
            <div key={i} className="rounded-md border p-2 text-sm">
              <p className="font-medium">{faq.question}</p>
              <p className="text-muted-foreground">{faq.answer}</p>
            </div>
          ))}
        </div>
      )}
    </ToolSection>
  );
}

function QualityScoreTool({
  articleId,
  title,
  content,
}: {
  articleId: string;
  title: string;
  content: string;
}) {
  const qualityScore = useQualityScore(articleId);

  const onCheck = async () => {
    try {
      await qualityScore.mutateAsync({ content, title });
    } catch (err) {
      reportError(err, "Quality score failed");
    }
  };

  return (
    <ToolSection label="Quality Score">
      <Button type="button" size="sm" onClick={onCheck} disabled={qualityScore.isPending}>
        {qualityScore.isPending ? "Scoring…" : "Check quality"}
      </Button>
      {qualityScore.data && (
        <div className="flex flex-col gap-2 rounded-md border p-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">Overall</span>
            <span>{qualityScore.data.overall}/100</span>
          </div>
          <Badge variant={qualityScore.data.canPublish ? "default" : "destructive"}>
            {qualityScore.data.canPublish ? "Ready to publish" : "Needs work"}
          </Badge>
          {qualityScore.data.issues.length > 0 && (
            <ul className="list-inside list-disc text-muted-foreground">
              {qualityScore.data.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </ToolSection>
  );
}

function HallucinationTool({
  articleId,
  content,
}: {
  articleId: string;
  content: string;
}) {
  const check = useHallucinationCheck(articleId);

  const onCheck = async () => {
    try {
      await check.mutateAsync({ content });
    } catch (err) {
      reportError(err, "Hallucination check failed");
    }
  };

  return (
    <ToolSection label="Hallucination Check">
      <Button type="button" size="sm" onClick={onCheck} disabled={check.isPending}>
        {check.isPending ? "Checking…" : "Check for hallucinations"}
      </Button>
      {check.data && (
        <div className="flex flex-col gap-2 rounded-md border p-2 text-sm">
          <Badge
            variant={
              check.data.recommendation === "SAFE_TO_PUBLISH" ? "default" : "destructive"
            }
          >
            {check.data.recommendation.replaceAll("_", " ")}
          </Badge>
          {check.data.claims.map((claim, i) => (
            <div key={i} className="border-t pt-2 first:border-t-0 first:pt-0">
              <p>{claim.text}</p>
              <p className="text-xs text-muted-foreground">
                {claim.flag} · {claim.reason}
              </p>
            </div>
          ))}
        </div>
      )}
    </ToolSection>
  );
}

function EntitiesTool({ articleId, content }: { articleId: string; content: string }) {
  const extractEntities = useExtractEntities(articleId);

  const onExtract = async () => {
    try {
      await extractEntities.mutateAsync({ content });
    } catch (err) {
      reportError(err, "Entity extraction failed");
    }
  };

  return (
    <ToolSection label="Extract Entities">
      <Button type="button" size="sm" onClick={onExtract} disabled={extractEntities.isPending}>
        {extractEntities.isPending ? "Extracting…" : "Extract entities"}
      </Button>
      {extractEntities.data && (
        <div className="flex flex-wrap gap-1">
          {extractEntities.data.map((entity, i) => (
            <Badge key={i} variant="outline">
              {entity.text} · {entity.type}
            </Badge>
          ))}
        </div>
      )}
    </ToolSection>
  );
}

function ImagePromptTool({
  articleId,
  title,
  excerpt,
}: {
  articleId: string;
  title: string;
  excerpt: string;
}) {
  const imagePrompt = useImagePrompt(articleId);

  const onGenerate = async () => {
    try {
      await imagePrompt.mutateAsync({ title, excerpt });
    } catch (err) {
      reportError(err, "Image prompt generation failed");
    }
  };

  return (
    <ToolSection label="Image Prompt">
      <Button type="button" size="sm" onClick={onGenerate} disabled={imagePrompt.isPending}>
        {imagePrompt.isPending ? "Generating…" : "Generate image prompt"}
      </Button>
      {imagePrompt.data && (
        <p className="rounded-md border p-2 text-sm text-muted-foreground">
          {imagePrompt.data}
        </p>
      )}
    </ToolSection>
  );
}
