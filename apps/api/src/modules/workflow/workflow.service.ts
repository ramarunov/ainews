import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import slugify from 'slugify';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
  CreateStageDto,
  CreateCommentDto,
} from './dto/workflow.dto';

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Workflows ─────────────────────────────────────────────────────────────

  async createWorkflow(dto: CreateWorkflowDto, organizationId: string) {
    const workflow = await this.prisma.workflow.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description,
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
      },
    });

    this.eventEmitter.emit('workflow.created', {
      workflowId: workflow.id,
      organizationId,
    });

    return workflow;
  }

  async findAllWorkflows(organizationId: string) {
    return this.prisma.workflow.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneWorkflow(id: string, organizationId: string, includeStages = true) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id, organizationId },
      include: includeStages
        ? { stages: { orderBy: { sortOrder: 'asc' } } }
        : undefined,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    return workflow;
  }

  async updateWorkflow(id: string, dto: UpdateWorkflowDto, organizationId: string) {
    await this.findOneWorkflow(id, organizationId, false);

    return this.prisma.workflow.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  // ─── Stages ────────────────────────────────────────────────────────────────

  async addStage(workflowId: string, dto: CreateStageDto, organizationId: string) {
    await this.findOneWorkflow(workflowId, organizationId, false);

    const sortOrder =
      dto.sortOrder ?? (await this.prisma.workflowStage.count({ where: { workflowId } }));

    return this.prisma.workflowStage.create({
      data: {
        workflowId,
        name: dto.name,
        slug: dto.slug ?? slugify(dto.name, { lower: true, strict: true, trim: true }),
        description: dto.description,
        color: dto.color,
        sortOrder,
        requiresRole: dto.requiresRole,
        isTerminal: dto.isTerminal ?? false,
      },
    });
  }

  async reorderStages(workflowId: string, stageIds: string[], organizationId: string) {
    await this.findOneWorkflow(workflowId, organizationId, false);

    await this.prisma.$transaction(
      stageIds.map((id, index) =>
        this.prisma.workflowStage.update({
          where: { id, workflowId },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.findOneWorkflow(workflowId, organizationId, true);
  }

  // ─── Assignments ───────────────────────────────────────────────────────────

  async assignArticle(
    articleId: string,
    stageId: string,
    assigneeId: string,
    assignerId: string,
    organizationId: string,
    dto: { dueDate?: string; note?: string },
  ) {
    const article = await this.prisma.article.findFirst({
      where: { id: articleId, organizationId, deletedAt: null },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const stage = await this.prisma.workflowStage.findFirst({
      where: { id: stageId, workflow: { organizationId } },
    });

    if (!stage) {
      throw new NotFoundException('Workflow stage not found');
    }

    const [assignment] = await this.prisma.$transaction([
      this.prisma.articleAssignment.create({
        data: {
          articleId,
          stageId,
          assignedTo: assigneeId,
          assignedBy: assignerId,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          note: dto.note,
        },
      }),
      this.prisma.article.update({
        where: { id: articleId },
        data: { assignedTo: assigneeId, workflowStageId: stageId },
      }),
    ]);

    this.eventEmitter.emit('workflow.assigned', {
      articleId,
      stageId,
      assigneeId,
      assignerId,
      organizationId,
    });

    return assignment;
  }

  async completeAssignment(assignmentId: string, organizationId: string) {
    const assignment = await this.prisma.articleAssignment.findFirst({
      where: { id: assignmentId, article: { organizationId } },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    const completed = await this.prisma.articleAssignment.update({
      where: { id: assignmentId },
      data: { completedAt: new Date() },
    });

    this.eventEmitter.emit('workflow.assignment.completed', {
      assignmentId,
      organizationId,
    });

    return completed;
  }

  async listAssignmentsForUser(userId: string, organizationId: string) {
    return this.prisma.articleAssignment.findMany({
      where: {
        assignedTo: userId,
        completedAt: null,
        article: { organizationId },
      },
      include: {
        article: { select: { id: true, title: true, slug: true, status: true } },
        stage: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Comments ──────────────────────────────────────────────────────────────

  async addComment(
    articleId: string,
    authorId: string,
    dto: CreateCommentDto,
    organizationId: string,
  ) {
    const article = await this.prisma.article.findFirst({
      where: { id: articleId, organizationId, deletedAt: null },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const comment = await this.prisma.editorialComment.create({
      data: {
        articleId,
        authorId,
        parentId: dto.parentId,
        content: dto.content,
        selection: dto.selection as Prisma.InputJsonValue,
      },
    });

    this.eventEmitter.emit('workflow.comment.created', {
      commentId: comment.id,
      articleId,
      organizationId,
    });

    return comment;
  }

  async listComments(articleId: string, organizationId: string) {
    const article = await this.prisma.article.findFirst({
      where: { id: articleId, organizationId, deletedAt: null },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const comments = await this.prisma.editorialComment.findMany({
      where: { articleId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    return this.buildCommentTree(comments);
  }

  async resolveComment(commentId: string, resolvedBy: string, organizationId: string) {
    const comment = await this.prisma.editorialComment.findFirst({
      where: { id: commentId, deletedAt: null, article: { organizationId } },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    return this.prisma.editorialComment.update({
      where: { id: commentId },
      data: { resolvedAt: new Date(), resolvedBy },
    });
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private buildCommentTree(comments: Array<Record<string, any>>) {
    const nodes = new Map<string, any>();
    const roots: any[] = [];

    comments.forEach((comment) => nodes.set(comment.id, { ...comment, replies: [] }));

    comments.forEach((comment) => {
      const node = nodes.get(comment.id);
      if (comment.parentId && nodes.has(comment.parentId)) {
        nodes.get(comment.parentId).replies.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }
}
