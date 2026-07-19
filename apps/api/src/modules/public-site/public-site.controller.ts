import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

import { PublicSiteService } from './public-site.service';
import { PublicArticlesQueryDto } from './dto/public-articles-query.dto';
import { Public } from '../../common/decorators/public.decorator';
import { PublicSiteRead } from '../../common/decorators/public-site-read.decorator';
import { PUBLIC_CACHE_CONTROL } from '../../common/public-cache.constants';

// Deliberately unauthenticated and read-only: this is the public reader
// site's API surface, not the editorial one (see ArticlesController for
// that). Single-tenant — see PublicSiteService's getPublicOrgId() comment.
@ApiTags('Public Site')
@Public()
@PublicSiteRead()
@Controller({ path: 'public/articles', version: '1' })
export class PublicSiteController {
  constructor(private readonly publicSiteService: PublicSiteService) {}

  @Get()
  @Header('Cache-Control', PUBLIC_CACHE_CONTROL)
  @ApiOperation({ summary: 'List published articles for the public reader site' })
  list(@Query() query: PublicArticlesQueryDto) {
    return this.publicSiteService.listPublished(query);
  }

  @Get(':slug')
  @Header('Cache-Control', PUBLIC_CACHE_CONTROL)
  @ApiOperation({ summary: 'Get a single published article by slug' })
  findBySlug(@Param('slug') slug: string) {
    return this.publicSiteService.findPublishedBySlug(slug);
  }
}
