import { Controller, Get, Patch, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { CommentsService } from './comments.service';
import { ModerateCommentDto, CommentQueryDto } from './dto/comment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Comments')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'comments', version: '1' })
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  @RequirePermissions('comments:read')
  @ApiOperation({ summary: 'List comments across the org for moderation, optionally filtered by status' })
  list(@Query() query: CommentQueryDto, @CurrentUser() user: any) {
    return this.commentsService.listForModeration(user.organizationId, query);
  }

  @Patch(':id')
  @RequirePermissions('comments:moderate')
  @ApiOperation({ summary: 'Approve, reject, or mark a comment as spam' })
  moderate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerateCommentDto,
    @CurrentUser() user: any,
  ) {
    return this.commentsService.moderate(id, dto.status, user.organizationId);
  }

  @Delete(':id')
  @RequirePermissions('comments:moderate')
  @ApiOperation({ summary: 'Delete a comment' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.commentsService.remove(id, user.organizationId);
  }
}
