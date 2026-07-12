import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  messages: Message[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
  stream?: boolean;
}

export interface CompletionResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
  latencyMs: number;
  provider: string;
}

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  usage: {
    inputTokens: number;
    estimatedCostUsd: number;
  };
}

export type AIProviderName = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'ollama';

// ─── Provider Cost Table (per 1M tokens, USD) ────────────────────────────────

const COST_TABLE: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 5.0, output: 15.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'gemini-1.5-pro': { input: 3.5, output: 10.5 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_TABLE[model] ?? { input: 1.0, output: 3.0 };
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

// ─── OpenAI Provider ─────────────────────────────────────────────────────────

@Injectable()
export class OpenAIProvider {
  private readonly client: OpenAI;
  private readonly logger = new Logger(OpenAIProvider.name);
  readonly name: AIProviderName = 'openai';

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      apiKey: config.get('OPENAI_API_KEY', ''),
      maxRetries: 2,
      timeout: 60_000,
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model ?? this.config.get<string>('OPENAI_DEFAULT_MODEL', 'gpt-4o');
    const start = Date.now();

    const response = await this.client.chat.completions.create({
      model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
      ...(request.responseFormat === 'json' && {
        response_format: { type: 'json_object' },
      }),
    });

    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;

    return {
      content: response.choices[0]?.message?.content ?? '',
      model,
      provider: this.name,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedCostUsd: estimateCost(model, inputTokens, outputTokens),
      },
      latencyMs: Date.now() - start,
    };
  }

  async embed(text: string): Promise<EmbeddingResponse> {
    const model = this.config.get<string>(
      'OPENAI_EMBEDDING_MODEL',
      'text-embedding-3-large',
    );

    const response = await this.client.embeddings.create({
      model,
      input: text.substring(0, 8000), // Limit input length
    });

    const inputTokens = response.usage?.prompt_tokens ?? 0;

    return {
      embedding: response.data[0].embedding,
      model,
      usage: {
        inputTokens,
        estimatedCostUsd: estimateCost(model, inputTokens, 0),
      },
    };
  }
}

// ─── Anthropic Provider ───────────────────────────────────────────────────────

@Injectable()
export class AnthropicProvider {
  private readonly client: Anthropic;
  readonly name: AIProviderName = 'anthropic';

  constructor(private readonly config: ConfigService) {
    this.client = new Anthropic({
      apiKey: config.get('ANTHROPIC_API_KEY', ''),
      maxRetries: 2,
      timeout: 60_000,
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model ??
      this.config.get<string>('ANTHROPIC_DEFAULT_MODEL', 'claude-3-5-sonnet-20241022');
    const start = Date.now();

    // Extract system message from messages array
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const userMessages = request.messages.filter((m) => m.role !== 'system');

    const response = await this.client.messages.create({
      model,
      system: systemMessage?.content,
      messages: userMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
    });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const content =
      response.content[0].type === 'text' ? response.content[0].text : '';

    return {
      content,
      model,
      provider: this.name,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedCostUsd: estimateCost(model, inputTokens, outputTokens),
      },
      latencyMs: Date.now() - start,
    };
  }
}

// ─── Google AI Provider ───────────────────────────────────────────────────────

@Injectable()
export class GoogleAIProvider {
  private readonly genAI: GoogleGenerativeAI;
  readonly name: AIProviderName = 'google';

  constructor(private readonly config: ConfigService) {
    this.genAI = new GoogleGenerativeAI(config.get('GOOGLE_AI_API_KEY', ''));
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const modelName = request.model ??
      this.config.get<string>('GOOGLE_AI_DEFAULT_MODEL', 'gemini-1.5-pro');
    const start = Date.now();

    const model = this.genAI.getGenerativeModel({ model: modelName });

    const systemMessage = request.messages.find((m) => m.role === 'system');
    const userMessages = request.messages.filter((m) => m.role !== 'system');

    const prompt = systemMessage
      ? `${systemMessage.content}\n\n${userMessages.map((m) => m.content).join('\n\n')}`
      : userMessages.map((m) => m.content).join('\n\n');

    const result = await model.generateContent(prompt);
    const response = result.response;
    const content = response.text();

    const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

    return {
      content,
      model: modelName,
      provider: this.name,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedCostUsd: estimateCost(modelName, inputTokens, outputTokens),
      },
      latencyMs: Date.now() - start,
    };
  }
}
