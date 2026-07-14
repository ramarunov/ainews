import { createTransport } from 'nodemailer';
import { EmailService } from './email.service';

jest.mock('nodemailer');

const mockedCreateTransport = createTransport as jest.MockedFunction<typeof createTransport>;

describe('EmailService', () => {
  let config: any;
  let sendMail: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail = jest.fn().mockResolvedValue({});
    mockedCreateTransport.mockReturnValue({ sendMail } as any);
    config = {
      get: jest.fn((_key: string, fallback?: any) => fallback),
    };
  });

  it('builds the SMTP transport from config with sensible defaults', () => {
    new EmailService(config);

    expect(mockedCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'localhost', port: 1025, secure: false }),
    );
  });

  it('sends mail with the configured from-name/address', async () => {
    config.get = jest.fn((key: string, fallback?: any) => {
      if (key === 'EMAIL_FROM_NAME') return 'AI News CMS';
      if (key === 'EMAIL_FROM') return 'noreply@ainews.local';
      return fallback;
    });
    const service = new EmailService(config);

    await service.send({ to: 'jane@example.com', subject: 'Hi', html: '<p>hi</p>' });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"AI News CMS" <noreply@ainews.local>',
        to: 'jane@example.com',
        subject: 'Hi',
        html: '<p>hi</p>',
      }),
    );
  });

  it('rethrows when the transport fails to send', async () => {
    sendMail.mockRejectedValue(new Error('connection refused'));
    const service = new EmailService(config);

    await expect(
      service.send({ to: 'jane@example.com', subject: 'Hi', html: '<p>hi</p>' }),
    ).rejects.toThrow('connection refused');
  });
});
