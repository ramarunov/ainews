// Well-known SystemSetting keys for AI provider credentials. Shared between
// SystemSettingsService (which encrypts/stores them) and the AI provider
// classes (which decrypt/read them at call time).
export const AI_PROVIDER_SETTING_KEYS = {
  openaiApiKey: 'ai.openai_api_key',
  anthropicApiKey: 'ai.anthropic_api_key',
  googleAiApiKey: 'ai.google_ai_api_key',
} as const;

export type AiProviderKeyField = keyof typeof AI_PROVIDER_SETTING_KEYS;

// Platform-wide emergency kill switch — every AI call path (autonomous
// pipeline, manual AI Tools, clustering entity extraction, alt-text
// generation, GEO scoring) ultimately goes through AIGatewayService.complete(),
// which checks this before doing anything else. Deliberately NOT stored via
// AI_PROVIDER_SETTING_KEYS/EncryptionService — this is a plain flag, not a
// secret, and toggling it off must never require re-entering API keys.
export const AI_SERVICES_ENABLED_KEY = 'ai.services_enabled';
