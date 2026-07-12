// Well-known SystemSetting keys for AI provider credentials. Shared between
// SystemSettingsService (which encrypts/stores them) and the AI provider
// classes (which decrypt/read them at call time).
export const AI_PROVIDER_SETTING_KEYS = {
  openaiApiKey: 'ai.openai_api_key',
  anthropicApiKey: 'ai.anthropic_api_key',
  googleAiApiKey: 'ai.google_ai_api_key',
} as const;

export type AiProviderKeyField = keyof typeof AI_PROVIDER_SETTING_KEYS;
