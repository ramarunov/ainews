import { Module } from '@nestjs/common';

import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { PublicCommentsController } from './public-comments.controller';
import { PublicSiteModule } from '../public-site/public-site.module';

@Module({
  imports: [PublicSiteModule],
  providers: [CommentsService],
  controllers: [CommentsController, PublicCommentsController],
})
export class CommentsModule {}
