import { Module } from '@nestjs/common';

import { PublicSiteService } from './public-site.service';
import { PublicSiteController } from './public-site.controller';
import { ArticlesModule } from '../articles/articles.module';

@Module({
  imports: [ArticlesModule],
  providers: [PublicSiteService],
  controllers: [PublicSiteController],
})
export class PublicSiteModule {}
