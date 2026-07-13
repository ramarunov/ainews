import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { SentryExceptionFilter } from './sentry-exception.filter';

jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));

describe('SentryExceptionFilter', () => {
  let filter: SentryExceptionFilter;
  let res: { status: jest.Mock; json: jest.Mock };
  let host: ArgumentsHost;

  beforeEach(() => {
    jest.clearAllMocks();
    filter = new SentryExceptionFilter();
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    host = {
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => ({ method: 'GET', url: '/api/v1/articles/missing' }),
      }),
    } as unknown as ArgumentsHost;
  });

  it('reproduces the exact response shape NestJS\'s default filter would send for a 404', () => {
    filter.catch(new NotFoundException('Article not found'), host);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Article not found' }),
    );
  });

  it('does not report an ordinary 4xx to Sentry — expected application flow, not a bug', () => {
    filter.catch(new BadRequestException('Invalid input'), host);

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('reports a 5xx HttpException to Sentry', () => {
    const { InternalServerErrorException } = jest.requireActual('@nestjs/common');
    filter.catch(new InternalServerErrorException('DB down'), host);

    expect(Sentry.captureException).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('reports and correctly shapes a response for a raw, unhandled Error (not an HttpException)', () => {
    filter.catch(new Error('unexpected crash'), host);

    expect(Sentry.captureException).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    });
  });
});
