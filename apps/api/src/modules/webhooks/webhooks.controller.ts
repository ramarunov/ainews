import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Webhooks')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'webhooks', version: '1' })
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  @RequirePermissions('webhooks:write')
  @ApiOperation({ summary: 'Register a new webhook (returns the secret once)' })
  create(@Body() dto: CreateWebhookDto, @CurrentUser() user: any) {
    return this.webhooksService.create(dto, user.organizationId);
  }

  @Get()
  @RequirePermissions('webhooks:read')
  @ApiOperation({ summary: 'List webhooks' })
  findAll(@CurrentUser() user: any) {
    return this.webhooksService.findAll(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('webhooks:read')
  @ApiOperation({ summary: 'Get a webhook by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.webhooksService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('webhooks:write')
  @ApiOperation({ summary: 'Update a webhook' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebhookDto,
    @CurrentUser() user: any,
  ) {
    return this.webhooksService.update(id, dto, user.organizationId);
  }

  @Delete(':id')
  @RequirePermissions('webhooks:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a webhook' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.webhooksService.remove(id, user.organizationId);
  }

  @Get(':id/deliveries')
  @RequirePermissions('webhooks:read')
  @ApiOperation({ summary: 'List delivery attempts for a webhook' })
  listDeliveries(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @CurrentUser() user: any,
  ) {
    return this.webhooksService.listDeliveries(id, user.organizationId, page, limit);
  }
}
