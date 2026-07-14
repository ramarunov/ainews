import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Thin wrapper over nodemailer/SMTP (PRD §7 "Email (SMTP/SendGrid)", P0).
 * Points at Mailhog in local dev (SMTP_HOST=localhost, port 1025 — see
 * docker-compose.yml) and any real SMTP provider (SendGrid, SES, etc.) in
 * production via the same env vars. No provider-specific SDK: SendGrid,
 * Postmark, SES, and friends all speak SMTP, so nodemailer covers "SendGrid"
 * without a dedicated dependency.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.transporter = createTransport({
      host: config.get<string>('SMTP_HOST', 'localhost'),
      // dotenv/ConfigService values are always strings — `get<boolean>()`
      // does not coerce them, so a naive `secure: config.get<boolean>(...)`
      // treats the literal string "false" as truthy and makes nodemailer
      // attempt a TLS handshake against Mailhog's plaintext port (breaks
      // with a "wrong version number" TLS error). Same reasoning already
      // applied to S3_SERVER_SIDE_ENCRYPTION in storage.service.ts.
      port: Number(config.get<string>('SMTP_PORT', '1025')),
      secure: config.get<string>('SMTP_SECURE', 'false') === 'true',
      auth: config.get<string>('SMTP_USER')
        ? {
            user: config.get<string>('SMTP_USER'),
            pass: config.get<string>('SMTP_PASSWORD'),
          }
        : undefined,
    });

    const fromName = config.get<string>('EMAIL_FROM_NAME', 'AI News CMS');
    const fromAddress = config.get<string>('EMAIL_FROM', 'noreply@ainews.local');
    this.from = `"${fromName}" <${fromAddress}>`;
  }

  // Rethrows on failure rather than swallowing it here — callers that must
  // never fail the surrounding request (e.g. password reset, which always
  // returns a generic response regardless of whether the email exists)
  // call this fire-and-forget with their own `.catch()`, same convention
  // as SearchService.logSearch(); callers that need to know delivery
  // actually succeeded can await it directly.
  async send(options: SendEmailOptions): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}: ${options.subject}`, error);
      throw error;
    }
  }
}
