import { Injectable } from '@nestjs/common';
import { AIGatewayService } from './ai-gateway.service';

export interface WriterOptions {
  title: string;
  outline?: string[];
  tone?: 'formal' | 'casual' | 'authoritative' | 'conversational';
  targetLength?: number;
  focusKeyword?: string;
  targetAudience?: string;
  sources?: Array<{ title: string; url: string; excerpt?: string }>;
  organizationId?: string;
  articleId?: string;
  brandVoice?: string;
  // ISO 639-1 code (e.g. 'id', 'en'). When set, the article is written in
  // this language regardless of what language the sources are in - the
  // model translates and rewrites in one pass rather than writing in the
  // sources' language and translating separately.
  outputLanguage?: string;
}

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  id: 'Indonesian (Bahasa Indonesia)',
};

export interface EditorOptions {
  content: string;
  instruction: string;
  organizationId?: string;
  articleId?: string;
}

export interface TitleOptions {
  content: string;
  focusKeyword?: string;
  count?: number;
  organizationId?: string;
  articleId?: string;
  // See WriterOptions.outputLanguage - headline generation is a short
  // enough prompt that the model doesn't reliably infer the language from
  // the content alone the way full-article generation does, so this needs
  // to be stated explicitly too.
  outputLanguage?: string;
}

export interface QualityScoreResult {
  overall: number;
  breakdown: {
    writingQuality: number;
    factualAccuracy: number;
    seoOptimization: number;
    geoOptimization: number;
    completeness: number;
    originality: number;
  };
  issues: string[];
  recommendations: string[];
  canPublish: boolean;
}

export interface HallucinationResult {
  overallConfidence: number;
  claims: Array<{
    text: string;
    confidence: number;
    flag: 'VERIFIED' | 'LIKELY_TRUE' | 'UNVERIFIED' | 'VERIFY_REQUIRED' | 'DISPUTED';
    reason: string;
  }>;
  recommendation: 'SAFE_TO_PUBLISH' | 'REVIEW_BEFORE_PUBLISH' | 'DO_NOT_PUBLISH';
}

@Injectable()
export class AIWriterService {
  constructor(private readonly gateway: AIGatewayService) {}

  async generateDraft(options: WriterOptions): Promise<string> {
    const sourcesText = options.sources?.length
      ? `\n\nAvailable sources for reference:\n${options.sources
          .map((s) => `- ${s.title}: ${s.excerpt ?? ''}`)
          .join('\n')}`
      : '';

    const outlineText = options.outline?.length
      ? `\n\nOutline to follow:\n${options.outline.map((item, i) => `${i + 1}. ${item}`).join('\n')}`
      : '';

    const languageName = options.outputLanguage ? LANGUAGE_NAMES[options.outputLanguage] ?? options.outputLanguage : undefined;

    const systemPrompt = `You are a professional news journalist and content writer. ${options.brandVoice ? `Brand voice: ${options.brandVoice}.` : ''}
Write in ${options.tone ?? 'authoritative'} tone.
Always write factually. Never hallucinate facts, statistics, or quotes.
Format the article with proper HTML headings (h2, h3), paragraphs, and where appropriate, lists.
Never begin the article with a heading - start directly with the lead paragraph. Headings are only used to break up later sections, never before the first paragraph.
Target length: approximately ${options.targetLength ?? 1000} words.
Target audience: ${options.targetAudience ?? 'general news readers'}.${
      languageName
        ? ` Write the entire article in ${languageName}, regardless of what language the title or source material below is written in - translate and localize naturally, don't just transliterate.`
        : ''
    }`;

    const userPrompt = `Write a complete, high-quality news article with the following title: "${options.title}"
${options.focusKeyword ? `\nFocus keyword: ${options.focusKeyword}` : ''}
${outlineText}
${sourcesText}

Requirements:
- Include a compelling lead paragraph that answers who, what, when, where, why
- Use proper journalistic structure (inverted pyramid)
- Include relevant context and background
- If focus keyword is provided, use it naturally in the first paragraph, headings, and throughout
- End with a strong conclusion or forward-looking statement
- Do NOT use phrases like "In conclusion" or "To summarize"
- Do NOT start the article with a heading (h2/h3) - the very first element must be a paragraph
- Write ${options.targetLength ?? 1000} words approximately`;

    const draft = await this.gateway.prompt(systemPrompt, userPrompt, {
      temperature: 0.7,
      maxTokens: 4096,
      organizationId: options.organizationId,
      articleId: options.articleId,
      analysisType: 'draft_generation',
    });
    return this.stripLeadingHeading(this.stripCodeFence(draft));
  }

  // Despite being told not to, models still sometimes open the article with
  // a heading (often just restating the title) before the lead paragraph -
  // same "instructions aren't 100% reliable" reason stripCodeFence exists.
  private stripLeadingHeading(text: string): string {
    return text.replace(/^\s*<h[1-3][^>]*>[\s\S]*?<\/h[1-3]>\s*/i, '');
  }

  async rewriteParagraph(options: EditorOptions): Promise<string> {
    const systemPrompt = `You are a professional news editor. Rewrite the given text following the instruction precisely.
Maintain factual accuracy. Return only the rewritten text, no explanations.`;

    const userPrompt = `Text to rewrite:
${options.content}

Instruction: ${options.instruction}`;

    const rewritten = await this.gateway.prompt(systemPrompt, userPrompt, {
      temperature: 0.6,
      maxTokens: 2048,
      organizationId: options.organizationId,
      articleId: options.articleId,
      analysisType: 'paragraph_rewrite',
    });
    return this.stripCodeFence(rewritten);
  }

  // Despite being told to "return only the article/text, no explanations",
  // LLMs frequently wrap HTML output in a markdown code fence anyway (e.g.
  // "```html\n<p>...</p>\n```"). DOMPurify treats backticks as plain text,
  // so this would otherwise survive sanitization and render literally.
  private stripCodeFence(text: string): string {
    const match = text.trim().match(/^```(?:\w+)?\s*\n?([\s\S]*?)\n?```$/);
    return match ? match[1] : text;
  }

  async generateTitles(options: TitleOptions): Promise<string[]> {
    const count = options.count ?? 10;
    const languageName = options.outputLanguage
      ? LANGUAGE_NAMES[options.outputLanguage] ?? options.outputLanguage
      : undefined;

    const result = await this.gateway.jsonPrompt<{ titles: string[] }>(
      `You are an expert headline writer specializing in high-CTR news headlines.
Generate ${count} compelling title variants for the given content.
${options.focusKeyword ? `The focus keyword "${options.focusKeyword}" should appear in at least 5 of the titles.` : ''}
${languageName ? `Write every title in ${languageName}, regardless of what language the content excerpt below happens to be in.` : ''}
Return a JSON object with a "titles" array containing exactly ${count} title strings.`,
      `Content excerpt:
${options.content.substring(0, 2000)}

Generate ${count} title variants. Mix styles: news, analysis, listicle, question-based, data-driven.`,
      {
        temperature: 0.8,
        organizationId: options.organizationId,
        articleId: options.articleId,
        analysisType: 'title_optimization',
      },
    );

    return result.titles ?? [];
  }

  async generateMetaDescription(content: string, focusKeyword?: string): Promise<string> {
    const systemPrompt = `You are an SEO specialist. Write a compelling meta description.
Rules: 150-160 characters. Include the focus keyword naturally. Action-oriented. No clickbait.`;

    const userPrompt = `Article content:
${content.substring(0, 3000)}

${focusKeyword ? `Focus keyword: ${focusKeyword}` : ''}

Write a single meta description (150-160 characters):`;

    return this.gateway.prompt(systemPrompt, userPrompt, {
      temperature: 0.5,
      maxTokens: 256,
      analysisType: 'meta_description',
    });
  }

  async generateFAQs(content: string, count = 5): Promise<Array<{ question: string; answer: string }>> {
    return this.gateway.jsonPrompt<{ faqs: Array<{ question: string; answer: string }> }>(
      `You are an SEO expert creating FAQ sections for articles.
Generate ${count} frequently asked questions and detailed answers based on the article content.
Questions should be natural language questions a reader might ask.
Answers should be 2-4 sentences, factual, and based on the article content.
Return JSON: {"faqs": [{"question": "...", "answer": "..."}, ...]}`,
      `Article content:\n${content.substring(0, 4000)}`,
      {
        temperature: 0.4,
        analysisType: 'faq_generation',
      },
    ).then((r) => r.faqs ?? []);
  }

  async generateSummary(
    content: string,
    type: 'executive' | 'tweet' | 'tldr' | 'one_sentence' = 'tldr',
  ): Promise<string> {
    const lengthMap: Record<string, string> = {
      executive: '3-5 sentences with key takeaways',
      tweet: '280 characters max, engaging',
      tldr: '2-3 sentences for TLDR section',
      one_sentence: 'exactly one sentence',
    };

    return this.gateway.prompt(
      `You are a professional summarizer. Create a ${type} summary of the article.
Length requirement: ${lengthMap[type]}.
Be accurate. Do not add information not in the article.`,
      `Article:\n${content.substring(0, 4000)}`,
      { temperature: 0.3, maxTokens: 512, analysisType: 'summarization' },
    );
  }

  async checkHallucinations(
    content: string,
    sources: Array<{ title: string; excerpt: string }> = [],
    organizationId?: string,
    articleId?: string,
  ): Promise<HallucinationResult> {
    const sourcesText = sources.length
      ? `\nProvided sources:\n${sources.map((s) => `- ${s.title}: ${s.excerpt}`).join('\n')}`
      : '\nNo external sources provided.';

    return this.gateway.jsonPrompt<HallucinationResult>(
      `You are a fact-checking AI. Analyze the article for potential hallucinations,
unverifiable claims, suspicious statistics, and invented quotes.

For each factual claim:
1. Extract the specific claim
2. Assess confidence (0.0-1.0) that it is accurate based on general knowledge and provided sources
3. Flag claims that need verification

Return JSON: {
  "overallConfidence": 0.0-1.0,
  "claims": [{"text": "...", "confidence": 0.0-1.0, "flag": "VERIFIED|LIKELY_TRUE|UNVERIFIED|VERIFY_REQUIRED|DISPUTED", "reason": "..."}],
  "recommendation": "SAFE_TO_PUBLISH|REVIEW_BEFORE_PUBLISH|DO_NOT_PUBLISH"
}`,
      `Article content:\n${content.substring(0, 4000)}${sourcesText}`,
      { temperature: 0.1, analysisType: 'hallucination_check', organizationId, articleId },
    );
  }

  async calculateQualityScore(
    content: string,
    title: string,
    seoScore?: number,
    geoScore?: number,
    organizationId?: string,
    articleId?: string,
  ): Promise<QualityScoreResult> {
    return this.gateway.jsonPrompt<QualityScoreResult>(
      `You are an editorial quality assessor. Score this article on multiple dimensions.
Each dimension is scored 0-100. The "overall" is the weighted average.

Weights:
- writingQuality: 25%
- factualAccuracy: 25%
- seoOptimization: 15%
- geoOptimization: 15%
- completeness: 10%
- originality: 10%

Return JSON: {
  "overall": 0-100,
  "breakdown": {
    "writingQuality": 0-100,
    "factualAccuracy": 0-100,
    "seoOptimization": 0-100,
    "geoOptimization": 0-100,
    "completeness": 0-100,
    "originality": 0-100
  },
  "issues": ["list of specific issues found"],
  "recommendations": ["list of specific improvements"],
  "canPublish": true|false
}`,
      `Title: ${title}\n\nContent:\n${content.substring(0, 4000)}\n\n${
        seoScore != null ? `Pre-calculated SEO score: ${seoScore}/100\n` : ''
      }${geoScore != null ? `Pre-calculated GEO score: ${geoScore}/100\n` : ''}`,
      { temperature: 0.2, analysisType: 'quality_score', organizationId, articleId },
    );
  }

  /**
   * Proposes internal links for automatic insertion (no human review step,
   * per product decision). The model must ONLY copy exact substrings from the
   * supplied content for `searchText` — it never gets to touch the HTML
   * directly. The caller (ArticleInternalLinkingService) is responsible for
   * verifying each searchText actually occurs verbatim before inserting
   * anything; a hallucinated searchText is simply skipped, never invented.
   */
  async suggestInternalLinks(
    content: string,
    candidates: Array<{ slug: string; title: string }>,
    organizationId?: string,
    articleId?: string,
  ): Promise<Array<{ searchText: string; targetSlug: string }>> {
    const candidateList = candidates.map((c) => `- slug: "${c.slug}" — title: "${c.title}"`).join('\n');

    const result = await this.gateway.jsonPrompt<{ links: Array<{ searchText: string; targetSlug: string }> }>(
      `You are an internal-linking assistant for a news CMS. Given an article's
plain-text content and a list of candidate related articles, propose up to 3
places in the content that should link to a candidate article.

Rules:
- "searchText" MUST be copied EXACTLY, character-for-character, from the
  supplied content — never paraphrase, summarize, or invent it. It should be
  a short phrase (2-6 words) that naturally relates to the target article.
- "targetSlug" must be one of the candidate slugs provided.
- Only propose a link where the connection is genuinely relevant, not forced.
- Never propose the same searchText twice, and never target the same slug twice.
- If nothing is a good fit, return fewer links or an empty list.

Return JSON: {"links": [{"searchText": "...", "targetSlug": "..."}]}`,
      `Article content:\n${content.substring(0, 6000)}\n\nCandidate related articles:\n${candidateList}`,
      { temperature: 0.2, analysisType: 'internal_linking', organizationId, articleId },
    );

    return result.links ?? [];
  }

  async extractEntities(content: string): Promise<
    Array<{
      text: string;
      type: 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'DATE' | 'PRODUCT' | 'EVENT' | 'OTHER';
      confidence: number;
    }>
  > {
    const result = await this.gateway.jsonPrompt<{
      entities: Array<{
        text: string;
        type: string;
        confidence: number;
      }>;
    }>(
      `You are a Named Entity Recognition (NER) system.
Extract all named entities from the text. Return JSON:
{"entities": [{"text": "...", "type": "PERSON|ORGANIZATION|LOCATION|DATE|PRODUCT|EVENT|OTHER", "confidence": 0.0-1.0}]}`,
      content.substring(0, 4000),
      { temperature: 0.1, analysisType: 'entity_extraction' },
    );

    const validTypes = new Set([
      'PERSON',
      'ORGANIZATION',
      'LOCATION',
      'DATE',
      'PRODUCT',
      'EVENT',
      'OTHER',
    ]);

    return (result.entities ?? []).map((entity) => ({
      ...entity,
      type: (validTypes.has(entity.type) ? entity.type : 'OTHER') as
        | 'PERSON'
        | 'ORGANIZATION'
        | 'LOCATION'
        | 'DATE'
        | 'PRODUCT'
        | 'EVENT'
        | 'OTHER',
    }));
  }

  async generateImagePrompt(
    title: string,
    excerpt: string,
  ): Promise<string> {
    return this.gateway.prompt(
      `You are an expert at writing image generation prompts for news article featured images.
Write a detailed, safe, photojournalistic image prompt that would work with DALL-E or Midjourney.
The image should be appropriate for a news article, not promotional or cartoon-like.`,
      `Article title: ${title}\nExcerpt: ${excerpt}`,
      { temperature: 0.7, maxTokens: 256, analysisType: 'image_prompt' },
    );
  }

  /**
   * Short English keyword phrase for searching a real stock-photo library
   * (Pexels) for this specific article, rather than a generic per-category
   * query. Deliberately not a DALL-E-style scene description - stock
   * libraries match on concrete nouns/concepts, not prose, and skew English
   * regardless of the article's own language.
   */
  async suggestStockPhotoQuery(
    title: string,
    organizationId?: string,
    articleId?: string,
  ): Promise<string> {
    const result = await this.gateway.prompt(
      `You help pick a real stock photo for a news article. Given the headline, reply with 2-4 short English keywords (concrete nouns/concepts) suitable for searching a general stock-photo library like Pexels.
Never include people's names or other identifying details of real individuals - the photo will be a generic stock image, not a picture of the actual people/event involved.
Reply with the keywords only, comma-separated, no explanation and no trailing punctuation.`,
      `Headline: ${title}`,
      {
        temperature: 0.3,
        maxTokens: 20,
        analysisType: 'stock_photo_query',
        organizationId,
        articleId,
      },
    );
    return result.trim();
  }

  async generateAltText(
    imageUrl: string,
    context: { caption?: string; organizationId?: string } = {},
  ): Promise<string> {
    const systemPrompt = `You are an accessibility expert writing alt text for images on a news website.
Describe only what is visibly present in the image, concisely (aim for under 125 characters, never over 250).
Do not start with "Image of" or "Picture of". Do not invent names of people or places unless given in context.
Return only the alt text itself — no quotes, no explanation, no trailing period.`;

    const userPrompt = context.caption
      ? `Write alt text for this image. Existing caption for context: "${context.caption}"`
      : 'Write alt text for this image.';

    return this.gateway.visionPrompt(systemPrompt, userPrompt, imageUrl, {
      organizationId: context.organizationId,
      analysisType: 'alt_text_generation',
    });
  }
}
