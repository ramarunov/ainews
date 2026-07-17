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
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';

import { UsersService } from './users.service';
import { MediaService } from '../media/media.service';
import {
  CreateUserDto,
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
  constructor(
    private readonly usersService: UsersService,
    private readonly mediaService: MediaService,
  ) {}

  @Get()
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'List users with filtering and pagination' })
  findAll(@Query() query: UserQueryDto, @CurrentUser() user: any) {
    return this.usersService.findAll(query, user.organizationId);
  }

  @Post()
  @RequirePermissions('users:write')
  @ApiOperation({ summary: 'Create a new user in this organization with a temporary password' })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: any) {
    return this.usersService.create(dto, user.organizationId, user.id);
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

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: "Upload and set the current user's avatar" })
  async uploadMyAvatar(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    // Deliberately no @RequirePermissions('media:write') here - setting
    // your OWN avatar is a self-service profile action available to every
    // authenticated user regardless of role, same as the rest of /users/me.
    // The general media:write permission gates the shared content library
    // (POST /media/upload), a different concern.
    const media = await this.mediaService.upload(file, user.id, user.organizationId, { folder: 'avatars' });
    const avatarUrl = media.publicUrl ?? media.cdnUrl ?? undefined;
    return this.usersService.updateOwnProfile(user.id, { avatarUrl });
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
