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

import { UsersService } from './users.service';
import {
  UpdateUserDto,
  UpdateOwnProfileDto,
  UserQueryDto,
  AssignRoleDto,
  EraseAccountDto,
} from './dto/user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'List users with filtering and pagination' })
  findAll(@Query() query: UserQueryDto, @CurrentUser() user: any) {
    return this.usersService.findAll(query, user.organizationId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@CurrentUser() user: any) {
    return this.usersService.findOne(user.id, user.organizationId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(@Body() dto: UpdateOwnProfileDto, @CurrentUser() user: any) {
    return this.usersService.updateOwnProfile(user.id, dto);
  }

  @Get('me/export')
  @ApiOperation({ summary: 'Export all personal data for the current user (GDPR right to access/portability)' })
  exportMe(@CurrentUser() user: any) {
    return this.usersService.exportOwnData(user.id);
  }

  @Post('me/erase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Erase/anonymize the current user's personal data (GDPR right to erasure)" })
  eraseMe(@Body() dto: EraseAccountDto, @CurrentUser() user: any) {
    return this.usersService.eraseOwnAccount(user.id, dto.password);
  }

  @Get(':id')
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.usersService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('users:write')
  @ApiOperation({ summary: 'Update user profile' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: any,
  ) {
    return this.usersService.update(id, dto, user.organizationId);
  }

  @Patch(':id/deactivate')
  @RequirePermissions('users:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate user' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.usersService.deactivate(id, user.organizationId);
  }

  @Patch(':id/reactivate')
  @RequirePermissions('users:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate user' })
  reactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.usersService.reactivate(id, user.organizationId);
  }

  @Delete(':id')
  @RequirePermissions('users:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete user' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.usersService.remove(id, user.organizationId);
  }

  @Post(':id/roles')
  @RequirePermissions('users:write')
  @ApiOperation({ summary: 'Assign a role to a user' })
  @ApiResponse({ status: 201, description: 'Role assigned' })
  assignRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() user: any,
  ) {
    return this.usersService.assignRole(
      id,
      dto.roleId,
      user.organizationId,
      user.id,
    );
  }

  @Delete(':id/roles/:roleId')
  @RequirePermissions('users:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a role from a user' })
  revokeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentUser() user: any,
  ) {
    return this.usersService.revokeRole(id, roleId, user.organizationId);
  }
}
