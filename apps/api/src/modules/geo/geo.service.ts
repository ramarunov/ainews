import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AIGatewayService } from '../ai/ai-gateway.service';

export interface GeoScore {
  total: number;
  breakdown: {
    llmReadability: number;
    semanticRichness: number;
    entityCoverage: number;
    evidence: number;
    qaCoverage: number;
    citationFriendliness: number;
  };
  structuredSummary?: string;
  keyClaims: string[];
  entitiesCovered: string[];
  questionsAnswered: string[];
  recommendations: string[];
}

@Injectable()
export class GeoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGateway: AIGatewayService,
  ) {}

  /**
   * Calculate comprehensive GEO score for an article
   */
  async calculateGeoScore(
    content: string,
    title: string,
    articleId?: string,
  ): Promise<GeoScore> {
    const result = await this.aiGateway.jsonPrompt<GeoScore>(
      `You are a Generative Engine Optimization (GEO) specialist.
GEO optimizes content to be cited by AI search engines (Perplexity, ChatGPT, Google SGE, etc.).

Score the article on these dimensions (each 0-20 except where noted, total max 100):

1. llmReadability (0-20): Clear, unambiguous sentences. Short paragraphs. No jargon without explanation.
2. semanticRichness (0-20): Covers topic comprehensively. Related concepts explained. Good entity context.
3. entityCoverage (0-20): All named entities (people, orgs, places, events) properly identified and contextualized.
4. evidence (0-20): Claims backed by citations, statistics, or expert quotes. Primary sources cited.
5. qaCoverage (0-15): Answers common questions a reader might have about this topic.
6. citationFriendliness (0-5): Content structured so AI can easily extract and cite specific facts.

Also provide:
- structuredSummary: 2-3 sentence machine-readable summary of key facts
- keyClaims: array of the 3-5 most important verifiable claims in the article
- entitiesCovered: array of all significant entities mentioned
- questionsAnswered: array of questions this article answers
- recommendations: array of specific improvements to boost GEO score

Return JSON matching the GeoScore interface.`,
      `Title: ${title}\n\nContent:\n${content.substring(0, 5000)}`,
      {
        temperature: 0.2,
        articleId,
        analysisType: 'geo_score',
      },
    );

    // Ensure total is calculated correctly
    const breakdown = result.breakdown ?? {
      llmReadability: 0,
      semanticRichness: 0,
      entityCoverage: 0,
      evidence: 0,
      qaCoverage: 0,
      citationFriendliness: 0,
    };

    const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

    return {
      total: Math.min(100, Math.round(total)),
      breakdown,
      structuredSummary: result.structuredSummary,
      keyClaims: result.keyClaims ?? [],
      entitiesCovered: result.entitiesCovered ?? [],
      questionsAnswered: result.questionsAnswered ?? [],
      recommendations: result.recommendations ?? [],
    };
  }

  /**
   * Generate structured context block for LLM consumption
   * This is injected as a hidden div or in JSON-LD
   */
  async generateStructuredContext(
    content: string,
    title: string,
  ): Promise<{
    summary: string;
    keyFacts: string[];
    entities: Array<{ name: string; type: string; context: string }>;
    publishedDate?: string;
    primaryTopic: string;
    relatedTopics: string[];
  }> {
    return this.aiGateway.jsonPrompt(
      `You are a knowledge graph builder. Extract structured information from this article
for LLM/AI consumption. Return data that helps AI systems understand and cite this content accurately.`,
      `Title: ${title}\n\nContent:\n${content.substring(0, 4000)}`,
      { temperature: 0.2, analysisType: 'structured_context' },
    );
  }

  /**
   * Generate E-E-A-T signals for the article
   */
  async analyzeEeaT(
    content: string,
    authorBio?: string,
  ): Promise<{
    experience: { score: number; signals: string[] };
    expertise: { score: number; signals: string[] };
    authoritativeness: { score: number; signals: string[] };
    trustworthiness: { score: number; signals: string[] };
    totalScore: number;
    recommendations: string[];
  }> {
    return this.aiGateway.jsonPrompt(
      `You are an E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) specialist.
Analyze the article and return E-E-A-T signals and scores (each dimension 0-25, total 0-100).`,
      `Author bio: ${authorBio ?? 'Not provided'}\n\nContent:\n${content.substring(0, 4000)}`,
      { temperature: 0.2, analysisType: 'eeat_analysis' },
    );
  }

  // ─── Event Handler ─────────────────────────────────────────────────────────

  @OnEvent('article.published')
  async onArticlePublished(event: { articleId: string }) {
    try {
      const article = await this.prisma.article.findUnique({
        where: { id: event.articleId },
        include: { geoData: true },
      });

      if (!article || article.geoData) return;

      const geoScore = await this.calculateGeoScore(
        article.content,
        article.title,
        event.articleId,
      );

      await this.prisma.articleGeo.upsert({
        where: { articleId: event.articleId },
        create: {
          articleId: event.articleId,
          llmReadabilityScore: geoScore.breakdown.llmReadability,
          semanticRichnessScore: geoScore.breakdown.semanticRichness,
          entityCoverageScore: geoScore.breakdown.entityCoverage,
          evidenceScore: geoScore.breakdown.evidence,
          qaCoverageScore: geoScore.breakdown.qaCoverage,
          citationFriendliness: geoScore.breakdown.citationFriendliness,
          geoTotalScore: geoScore.total,
          structuredSummary: geoScore.structuredSummary,
          keyClaims: geoScore.keyClaims,
          entitiesCovered: geoScore.entitiesCovered,
          questionsAnswered: geoScore.questionsAnswered,
        },
        update: {
          llmReadabilityScore: geoScore.breakdown.llmReadability,
          semanticRichnessScore: geoScore.breakdown.semanticRichness,
          entityCoverageScore: geoScore.breakdown.entityCoverage,
          evidenceScore: geoScore.breakdown.evidence,
          qaCoverageScore: geoScore.breakdown.qaCoverage,
          citationFriendliness: geoScore.breakdown.citationFriendliness,
          geoTotalScore: geoScore.total,
          structuredSummary: geoScore.structuredSummary,
          keyClaims: geoScore.keyClaims,
          entitiesCovered: geoScore.entitiesCovered,
          questionsAnswered: geoScore.questionsAnswered,
        },
      });
    } catch (err) {
      console.error('[GEO] Failed to auto-calculate GEO score:', err);
    }
  }
}
