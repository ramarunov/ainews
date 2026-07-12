import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import compression from 'compression';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';

// Prisma returns BigInt for columns like Article.viewCount / MediaFile.fileSize;
// JSON.stringify can't serialize BigInt natively, so every response touching
// those fields would 500 without this.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
  this: bigint,
) {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  // ─── Security ─────────────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // ─── CORS ─────────────────────────────────────────────────────────────────
  const corsOrigins = configService
    .get<string>('CORS_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-Organization-ID',
    ],
  });

  // ─── Compression ──────────────────────────────────────────────────────────
  app.use(compression());

  // ─── Global Validation ───────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,               // Strip unknown properties
      forbidNonWhitelisted: true,    // Throw on unknown properties
      transform: true,               // Auto-transform types
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── API Versioning ───────────────────────────────────────────────────────
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  });

  app.setGlobalPrefix('api');

  // ─── Swagger / OpenAPI ────────────────────────────────────────────────────
  if (configService.get('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('AI News CMS API')
      .setDescription(
        'Enterprise AI Native News CMS — REST API Documentation',
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'JWT',
      )
      .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'API-Key')
      .addTag('Auth', 'Authentication and authorization')
      .addTag('Users', 'User management')
      .addTag('Articles', 'Article CRUD and publishing')
      .addTag('Categories', 'Category management')
      .addTag('Tags', 'Tag management')
      .addTag('Media', 'Media library')
      .addTag('AI', 'AI-powered operations')
      .addTag('SEO', 'SEO engine')
      .addTag('GEO', 'Generative Engine Optimization')
      .addTag('News Intelligence', 'News discovery and analysis')
      .addTag('Search', 'Full-text and semantic search')
      .addTag('Analytics', 'Content analytics')
      .addTag('Workflow', 'Editorial workflow')
      .addTag('Settings', 'Organization settings')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
  }

  // ─── Request Size Limit ──────────────────────────────────────────────────
  app.use('/api/v1/media', (req: any, res: any, next: any) => {
    req.setTimeout(120000); // 2 min for file uploads
    next();
  });

  // ─── Health Check ─────────────────────────────────────────────────────────
  // Available at /health and /health/ready (see HealthModule)

  const port = configService.get<number>('PORT', 4000);
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 AI News CMS API running on: http://localhost:${port}`, 'Bootstrap');
  logger.log(`📖 API Documentation: http://localhost:${port}/api-docs`, 'Bootstrap');
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
