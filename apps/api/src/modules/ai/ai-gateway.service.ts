import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Redis } from 'ioredis';

import {
  OpenAIProvider,
  AnthropicProvider,
  GoogleAIProvider,
  CompletionRequest,
  CompletionResponse,
  EmbeddingResponse,
  AIProviderName,
} from './providers/ai-providers';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';

const AI_CACHE_PREFIX = 'ai:cache:';
const AI_CACHE_TTL = 3600; // 1 hour
const CIRCUIT_BREAKER_PREFIX = 'ai:circuit:';
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_RESET_TTL = 60; // 60 seconds

@Injectable()
export class AIGatewayService {
  private readonly logger = new Logger(AIGatewayService.name);

  constructor(
    private readonly openai: OpenAIProvider,
    private readonly anthropic: AnthropicProvider,
    private readonly google: GoogleAIProvider,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly systemSettings: SystemSettingsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Route a completion request to the appropriate provider with
   * circuit breaking, caching, and fallback logic.
   */
  async complete(
    request: CompletionRequest,
    options: {
      provider?: AIProviderName;
      organizationId?: string;
      articleId?: string;
      analysisType?: string;
      useCache?: boolean;
    } = {},
  ): Promise<CompletionResponse> {
    // Every AI call path (autonomous pipeline, manual AI Tools, clustering
    // entity extraction, alt-text, GEO) funnels through here - this is the
    // one choke point for the emergency kill switch, checked before cache/
    // circuit-breaker/provider logic so a disabled admin toggle fails fast
    // and cheaply rather than partway through.
    if (!(await this.systemSettings.isAiServicesEnabled())) {
      throw new ServiceUnavailableException('AI services are currently disabled by an administrator');
    }

    const { useCache = true, provider: preferredProvider } = options;

    // Cache check (skip for temperature > 0.5 or stream requests)
    if (useCache && (request.temperature ?? 0.7) <= 0.5) {
      const cacheKey = this.buildCacheKey(request);
      const cached = await this.redis.get(`${AI_CACHE_PREFIX}${cacheKey}`);
      if (cached) {
        this.logger.debug(`AI cache hit for key ${cacheKey}`);
        return { ...JSON.parse(cached), cached: true } as CompletionResponse;
      }
    }

    const primaryProviderName =
      preferredProvider ??
      (this.config.get('AI_PRIMARY_PROVIDER', 'openai') as AIProviderName);

    const fallbackProviderName = this.config.get(
      'AI_FALLBACK_PROVIDER',
      'anthropic',
    ) as AIProviderName;

    let response: CompletionResponse;

    try {
      await this.checkCircuitBreaker(primaryProviderName);
      response = await this.callProvider(primaryProviderName, request);
      await this.resetCircuitBreaker(primaryProviderName);
    } catch (primaryError) {
      this.logger.warn(
        `Primary AI provider ${primaryProviderName} failed: ${primaryError.message}. Trying fallback.`,
      );

      try {
        await this.checkCircuitBreaker(fallbackProviderName);
        response = await this.callProvider(fallbackProviderName, request);
        await this.resetCircuitBreaker(fallbackProviderName);
      } catch (fallbackError) {
        this.logger.error(
          `Both AI providers failed. Primary: ${primaryError.message}, Fallback: ${fallbackError.message}`,
        );
        throw new ServiceUnavailableException(
          'AI service is temporarily unavailable',
        );
      }
    }

    // Cache result
    if (useCache && (request.temperature ?? 0.7) <= 0.5) {
      const cacheKey = this.buildCacheKey(request);
      await this.redis.setex(
        `${AI_CACHE_PREFIX}${cacheKey}`,
        AI_CACHE_TTL,
        JSON.stringify(response),
      );
    }

    // Record usage asynchronously
    this.recordUsage(response, options).catch((err) =>
      this.logger.error('Failed to record AI usage:', err),
    );

    return response;
  }

  /**
   * Generate embeddings for semantic search/similarity
   */
  async embed(text: string): Promise<EmbeddingResponse> {
    if (!(await this.systemSettings.isAiServicesEnabled())) {
      throw new ServiceUnavailableException('AI services are currently disabled by an administrator');
    }
    return this.openai.embed(text);
  }

  /**
   * Convenience: run a prompt with a system + user message
   */
  async prompt(
    systemPrompt: string,
    userPrompt: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: 'text' | 'json';
      provider?: AIProviderName;
      organizationId?: string;
      articleId?: string;
      analysisType?: string;
    } = {},
  ): Promise<string> {
    const response = await this.complete(
      {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 4096,
        responseFormat: options.responseFormat,
      },
      {
        provider: options.provider,
        organizationId: options.organizationId,
        articleId: options.articleId,
        analysisType: options.analysisType,
        useCache: (options.temperature ?? 0.7) < 0.5,
      },
    );

    return response.content;
  }

  /**
   * Convenience: run a prompt with an image attached to the user message
   * (vision). Only OpenAI currently understands `imageUrl` (see
   * CompletionRequest) — always uncached, since two different images with
   * identical prompt text must never collide on the same cache entry.
   */
  async visionPrompt(
    systemPrompt: string,
    userPrompt: string,
    imageUrl: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      organizationId?: string;
      articleId?: string;
      analysisType?: string;
    } = {},
  ): Promise<string> {
    const response = await this.complete(
      {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        imageUrl,
        temperature: options.temperature ?? 0.4,
        maxTokens: options.maxTokens ?? 256,
      },
      {
        organizationId: options.organizationId,
        articleId: options.articleId,
        analysisType: options.analysisType,
        useCache: false,
      },
    );

    return response.content;
  }

  /**
   * JSON prompt — auto-parses response as JSON with retry on parse failure
   */
  async jsonPrompt<T>(
    systemPrompt: string,
    userPrompt: string,
    options: Parameters<typeof this.prompt>[2] = {},
  ): Promise<T> {
    const content = await this.prompt(systemPrompt, userPrompt, {
      ...options,
      responseFormat: 'json',
      temperature: options.temperature ?? 0.3, // Lower temp for structured output
    });

    try {
      return JSON.parse(content) as T;
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]) as T;
        } catch {
          // fall through to the error below
        }
      }
      throw new Error(`AI returned invalid JSON: ${content.substring(0, 200)}`);
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async callProvider(
    providerName: AIProviderName,
    request: CompletionRequest,
  ): Promise<CompletionResponse> {
    switch (providerName) {
      case 'openai':
        return this.openai.complete(request);
      case 'anthropic':
        return this.anthropic.complete(request);
      case 'google':
        return this.google.complete(request);
      default:
        return this.openai.complete(request);
    }
  }

  private buildCacheKey(request: CompletionRequest): string {
    const content = JSON.stringify({
      messages: request.messages,
      model: request.model,
      temperature: request.temperature,
      imageUrl: request.imageUrl,
    });
    return createHash('sha256').update(content).digest('hex').substring(0, 32);
  }

  private async checkCircuitBreaker(provider: AIProviderName) {
    const key = `${CIRCUIT_BREAKER_PREFIX}${provider}`;
    const failures = await this.redis.get(key);

    if (failures && parseInt(failures) >= CIRCUIT_THRESHOLD) {
      throw new Error(
        `Circuit breaker open for provider ${provider} (${failures} failures)`,
      );
    }
  }

  private async resetCircuitBreaker(provider: AIProviderName) {
    const key = `${CIRCUIT_BREAKER_PREFIX}${provider}`;
    await this.redis.del(key);
  }

  private async incrementCircuitBreaker(provider: AIProviderName) {
    const key = `${CIRCUIT_BREAKER_PREFIX}${provider}`;
    await this.redis
      .multi()
      .incr(key)
      .expire(key, CIRCUIT_RESET_TTL)
      .exec();
  }

  private async recordUsage(
    response: CompletionResponse,
    options: {
      organizationId?: string;
      articleId?: string;
      analysisType?: string;
    },
  ) {
    if (!options.articleId && !options.organizationId) return;

    if (options.articleId && options.analysisType) {
      await this.prisma.articleAiAnalysis.create({
        data: {
          articleId: options.articleId,
          analysisType: options.analysisType,
          provider: response.provider,
          model: response.model,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          costUsd: response.usage.estimatedCostUsd,
          result: {},
          durationMs: response.latencyMs,
        },
      });
    }
  }
}
