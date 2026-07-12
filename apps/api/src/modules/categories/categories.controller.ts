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

import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto, CategoryQueryDto } from './dto/category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Categories')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'categories', version: '1' })
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @RequirePermissions('categories:write')
  @ApiOperation({ summary: 'Create a new category' })
  @ApiResponse({ status: 201, description: 'Category created' })
  create(@Body() dto: CreateCategoryDto, @CurrentUser() user: any) {
    return this.categoriesService.create(dto, user.organizationId);
  }

  @Get()
  @RequirePermissions('categories:read')
  @ApiOperation({ summary: 'List categories (nested tree by default, or flat with ?flat=true)' })
  findAll(@Query() query: CategoryQueryDto, @CurrentUser() user: any) {
    return this.categoriesService.findAll(query, user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('categories:read')
  @ApiOperation({ summary: 'Get category by ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.categoriesService.findOne(id, user.organizationId);
  }

  @Get('slug/:slug')
  @RequirePermissions('categories:read')
  @ApiOperation({ summary: 'Get category by slug' })
  findBySlug(@Param('slug') slug: string, @CurrentUser() user: any) {
    return this.categoriesService.findBySlug(slug, user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('categories:write')
  @ApiOperation({ summary: 'Update category' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: any,
  ) {
    return this.categoriesService.update(id, dto, user.organizationId);
  }

  @Delete(':id')
  @RequirePermissions('categories:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete category' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.categoriesService.remove(id, user.organizationId);
  }
}
