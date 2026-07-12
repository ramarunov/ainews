import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';
import axios from 'axios';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWebhookDto, organizationId: string) {
    const secret = randomBytes(32).toString('hex');
    const secretHash = createHash('sha256').update(secret).digest('hex');

    const webhook = await this.prisma.webhook.create({
      data: {
        organizationId,
        name: dto.name,
        url: dto.url,
        events: dto.events,
        secretHash,
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

    await Promise.all(webhooks.map((webhook) => this.deliver(webhook.id, webhook.url, event, payload)));
  }

  @OnEvent('article.published')
  async handleArticlePublished(payload: any) {
    await this.dispatch(payload.organizationId, 'article.published', payload);
  }

  private async deliver(webhookId: string, url: string, event: string, payload: object) {
    const startedAt = Date.now();

    try {
      const response = await axios.post(url, payload, {
        timeout: 5000,
        headers: { 'X-Webhook-Event': event },
      });

      const duration = Date.now() - startedAt;

      await this.prisma.webhookDelivery.create({
        data: {
          webhookId,
          event,
          payload: payload as Prisma.InputJsonValue,
          statusCode: response.status,
          response: JSON.stringify(response.data ?? '').slice(0, 2000),
          duration,
          success: true,
        },
      });

      await this.prisma.webhook.update({
        where: { id: webhookId },
        data: { lastTriggeredAt: new Date() },
      });
    } catch (error: any) {
      const duration = Date.now() - startedAt;

      await this.prisma.webhookDelivery.create({
        data: {
          webhookId,
          event,
          payload: payload as Prisma.InputJsonValue,
          statusCode: error?.response?.status,
          response: JSON.stringify(error?.response?.data ?? error?.message ?? 'Unknown error').slice(0, 2000),
          duration,
          success: false,
        },
      });

      await this.prisma.webhook.update({
        where: { id: webhookId },
        data: { failureCount: { increment: 1 }, lastTriggeredAt: new Date() },
      });

      this.logger.warn(`Webhook delivery failed for ${webhookId}: ${error?.message}`);
    }
  }
}
