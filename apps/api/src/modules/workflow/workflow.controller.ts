import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';

import { WorkflowService } from './workflow.service';
import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
  CreateStageDto,
  ReorderStagesDto,
  AssignArticleDto,
  CreateCommentDto,
} from './dto/workflow.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Workflow')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'workflow', version: '1' })
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  // ─── Workflows ─────────────────────────────────────────────────────────────

  @Post('workflows')
  @RequirePermissions('workflow:write')
  @ApiOperation({ summary: 'Create a new editorial workflow' })
  createWorkflow(@Body() dto: CreateWorkflowDto, @CurrentUser() user: any) {
    return this.workflowService.createWorkflow(dto, user.organizationId);
  }

  @Get('workflows')
  @RequirePermissions('workflow:read')
  @ApiOperation({ summary: 'List workflows' })
  findAllWorkflows(@CurrentUser() user: any) {
    return this.workflowService.findAllWorkflows(user.organizationId);
  }

  @Get('workflows/:id')
  @RequirePermissions('workflow:read')
  @ApiOperation({ summary: 'Get a workflow by ID, including stages' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  findOneWorkflow(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.workflowService.findOneWorkflow(id, user.organizationId);
  }

  @Patch('workflows/:id')
  @RequirePermissions('workflow:write')
  @ApiOperation({ summary: 'Update a workflow' })
  updateWorkflow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkflowDto,
    @CurrentUser() user: any,
  ) {
    return this.workflowService.updateWorkflow(id, dto, user.organizationId);
  }

  // ─── Stages ────────────────────────────────────────────────────────────────

  @Post('workflows/:id/stages')
  @RequirePermissions('workflow:write')
  @ApiOperation({ summary: 'Add a stage to a workflow' })
  addStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateStageDto,
    @CurrentUser() user: any,
  ) {
    return this.workflowService.addStage(id, dto, user.organizationId);
  }

  @Patch('workflows/:id/stages/reorder')
  @RequirePermissions('workflow:write')
  @ApiOperation({ summary: 'Reorder a workflow\'s stages' })
  reorderStages(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderStagesDto,
    @CurrentUser() user: any,
  ) {
    return this.workflowService.reorderStages(id, dto.stageIds, user.organizationId);
  }

  // ─── Assignments ───────────────────────────────────────────────────────────

  @Post('articles/:articleId/assign')
  @RequirePermissions('workflow:write')
  @ApiOperation({ summary: 'Assign an article to a workflow stage and user' })
  assignArticle(
    @Param('articleId', ParseUUIDPipe) articleId: string,
    @Body() dto: AssignArticleDto,
    @CurrentUser() user: any,
  ) {
    return this.workflowService.assignArticle(
      articleId,
      dto.stageId,
      dto.assigneeId,
      user.id,
      user.organizationId,
      { dueDate: dto.dueDate, note: dto.note },
    );
  }

  @Patch('assignments/:id/complete')
  @RequirePermissions('workflow:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark an assignment as complete' })
  completeAssignment(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.workflowService.completeAssignment(id, user.organizationId);
  }

  @Get('assignments/mine')
  @ApiOperation({ summary: 'List my open assignments' })
  listMyAssignments(@CurrentUser() user: any) {
    return this.workflowService.listAssignmentsForUser(user.id, user.organizationId);
  }

  // ─── Comments ──────────────────────────────────────────────────────────────

  @Post('articles/:articleId/comments')
  @RequirePermissions('workflow:write')
  @ApiOperation({ summary: 'Add an editorial comment to an article' })
  addComment(
    @Param('articleId', ParseUUIDPipe) articleId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: any,
  ) {
    return this.workflowService.addComment(articleId, user.id, dto, user.organizationId);
  }

  @Get('articles/:articleId/comments')
  @RequirePermissions('workflow:read')
  @ApiOperation({ summary: 'List editorial comments for an article' })
  listComments(@Param('articleId', ParseUUIDPipe) articleId: string, @CurrentUser() user: any) {
    return this.workflowService.listComments(articleId, user.organizationId);
  }

  @Patch('comments/:id/resolve')
  @RequirePermissions('workflow:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve an editorial comment' })
  resolveComment(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.workflowService.resolveComment(id, user.id, user.organizationId);
  }
}
