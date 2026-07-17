import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';

import { CommentsService } from './comments.service';
import { SubmitCommentDto } from './dto/comment.dto';
import { Public } from '../../common/decorators/public.decorator';
import { PublicSiteRead } from '../../common/decorators/public-site-read.decorator';

// Same @PublicSiteRead() decorator the read-only public-site endpoints use
// (see org-context.interceptor.ts) - despite the name, it's about
// establishing the PUBLIC_SITE_ORG_ID RLS context for an unauthenticated
// request, not about the HTTP verb, so it's correct to reuse for this
// module's POST endpoint too.
@ApiTags('Public Comments')
@Public()
@PublicSiteRead()
@Controller({ path: 'public/articles', version: '1' })
export class PublicCommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get(':slug/comments')
  @ApiOperation({ summary: 'List approved comments for a published article, threaded' })
  list(@Param('slug') slug: string) {
    return this.commentsService.listApprovedComments(slug);
  }

  @Post(':slug/comments')
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @ApiOperation({ summary: 'Submit a comment (or reply) for moderation - guest, no account needed' })
  submit(@Param('slug') slug: string, @Body() dto: SubmitCommentDto, @Req() req: Request) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress;
    return this.commentsService.submitComment(slug, dto, ipAddress);
  }
}
