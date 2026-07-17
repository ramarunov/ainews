import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { CacheModule } from '@nestjs/cache-manager';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { redisStore } from 'cache-manager-redis-yet';

import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { OpenSearchModule } from './infrastructure/opensearch/opensearch.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { EncryptionModule } from './common/crypto/encryption.module';
import { EmailModule } from './common/email/email.module';
import { GuardsModule } from './common/guards/guards.module';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { TagsModule } from './modules/tags/tags.module';
import { SeriesModule } from './modules/series/series.module';
import { MediaModule } from './modules/media/media.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { SearchModule } from './modules/search/search.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SettingsModule } from './modules/settings/settings.module';
import { PluginsModule } from './modules/plugins/plugins.module';
import { ThemesModule } from './modules/themes/themes.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { HealthModule } from './modules/health/health.module';

import { AIModule } from './modules/ai/ai.module';
import { SeoModule } from './modules/seo/seo.module';
import { GeoModule } from './modules/geo/geo.module';
import { NewsIntelligenceModule } from './modules/news-intelligence/news-intelligence.module';
import { CommentsModule } from './modules/comments/comments.module';
import { AuditModule } from './modules/audit/audit.module';
import { SystemSettingsModule } from './modules/system-settings/system-settings.module';
import { PublicSiteModule } from './modules/public-site/public-site.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { BackupModule } from './modules/backup/backup.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';

import { configValidationSchema } from './config/config.validation';
import { AuditLogService } from './common/audit/audit-log.service';
import { AuditInterceptor } from './common/audit/audit.interceptor';
import { OrgContextInterceptor } from './common/interceptors/org-context.interceptor';
import { MetricsInterceptor } from './modules/metrics/metrics.interceptor';

@Module({
  imports: [
    // ─── Config ─────────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema: configValidationSchema,
      validationOptions: { abortEarly: false },
    }),

    // ─── Logging ─────────────────────────────────────────────────────────────
    WinstonModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        transports: [
          new winston.transports.Console({
            format:
              config.get('NODE_ENV') === 'production'
                ? winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json(),
                  )
                : winston.format.combine(
                    winston.format.colorize(),
                    winston.format.timestamp({ format: 'HH:mm:ss' }),
                    winston.format.printf(({ level, message, timestamp, context }) => {
                      return `${timestamp} [${context ?? 'App'}] ${level}: ${message}`;
                    }),
                  ),
          }),
        ],
        level: config.get('LOG_LEVEL', 'info'),
      }),
      inject: [ConfigService],
    }),

    // ─── Rate Limiting ───────────────────────────────────────────────────────
    ThrottlerModule.forRootAsync({
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('RATE_LIMIT_WINDOW_MS', 60000),
          limit: config.get<number>('RATE_LIMIT_MAX_REQUESTS', 100),
        },
      ],
      inject: [ConfigService],
    }),

    // ─── Event Emitter ───────────────────────────────────────────────────────
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),

    // ─── Scheduler ───────────────────────────────────────────────────────────
    ScheduleModule.forRoot(),

    // ─── Queue (BullMQ) ───────────────────────────────────────────────────────
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD') || undefined,
          db: config.get<number>('REDIS_DB', 0),
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: config.get<number>('QUEUE_RETRY_ATTEMPTS', 3),
          backoff: {
            type: 'exponential',
            delay: config.get<number>('QUEUE_RETRY_DELAY_MS', 5000),
          },
        },
      }),
      inject: [ConfigService],
    }),

    // ─── Cache (Redis) ────────────────────────────────────────────────────────
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async (config: ConfigService) => ({
        store: await redisStore({
          socket: {
            host: config.get('REDIS_HOST', 'localhost'),
            port: config.get<number>('REDIS_PORT', 6379),
          },
          password: config.get('REDIS_PASSWORD') || undefined,
          database: config.get<number>('REDIS_DB', 0),
        }),
        ttl: config.get<number>('REDIS_CACHE_TTL', 3600) * 1000, // ms
      }),
      inject: [ConfigService],
    }),

    // ─── Infrastructure ──────────────────────────────────────────────────────
    PrismaModule,
    RedisModule,
    OpenSearchModule,
    StorageModule,
    EncryptionModule,
    EmailModule,
    GuardsModule,

    // ─── Feature Modules ─────────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    OrganizationsModule,
    ArticlesModule,
    CategoriesModule,
    TagsModule,
    SeriesModule,
    MediaModule,
    WorkflowModule,
    SearchModule,
    AnalyticsModule,
    NotificationsModule,
    SettingsModule,
    PluginsModule,
    ThemesModule,
    WebhooksModule,
    HealthModule,
    SystemSettingsModule,
    PublicSiteModule,
    MetricsModule,
    BackupModule,
    ApiKeysModule,
    CommentsModule,

    // ─── AI & Intelligence ───────────────────────────────────────────────────
    AIModule,
    SeoModule,
    GeoModule,
    NewsIntelligenceModule,

    // ─── Audit ───────────────────────────────────────────────────────────────
    AuditModule,
  ],
  providers: [
    AuditLogService,
    // SECURITY.md documents per-route rate limits (login 5/15min, etc. via
    // the @Throttle() decorators already on auth/ai controllers), but those
    // decorators do nothing unless ThrottlerGuard is actually bound
    // somewhere - it never was. Binding it globally here is what makes both
    // the per-route overrides AND the default 100/60s fallback (registered
    // above) actually apply to every endpoint.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Order matters: OrgContextInterceptor must run first so its RLS
    // context wraps AuditInterceptor's own downstream audit-log write too.
    { provide: APP_INTERCEPTOR, useClass: OrgContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
