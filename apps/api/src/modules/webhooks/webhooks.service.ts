import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma, Webhook } from '@prisma/client';
import { randomBytes, createHmac } from 'crypto';
import axios from 'axios';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async create(dto: CreateWebhookDto, organizationId: string) {
    const secret = randomBytes(32).toString('hex');
    // Stored encrypted (reversible), not hashed — deliver() needs the raw
    // secret back to sign each outbound payload with HMAC-SHA256 so
    // receivers can verify a delivery actually came from this system.
    const secretEncrypted = this.encryption.encrypt(secret);

    const webhook = await this.prisma.webhook.create({
      data: {
        organizationId,
        name: dto.name,
        url: dto.url,
        events: dto.events,
        secretEncrypted,
      },
    });

    return { ...webhook, secret };
  }

  async findAll(organizationId: string) {
    return this.prisma.webhook.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, organizationId: string) {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id, organizationId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    return webhook;
  }

  async update(id: string, dto: UpdateWebhookDto, organizationId: string) {
    await this.findOne(id, organizationId);

    return this.prisma.webhook.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.events !== undefined && { events: dto.events }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    await this.prisma.webhook.delete({ where: { id } });

    return { success: true, message: 'Webhook deleted' };
  }

  async listDeliveries(webhookId: string, organizationId: string, page = 1, limit = 20) {
    await this.findOne(webhookId, organizationId);

    const skip = (Math.max(1, page) - 1) * Math.min(100, limit);
    const take = Math.min(100, limit);

    const [deliveries, total] = await Promise.all([
      this.prisma.webhookDelivery.findMany({
        where: { webhookId },
        skip,
        take,
        orderBy: { attemptedAt: 'desc' },
      }),
      this.prisma.webhookDelivery.count({ where: { webhookId } }),
    ]);

    return {
      data: deliveries,
      meta: {
        total,
        page: Math.max(1, page),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async dispatch(organizationId: string, event: string, payload: object) {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        organizationId,
        isActive: true,
        events: { has: event },
      },
    });

    await Promise.all(webhooks.map((webhook) => this.deliver(webhook, event, payload)));
  }

  @OnEvent('article.published')
  async handleArticlePublished(payload: any) {
    await this.dispatch(payload.organizationId, 'article.published', payload);
  }

  private async deliver(webhook: Webhook, event: string, payload: object) {
    const startedAt = Date.now();
    const body = JSON.stringify(payload);
    const secret = this.encryption.decrypt(webhook.secretEncrypted);
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    try {
      const response = await axios.post(webhook.url, body, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event,
          'X-Webhook-Signature': `sha256=${signature}`,
        },
      });

      const duration = Date.now() - startedAt;

      await this.prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event,
          payload: payload as Prisma.InputJsonValue,
          statusCode: response.status,
          response: JSON.stringify(response.data ?? '').slice(0, 2000),
          duration,
          success: true,
        },
      });

      await this.prisma.webhook.update({
        where: { id: webhook.id },
        data: { lastTriggeredAt: new Date() },
      });
    } catch (error: any) {
      const duration = Date.now() - startedAt;

      await this.prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event,
          payload: payload as Prisma.InputJsonValue,
          statusCode: error?.response?.status,
          response: JSON.stringify(error?.response?.data ?? error?.message ?? 'Unknown error').slice(0, 2000),
          duration,
          success: false,
        },
      });

      await this.prisma.webhook.update({
        where: { id: webhook.id },
        data: { failureCount: { increment: 1 }, lastTriggeredAt: new Date() },
      });

      this.logger.warn(`Webhook delivery failed for ${webhook.id}: ${error?.message}`);
    }
  }
}
