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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';

import { PagesService } from './pages.service';
import { CreatePageDto, UpdatePageDto, PageQueryDto } from './dto/page.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Pages')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'pages', version: '1' })
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  @Post()
  @RequirePermissions('pages:write')
  @ApiOperation({ summary: 'Create a new static page' })
  @ApiResponse({ status: 201, description: 'Page created' })
  create(@Body() dto: CreatePageDto, @CurrentUser() user: any) {
    return this.pagesService.create(dto, user.organizationId);
  }

  @Get()
  @RequirePermissions('pages:read')
  @ApiOperation({ summary: 'List pages' })
  findAll(@Query() query: PageQueryDto, @CurrentUser() user: any) {
    return this.pagesService.findAll(query, user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('pages:read')
  @ApiOperation({ summary: 'Get page by ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.pagesService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('pages:write')
  @ApiOperation({ summary: 'Update page' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePageDto,
    @CurrentUser() user: any,
  ) {
    return this.pagesService.update(id, dto, user.organizationId);
  }

  @Delete(':id')
  @RequirePermissions('pages:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete page' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.pagesService.remove(id, user.organizationId);
  }
}
