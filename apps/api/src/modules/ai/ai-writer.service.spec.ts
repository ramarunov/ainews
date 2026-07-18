import { AIWriterService } from './ai-writer.service';

describe('AIWriterService', () => {
  describe('generateDraft', () => {
    it('strips a heading the model opened the article with, keeping the rest intact', async () => {
      const gateway = {
        prompt: jest.fn().mockResolvedValue(
          '<h2>Big Story Breaks</h2><p>The lead paragraph goes here.</p><h2>Background</h2><p>More context.</p>',
        ),
      };
      const service = new AIWriterService(gateway as any);

      const result = await service.generateDraft({ title: 'Big Story Breaks' });

      expect(result).toBe(
        '<p>The lead paragraph goes here.</p><h2>Background</h2><p>More context.</p>',
      );
    });

    it('leaves content starting with a paragraph untouched', async () => {
      const gateway = {
        prompt: jest.fn().mockResolvedValue('<p>The lead paragraph goes here.</p><h2>Background</h2>'),
      };
      const service = new AIWriterService(gateway as any);

      const result = await service.generateDraft({ title: 'Big Story Breaks' });

      expect(result).toBe('<p>The lead paragraph goes here.</p><h2>Background</h2>');
    });

    it('strips a leading heading even when the model also wrapped the output in a markdown code fence', async () => {
      const gateway = {
        prompt: jest.fn().mockResolvedValue(
          '```html\n<h3>Big Story Breaks</h3><p>The lead paragraph.</p>\n```',
        ),
      };
      const service = new AIWriterService(gateway as any);

      const result = await service.generateDraft({ title: 'Big Story Breaks' });

      expect(result).toBe('<p>The lead paragraph.</p>');
    });
  });
});
