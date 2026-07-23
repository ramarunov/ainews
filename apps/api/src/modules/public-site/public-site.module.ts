import { Module } from '@nestjs/common';

import { PublicSiteService } from './public-site.service';
import { PublicSiteController } from './public-site.controller';
import { PublicRedirectsController } from './public-redirects.controller';
import { PublicContentController } from './public-content.controller';
import { ArticlesModule } from '../articles/articles.module';
import { SeoModule } from '../seo/seo.module';
import { CategoriesModule } from '../categories/categories.module';
import { PagesModule } from '../pages/pages.module';
import { SearchModule } from '../search/search.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [ArticlesModule, SeoModule, CategoriesModule, PagesModule, SearchModule, SettingsModule],
  providers: [PublicSiteService],
  controllers: [PublicSiteController, PublicRedirectsController, PublicContentController],
  exports: [PublicSiteService],
})
export class PublicSiteModule {}
