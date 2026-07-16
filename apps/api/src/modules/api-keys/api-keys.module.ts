import { Global, Module } from '@nestjs/common';

import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './api-keys.controller';

// Global: ApiKeyGuard (common/guards) needs ApiKeysService injected wherever
// a controller in any module opts into accepting API-key auth, the same
// reasoning RedisModule is global for.
@Global()
@Module({
  providers: [ApiKeysService],
  controllers: [ApiKeysController],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
