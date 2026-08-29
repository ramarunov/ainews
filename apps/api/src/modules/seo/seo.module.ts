import { Module } from '@nestjs/common';
import { SeoService } from './seo.service';
import { SeoController } from './seo.controller';
import { RedirectsService } from './redirects.service';
import { RedirectsController } from './redirects.controller';
import { WikidataService } from './wikidata.service';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [AIModule],
  providers: [SeoService, RedirectsService, WikidataService],
  controllers: [SeoController, RedirectsController],
  exports: [SeoService, RedirectsService],
})
export class SeoModule {}
