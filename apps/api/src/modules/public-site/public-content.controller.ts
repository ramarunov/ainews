import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

import { PublicSiteService } from './public-site.service';
import { PublicSearchQueryDto } from './dto/public-search-query.dto';
import { Public } from '../../common/decorators/public.decorator';
import { PublicSiteRead } from '../../common/decorators/public-site-read.decorator';

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
  @ApiOperation({ summary: 'List categories for the public reader site nav' })
  listCategories() {
    return this.publicSiteService.listCategories();
  }

  @Get('authors/:id')
  @ApiOperation({ summary: 'Get a public author profile' })
  getAuthor(@Param('id', ParseUUIDPipe) id: string) {
    return this.publicSiteService.getAuthorProfile(id);
  }

  @Get('search')
  @ApiOperation({ summary: 'Full-text search across published articles' })
  search(@Query() query: PublicSearchQueryDto) {
    return this.publicSiteService.search(query.q, query.page, query.limit);
  }

  @Get('settings')
  @ApiOperation({ summary: 'List publicly-readable site settings (e.g. ad widgets)' })
  getPublicSettings() {
    return this.publicSiteService.getPublicSettings();
  }
}
