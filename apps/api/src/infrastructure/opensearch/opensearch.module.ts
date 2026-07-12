import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Client } from '@opensearch-project/opensearch';

export const OPENSEARCH_CLIENT = 'OPENSEARCH_CLIENT';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: OPENSEARCH_CLIENT,
      useFactory: (configService: ConfigService) => {
        return new Client({
          node: configService.get('OPENSEARCH_URL', 'http://localhost:9200'),
          auth: configService.get('OPENSEARCH_USERNAME')
            ? {
                username: configService.get('OPENSEARCH_USERNAME', 'admin'),
                password: configService.get('OPENSEARCH_PASSWORD', 'admin'),
              }
            : undefined,
          ssl: {
            rejectUnauthorized: false, // Adjust for production
          },
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [OPENSEARCH_CLIENT],
})
export class OpenSearchModule {}
