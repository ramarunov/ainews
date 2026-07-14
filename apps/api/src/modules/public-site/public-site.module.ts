import { Module } from '@nestjs/common';

import { PublicSiteService } from './public-site.service';
import { PublicSiteController } from './public-site.controller';
import { PublicRedirectsController } from './public-redirects.controller';
import { ArticlesModule } from '../articles/articles.module';
import { SeoModule } from '../seo/seo.module';

@Module({
  imports: [ArticlesModule, SeoModule],
  providers: [PublicSiteService],
  controllers: [PublicSiteController, PublicRedirectsController],
})
export class PublicSiteModule {}
