import { configValidationSchema } from './config.validation';

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a-real-random-secret-that-is-at-least-32-chars-long',
  JWT_REFRESH_SECRET: 'another-real-random-secret-at-least-32-chars-long',
  ENCRYPTION_KEY: 'a-real-32-char-or-longer-encryption-key',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
};

function validate(env: Record<string, string>) {
  return configValidationSchema.validate(env, { abortEarly: false, allowUnknown: true });
}

describe('configValidationSchema', () => {
  it('passes with real secrets in production', () => {
    const { error } = validate({ ...baseEnv, NODE_ENV: 'production' });
    expect(error).toBeUndefined();
  });

  it('passes with the .env.example placeholder secrets in development', () => {
    const { error } = validate({
      ...baseEnv,
      NODE_ENV: 'development',
      JWT_SECRET: 'change-this-to-a-very-long-random-secret-at-least-64-chars',
      JWT_REFRESH_SECRET: 'change-this-to-another-very-long-random-secret',
      SESSION_SECRET: 'change-this-session-secret',
      ENCRYPTION_KEY: 'change-this-32-char-encryption-key!!',
      CSRF_SECRET: 'change-this-csrf-secret',
      WEBHOOK_SECRET: 'change-this-webhook-secret',
    });
    expect(error).toBeUndefined();
  });

  it.each([
    ['JWT_SECRET', 'change-this-to-a-very-long-random-secret-at-least-64-chars'],
    ['JWT_REFRESH_SECRET', 'change-this-to-another-very-long-random-secret'],
    ['SESSION_SECRET', 'change-this-session-secret'],
    ['ENCRYPTION_KEY', 'change-this-32-char-encryption-key!!'],
    ['CSRF_SECRET', 'change-this-csrf-secret'],
    ['WEBHOOK_SECRET', 'change-this-webhook-secret'],
  ])('refuses to boot in production if %s is still the placeholder default', (field, placeholder) => {
    const { error } = validate({ ...baseEnv, NODE_ENV: 'production', [field]: placeholder });
    expect(error).toBeDefined();
    expect(error!.message).toContain(field);
  });

  it('does not flag a real, non-placeholder secret in production', () => {
    const { error } = validate({
      ...baseEnv,
      NODE_ENV: 'production',
      SESSION_SECRET: 'a-totally-different-real-secret',
      CSRF_SECRET: 'another-real-secret-value',
      WEBHOOK_SECRET: 'yet-another-real-secret',
    });
    expect(error).toBeUndefined();
  });
});
