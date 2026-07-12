import { Module } from '@nestjs/common';

import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { OpenSearchModule } from '../../infrastructure/opensearch/opensearch.module';

@Module({
  imports: [OpenSearchModule],
  providers: [SearchService],
  controllers: [SearchController],
  exports: [SearchService],
})
export class SearchModule {}
