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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';

import { TagsService } from './tags.service';
import { CreateTagDto, UpdateTagDto, TagQueryDto } from './dto/tag.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Tags')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'tags', version: '1' })
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @RequirePermissions('tags:write')
  @ApiOperation({ summary: 'Create a new tag' })
  @ApiResponse({ status: 201, description: 'Tag created' })
  create(@Body() dto: CreateTagDto, @CurrentUser() user: any) {
    return this.tagsService.create(dto, user.organizationId);
  }

  @Get()
  @RequirePermissions('tags:read')
  @ApiOperation({ summary: 'List tags with search and pagination' })
  findAll(@Query() query: TagQueryDto, @CurrentUser() user: any) {
    return this.tagsService.findAll(query, user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('tags:read')
  @ApiOperation({ summary: 'Get tag by ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.tagsService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('tags:write')
  @ApiOperation({ summary: 'Update tag' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTagDto,
    @CurrentUser() user: any,
  ) {
    return this.tagsService.update(id, dto, user.organizationId);
  }

  @Delete(':id')
  @RequirePermissions('tags:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete tag' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.tagsService.remove(id, user.organizationId);
  }
}
