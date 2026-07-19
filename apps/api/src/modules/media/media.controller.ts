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
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';

import { MediaService } from './media.service';
import { MEDIA_MAX_UPLOAD_BYTES } from './media.constants';
import { StockPhotoService } from './stock-photo.service';
import {
  UpdateMediaDto,
  MediaQueryDto,
  UploadMediaDto,
  StockPhotoSearchDto,
  AttachStockPhotoDto,
} from './dto/media.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Media')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'media', version: '1' })
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly stockPhotoService: StockPhotoService,
  ) {}

  @Get('stock-photos/search')
  @RequirePermissions('media:write')
  @ApiOperation({ summary: 'Search Pexels for real (non-AI-generated) stock photos by keyword' })
  searchStockPhotos(@Query() query: StockPhotoSearchDto) {
    return this.stockPhotoService.search(query.query, query.perPage);
  }

  @Post('stock-photos/attach')
  @RequirePermissions('media:write')
  @ApiOperation({ summary: 'Download a searched stock photo and store it as a real media file' })
  attachStockPhoto(@Body() dto: AttachStockPhotoDto, @CurrentUser() user: any) {
    return this.stockPhotoService.downloadAndAttach(
      { fullUrl: dto.fullUrl, photographer: dto.photographer ?? 'Pexels', alt: dto.alt ?? null },
      user.id,
      user.organizationId,
    );
  }

  @Post('upload')
  @RequirePermissions('media:write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MEDIA_MAX_UPLOAD_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        folder: { type: 'string' },
        altText: { type: 'string' },
        caption: { type: 'string' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload a media file' })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDto,
    @CurrentUser() user: any,
  ) {
    return this.mediaService.upload(file, user.id, user.organizationId, dto);
  }

  @Get()
  @RequirePermissions('media:read')
  @ApiOperation({ summary: 'List media files with filtering and pagination' })
  findAll(@Query() query: MediaQueryDto, @CurrentUser() user: any) {
    return this.mediaService.findAll(query, user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('media:read')
  @ApiOperation({ summary: 'Get media file by ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.mediaService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('media:write')
  @ApiOperation({ summary: 'Update media file metadata' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMediaDto,
    @CurrentUser() user: any,
  ) {
    return this.mediaService.update(id, dto, user.organizationId);
  }

  @Post(':id/generate-alt-text')
  @RequirePermissions('media:write')
  @ApiOperation({ summary: 'Generate alt text for an image with AI (MED-005)' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  generateAltText(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.mediaService.generateAltText(id, user.organizationId);
  }

  @Delete(':id')
  @RequirePermissions('media:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete media file' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.mediaService.remove(id, user.organizationId);
  }
}
