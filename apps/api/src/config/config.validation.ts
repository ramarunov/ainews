import * as Joi from 'joi';

// The exact placeholder values shipped in .env.example - if any of these
// cryptographic secrets are still set to their documented "change this"
// default in production, that's not a dev convenience anymore, it's every
// deployment of this app sharing the same publicly-committed key. Refusing
// to boot is the only safe response; a warning alone is too easy to miss.
const PLACEHOLDER_SECRETS: Record<string, string> = {
  JWT_SECRET: 'change-this-to-a-very-long-random-secret-at-least-64-chars',
  JWT_REFRESH_SECRET: 'change-this-to-another-very-long-random-secret',
  SESSION_SECRET: 'change-this-session-secret',
  ENCRYPTION_KEY: 'change-this-32-char-encryption-key!!',
  CSRF_SECRET: 'change-this-csrf-secret',
  WEBHOOK_SECRET: 'change-this-webhook-secret',
};

function rejectPlaceholderInProduction(field: keyof typeof PLACEHOLDER_SECRETS) {
  return Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.invalid(PLACEHOLDER_SECRETS[field]).messages({
      'any.invalid': `${field} is still the .env.example placeholder value - set a real secret before running in production`,
    }),
  });
}

export const configValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production', 'test')
    .default('development'),

  PORT: Joi.number().default(4000),
  APP_URL: Joi.string().default('http://localhost:3000'),
  API_URL: Joi.string().default('http://localhost:4000'),

  DATABASE_URL: Joi.string().required(),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  REDIS_DB: Joi.number().default(0),

  OPENSEARCH_URL: Joi.string().default('http://localhost:9200'),

  JWT_SECRET: Joi.string().min(32).required().concat(rejectPlaceholderInProduction('JWT_SECRET')),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string()
    .min(32)
    .required()
    .concat(rejectPlaceholderInProduction('JWT_REFRESH_SECRET')),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  BCRYPT_ROUNDS: Joi.number().min(10).max(16).default(12),

  SESSION_SECRET: Joi.string().concat(rejectPlaceholderInProduction('SESSION_SECRET')),
  ENCRYPTION_KEY: Joi.string()
    .min(32)
    .required()
    .concat(rejectPlaceholderInProduction('ENCRYPTION_KEY')),
  CSRF_SECRET: Joi.string().concat(rejectPlaceholderInProduction('CSRF_SECRET')),
  WEBHOOK_SECRET: Joi.string().concat(rejectPlaceholderInProduction('WEBHOOK_SECRET')),

  // Sentry is a soft observability requirement, not a security-critical
  // secret - missing it in production is worth a boot-time warning (see
  // main.ts), not a hard refusal to start the way a leaked crypto key is.
  SENTRY_DSN: Joi.string().allow('').default(''),

  S3_ENDPOINT: Joi.string().required(),
  S3_REGION: Joi.string().required(),
  S3_BUCKET: Joi.string().required(),
  S3_ACCESS_KEY: Joi.string().required(),
  S3_SECRET_KEY: Joi.string().required(),

  AI_PRIMARY_PROVIDER: Joi.string()
    .valid('openai', 'google', 'anthropic', 'openrouter', 'ollama')
    .default('openai'),

  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug', 'verbose')
    .default('info'),

  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),

  RATE_LIMIT_WINDOW_MS: Joi.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),
});
