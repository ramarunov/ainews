/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions": ["node", "node-addons"]}
 *
 * Transitively imports NewsIntelligenceService -> common/sanitize-html ->
 * isomorphic-dompurify, which needs a real `window` (via jsdom) even when
 * unused by the code path under test here. See articles.service.spec.ts
 * for the same requirement and its own note. The customExportConditions
 * override keeps package "exports" resolution on the node path — jsdom's
 * default ("browser") makes @nestjs/bull's chain (bull -> ioredis ->
 * msgpackr) resolve to an ESM build ts-jest can't parse.
 */
import { TextEncoder, TextDecoder } from 'node:util';

// jsdom's test environment doesn't provide TextEncoder/TextDecoder, which
// the jsdom *package* (pulled in transitively via ArticleExtractionService)
// needs at import time via whatwg-url. Must run before that import.
(global as any).TextEncoder = (global as any).TextEncoder || TextEncoder;
(global as any).TextDecoder = (global as any).TextDecoder || TextDecoder;

import { NewsIngestionProcessor } from './news-ingestion.processor';
import { orgContextStorage } from '../../infrastructure/prisma/org-context';

describe('NewsIngestionProcessor', () => {
  let processor: NewsIngestionProcessor;
  let newsIntelligenceService: any;

  beforeEach(() => {
    newsIntelligenceService = {
      ingestSource: jest.fn(),
    };
    processor = new NewsIngestionProcessor(newsIntelligenceService);
  });

  it('establishes the org context before calling ingestSource, so RLS-protected writes succeed', async () => {
    let contextDuringCall: unknown;
    newsIntelligenceService.ingestSource.mockImplementation(async () => {
      contextDuringCall = orgContextStorage.getStore();
      return { itemsFound: 2, itemsCreated: 1, itemsSkipped: 1 };
    });

    const job = { data: { sourceId: 'src-1', organizationId: 'org-1' } } as any;
    const result = await processor.handleIngestSource(job);

    expect(contextDuringCall).toEqual({ organizationId: 'org-1' });
    expect(newsIntelligenceService.ingestSource).toHaveBeenCalledWith('src-1', 'org-1');
    expect(result).toEqual({ itemsFound: 2, itemsCreated: 1, itemsSkipped: 1 });
  });

  it('propagates a failure from ingestSource without swallowing it', async () => {
    newsIntelligenceService.ingestSource.mockRejectedValue(new Error('feed unreachable'));

    const job = { data: { sourceId: 'src-1', organizationId: 'org-1' } } as any;

    await expect(processor.handleIngestSource(job)).rejects.toThrow('feed unreachable');
  });
});
