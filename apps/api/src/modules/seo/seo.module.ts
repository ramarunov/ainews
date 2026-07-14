import { Module } from '@nestjs/common';
import { SeoService } from './seo.service';
import { SeoController } from './seo.controller';
import { RedirectsService } from './redirects.service';
import { RedirectsController } from './redirects.controller';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [AIModule],
  providers: [SeoService, RedirectsService],
  controllers: [SeoController, RedirectsController],
  exports: [SeoService, RedirectsService],
})
export class SeoModule {}
