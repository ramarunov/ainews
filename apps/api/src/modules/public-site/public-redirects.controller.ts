import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

import { RedirectsService } from '../seo/redirects.service';
import { PublicSiteService } from './public-site.service';
import { ResolvePathDto } from '../seo/dto/redirect.dto';
import { Public } from '../../common/decorators/public.decorator';
import { PublicSiteRead } from '../../common/decorators/public-site-read.decorator';

// Called by the public reader site right before it would render a 404,
// so an editor's redirect takes effect instead — and so a genuine miss
// gets recorded for the 404 monitor (see RedirectsService.resolve()).
@ApiTags('Public Site')
@Public()
@PublicSiteRead()
@Controller({ path: 'public', version: '1' })
export class PublicRedirectsController {
  constructor(
    private readonly redirectsService: RedirectsService,
    private readonly publicSiteService: PublicSiteService,
  ) {}

  @Get('resolve')
  @ApiOperation({ summary: 'Resolve a path to a redirect, or record it as a 404 miss' })
  resolve(@Query() query: ResolvePathDto) {
    return this.redirectsService.resolve(
      query.path,
      this.publicSiteService.getPublicOrgId(),
      query.referrer,
    );
  }
}
