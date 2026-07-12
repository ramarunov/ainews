import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { OpenAIProvider, AnthropicProvider, GoogleAIProvider } from './ai-providers';

jest.mock('openai');
jest.mock('@anthropic-ai/sdk');
jest.mock('@google/generative-ai');

const MockedOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>;
const MockedAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;
const MockedGoogleGenerativeAI = GoogleGenerativeAI as jest.MockedClass<
  typeof GoogleGenerativeAI
>;

describe('AI provider key resolution', () => {
  let config: any;
  let systemSettings: any;

  beforeEach(() => {
    jest.clearAllMocks();
    config = { get: jest.fn((_key: string, fallback?: any) => fallback) };
    systemSettings = { getDecryptedValue: jest.fn().mockResolvedValue(null) };
  });

  it('OpenAIProvider falls back to the env var when no platform-wide key is configured', async () => {
    config.get = jest.fn((key: string, fallback?: any) =>
      key === 'OPENAI_API_KEY' ? 'env-openai-key' : fallback,
    );
    MockedOpenAI.prototype.chat = {
      completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'hi' } }], usage: {} }) },
    } as any;

    const provider = new OpenAIProvider(config, systemSettings);
    await provider.complete({ messages: [{ role: 'user', content: 'hi' }] });

    expect(MockedOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'env-openai-key' }),
    );
  });

  it('OpenAIProvider prefers a platform-wide key configured via System Settings over the env var', async () => {
    config.get = jest.fn((key: string, fallback?: any) =>
      key === 'OPENAI_API_KEY' ? 'env-openai-key' : fallback,
    );
    systemSettings.getDecryptedValue.mockResolvedValue('db-openai-key');
    MockedOpenAI.prototype.chat = {
      completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'hi' } }], usage: {} }) },
    } as any;

    const provider = new OpenAIProvider(config, systemSettings);
    await provider.complete({ messages: [{ role: 'user', content: 'hi' }] });

    expect(MockedOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'db-openai-key' }),
    );
  });

  it('AnthropicProvider prefers the System Settings key over the env var', async () => {
    systemSettings.getDecryptedValue.mockResolvedValue('db-anthropic-key');
    MockedAnthropic.prototype.messages = {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'hi' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    } as any;

    const provider = new AnthropicProvider(config, systemSettings);
    await provider.complete({ messages: [{ role: 'user', content: 'hi' }] });

    expect(MockedAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'db-anthropic-key' }),
    );
  });

  it('GoogleAIProvider prefers the System Settings key over the env var', async () => {
    systemSettings.getDecryptedValue.mockResolvedValue('db-google-key');
    MockedGoogleGenerativeAI.prototype.getGenerativeModel = jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: { text: () => 'hi', usageMetadata: {} },
      }),
    });

    const provider = new GoogleAIProvider(config, systemSettings);
    await provider.complete({ messages: [{ role: 'user', content: 'hi' }] });

    expect(MockedGoogleGenerativeAI).toHaveBeenCalledWith('db-google-key');
  });
});
