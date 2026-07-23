import { Controller, Get, Header, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { PublicSiteService } from './public-site.service';
import { PublicSearchQueryDto } from './dto/public-search-query.dto';
import { Public } from '../../common/decorators/public.decorator';
import { PublicSiteRead } from '../../common/decorators/public-site-read.decorator';
import { PUBLIC_CACHE_CONTROL } from '../../common/public-cache.constants';

// Supporting data for the public reader site beyond articles themselves:
// category nav, author profile pages, public search, and publicly-readable
// site settings (e.g. ad widget snippets). Kept separate from
// PublicSiteController (path "public/articles") and PublicRedirectsController
// (redirect-specific) since these are a distinct, growing set of concerns.
@ApiTags('Public Site')
@Public()
@PublicSiteRead()
@Controller({ path: 'public', version: '1' })
export class PublicContentController {
  constructor(private readonly publicSiteService: PublicSiteService) {}

  @Get('categories')
  @Header('Cache-Control', PUBLIC_CACHE_CONTROL)
  @ApiOperation({ summary: 'List categories for the public reader site nav' })
  listCategories() {
    return this.publicSiteService.listCategories();
  }

  @Get('pages')
  @Header('Cache-Control', PUBLIC_CACHE_CONTROL)
  @ApiOperation({ summary: 'List published static pages (About, Contact, ...) for the public site nav/footer' })
  listPages() {
    return this.publicSiteService.listPages();
  }

  @Get('pages/:slug')
  @Header('Cache-Control', PUBLIC_CACHE_CONTROL)
  @ApiOperation({ summary: 'Get a published static page by slug' })
  getPage(@Param('slug') slug: string) {
    return this.publicSiteService.getPublishedPageBySlug(slug);
  }

  @Get('authors/:id')
  @Header('Cache-Control', PUBLIC_CACHE_CONTROL)
  @ApiOperation({ summary: 'Get a public author profile' })
  getAuthor(@Param('id', ParseUUIDPipe) id: string) {
    return this.publicSiteService.getAuthorProfile(id);
  }

  // Deliberately not cached like the endpoints above - full-text search
  // results are query-specific (unbounded cardinality of possible q values)
  // and the frontend already fetches this with cache: "no-store". Throttled
  // well below the global default (100/min): unauthenticated, DB-hitting,
  // and easy to hammer for scraping/resource-exhaustion otherwise.
  @Get('search')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Full-text search across published articles' })
  search(@Query() query: PublicSearchQueryDto) {
    return this.publicSiteService.search(query.q, query.page, query.limit);
  }

  @Get('settings')
  @Header('Cache-Control', PUBLIC_CACHE_CONTROL)
  @ApiOperation({ summary: 'List publicly-readable site settings (e.g. ad widgets)' })
  getPublicSettings() {
    return this.publicSiteService.getPublicSettings();
  }
}
