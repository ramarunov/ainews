// Read directly from process.env (validated at boot by config.validation.ts's
// Joi schema) rather than via ConfigService, since Multer's FileInterceptor
// options are a decorator argument evaluated at module-load time, before
// Nest's DI container - and therefore ConfigService - exists.
const rawMaxUploadMb = Number(process.env.MEDIA_MAX_UPLOAD_MB);
const MAX_UPLOAD_MB = Number.isFinite(rawMaxUploadMb) && rawMaxUploadMb > 0 ? rawMaxUploadMb : 25;

export const MEDIA_MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
