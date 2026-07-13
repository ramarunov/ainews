import { NotFoundException } from '@nestjs/common';
import { WorkflowService } from './workflow.service';

describe('WorkflowService', () => {
  let service: WorkflowService;
  let prisma: any;
  let eventEmitter: any;

  beforeEach(() => {
    prisma = {
      workflow: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      workflowStage: {
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      article: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      articleAssignment: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      editorialComment: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    // withOrgTransaction(this.prisma, cb) calls prisma.$transaction(cb) when
    // there's no active RLS org context (as in every unit test here, which
    // runs outside the request-scoped interceptor) — invoke the callback
    // with the same mock as `tx` so its own calls are observable below.
    prisma.$transaction.mockImplementation((cb: any) => cb(prisma));
    eventEmitter = { emit: jest.fn() };
    service = new WorkflowService(prisma, eventEmitter);
  });

  describe('createWorkflow', () => {
    it('creates a workflow and emits workflow.created', async () => {
      prisma.workflow.create.mockResolvedValue({ id: 'wf-1' });

      await service.createWorkflow({ name: 'Editorial' } as any, 'org-1');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'workflow.created',
        expect.objectContaining({ workflowId: 'wf-1', organizationId: 'org-1' }),
      );
    });
  });

  describe('findOneWorkflow', () => {
    it('throws NotFoundException when the workflow does not belong to this org', async () => {
      prisma.workflow.findFirst.mockResolvedValue(null);

      await expect(service.findOneWorkflow('wf-1', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getBoard', () => {
    it('groups staged articles under their own stage and includes an unassigned bucket', async () => {
      prisma.workflow.findFirst.mockResolvedValue({
        id: 'wf-1',
        stages: [
          { id: 'stage-draft', name: 'Draft', sortOrder: 0 },
          { id: 'stage-review', name: 'Review', sortOrder: 1 },
        ],
      });
      prisma.article.findMany
        .mockResolvedValueOnce([
          { id: 'a1', workflowStageId: 'stage-draft', title: 'A1' },
          { id: 'a2', workflowStageId: 'stage-review', title: 'A2' },
          { id: 'a3', workflowStageId: 'stage-draft', title: 'A3' },
        ])
        .mockResolvedValueOnce([{ id: 'a4', workflowStageId: null, title: 'A4 unassigned' }]);

      const board = await service.getBoard('wf-1', 'org-1');

      expect(board.stages[0].articles.map((a: any) => a.id)).toEqual(['a1', 'a3']);
      expect(board.stages[1].articles.map((a: any) => a.id)).toEqual(['a2']);
      expect(board.unassigned).toHaveLength(1);
      expect(board.unassigned[0].id).toBe('a4');
    });

    it('gives every stage an empty array, not undefined, when it has no articles', async () => {
      prisma.workflow.findFirst.mockResolvedValue({
        id: 'wf-1',
        stages: [{ id: 'stage-draft', name: 'Draft', sortOrder: 0 }],
      });
      prisma.article.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const board = await service.getBoard('wf-1', 'org-1');

      expect(board.stages[0].articles).toEqual([]);
    });

    it('throws NotFoundException when the workflow does not belong to this org', async () => {
      prisma.workflow.findFirst.mockResolvedValue(null);

      await expect(service.getBoard('wf-1', 'org-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addStage', () => {
    it('defaults sortOrder to the current stage count when not provided', async () => {
      jest.spyOn(service, 'findOneWorkflow').mockResolvedValue({ id: 'wf-1' } as any);
      prisma.workflowStage.count.mockResolvedValue(3);
      prisma.workflowStage.create.mockResolvedValue({});

      await service.addStage('wf-1', { name: 'In Review' } as any, 'org-1');

      expect(prisma.workflowStage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sortOrder: 3 }) }),
      );
    });

    it('slugifies the stage name when no slug is provided', async () => {
      jest.spyOn(service, 'findOneWorkflow').mockResolvedValue({ id: 'wf-1' } as any);
      prisma.workflowStage.count.mockResolvedValue(0);
      prisma.workflowStage.create.mockResolvedValue({});

      await service.addStage('wf-1', { name: 'In Review' } as any, 'org-1');

      expect(prisma.workflowStage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: 'in-review' }) }),
      );
    });
  });

  describe('reorderStages', () => {
    it('updates every stage sortOrder inside one transaction, in the given order', async () => {
      jest.spyOn(service, 'findOneWorkflow').mockResolvedValue({ id: 'wf-1' } as any);
      prisma.workflowStage.update.mockResolvedValue({});

      await service.reorderStages('wf-1', ['stage-b', 'stage-a'], 'org-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.workflowStage.update).toHaveBeenCalledTimes(2);
      expect(prisma.workflowStage.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'stage-b', workflowId: 'wf-1' },
        data: { sortOrder: 0 },
      });
      expect(prisma.workflowStage.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'stage-a', workflowId: 'wf-1' },
        data: { sortOrder: 1 },
      });
    });
  });

  describe('assignArticle', () => {
    it('throws NotFoundException when the article does not belong to this org', async () => {
      prisma.article.findFirst.mockResolvedValue(null);

      await expect(
        service.assignArticle('article-1', 'stage-1', 'user-1', 'assigner-1', 'org-1', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the stage does not belong to this org', async () => {
      prisma.article.findFirst.mockResolvedValue({ id: 'article-1' });
      prisma.workflowStage.count.mockResolvedValue(0); // unused here but keeps mock consistent
      prisma.article.findFirst.mockResolvedValue({ id: 'article-1' });
      (prisma as any).workflowStage.findFirst = jest.fn().mockResolvedValue(null);

      await expect(
        service.assignArticle('article-1', 'stage-1', 'user-1', 'assigner-1', 'org-1', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates the assignment and updates the article in one transaction, then emits workflow.assigned', async () => {
      prisma.article.findFirst.mockResolvedValue({ id: 'article-1' });
      prisma.workflowStage.findFirst = jest.fn().mockResolvedValue({ id: 'stage-1' });
      prisma.articleAssignment.create.mockResolvedValue({ id: 'assignment-1' });
      prisma.article.update.mockResolvedValue({});

      const result = await service.assignArticle(
        'article-1',
        'stage-1',
        'user-1',
        'assigner-1',
        'org-1',
        { note: 'please review' },
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'workflow.assigned',
        expect.objectContaining({ articleId: 'article-1', stageId: 'stage-1' }),
      );
      expect(result).toEqual({ id: 'assignment-1' });
    });
  });

  describe('completeAssignment', () => {
    it('throws NotFoundException for an assignment outside this org', async () => {
      prisma.articleAssignment.findFirst.mockResolvedValue(null);

      await expect(service.completeAssignment('a1', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('sets completedAt and emits workflow.assignment.completed', async () => {
      prisma.articleAssignment.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.articleAssignment.update.mockResolvedValue({ id: 'a1', completedAt: new Date() });

      await service.completeAssignment('a1', 'org-1');

      expect(prisma.articleAssignment.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { completedAt: expect.any(Date) },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'workflow.assignment.completed',
        expect.objectContaining({ assignmentId: 'a1' }),
      );
    });
  });

  describe('listComments (comment tree building)', () => {
    it('throws NotFoundException when the article does not belong to this org', async () => {
      prisma.article.findFirst.mockResolvedValue(null);

      await expect(service.listComments('article-1', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('nests replies under their parent comment and keeps top-level comments as roots', async () => {
      prisma.article.findFirst.mockResolvedValue({ id: 'article-1' });
      prisma.editorialComment.findMany.mockResolvedValue([
        { id: 'c1', parentId: null, content: 'root comment' },
        { id: 'c2', parentId: 'c1', content: 'a reply' },
        { id: 'c3', parentId: null, content: 'another root' },
      ]);

      const tree = await service.listComments('article-1', 'org-1');

      expect(tree).toHaveLength(2);
      const root1 = tree.find((c: any) => c.id === 'c1');
      expect(root1.replies).toHaveLength(1);
      expect(root1.replies[0].id).toBe('c2');
      const root2 = tree.find((c: any) => c.id === 'c3');
      expect(root2.replies).toHaveLength(0);
    });
  });

  describe('resolveComment', () => {
    it('throws NotFoundException for a comment outside this org', async () => {
      prisma.editorialComment.findFirst.mockResolvedValue(null);

      await expect(service.resolveComment('c1', 'resolver-1', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('sets resolvedAt and resolvedBy', async () => {
      prisma.editorialComment.findFirst.mockResolvedValue({ id: 'c1' });
      prisma.editorialComment.update.mockResolvedValue({});

      await service.resolveComment('c1', 'resolver-1', 'org-1');

      expect(prisma.editorialComment.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { resolvedAt: expect.any(Date), resolvedBy: 'resolver-1' },
      });
    });
  });
});
