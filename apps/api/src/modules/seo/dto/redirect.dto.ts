import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// A redirect target must be a root-relative path on this site, never an
// absolute URL. The public site forwards `toUrl` straight into Next's
// redirect()/permanentRedirect() (see apps/web article-view.tsx), so an
// unrestricted value is a stored open redirect - phishing under the
// trusted domain, referrer laundering, etc. Requires a leading single "/"
// followed by a non-slash / non-backslash char (rejects "//evil.com",
// "/\evil.com" and other scheme-relative bypasses); a bare "/" (redirect
// to the homepage) is also allowed.
export const REDIRECT_TARGET_PATTERN = /^\/(?:$|[^/\\].*)$/;
export const REDIRECT_TARGET_MESSAGE =
  'toUrl must be a root-relative path on this site (start with "/", not "//" or an absolute URL)';

export class CreateRedirectDto {
  @ApiProperty({ example: '/old-article-slug' })
  @IsString()
  @MaxLength(1000)
  fromPath: string;

  @ApiProperty({ example: '/new-article-slug' })
  @IsString()
  @MaxLength(2000)
  @Matches(REDIRECT_TARGET_PATTERN, { message: REDIRECT_TARGET_MESSAGE })
  toUrl: string;

  @ApiPropertyOptional({ enum: [301, 302, 410], default: 301 })
  @IsOptional()
  @IsIn([301, 302, 410])
  statusCode?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateRedirectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Matches(REDIRECT_TARGET_PATTERN, { message: REDIRECT_TARGET_MESSAGE })
  toUrl?: string;

  @ApiPropertyOptional({ enum: [301, 302, 410] })
  @IsOptional()
  @IsIn([301, 302, 410])
  statusCode?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ResolvePathDto {
  @ApiProperty({ example: '/some-path' })
  @IsString()
  @MaxLength(1000)
  path: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  referrer?: string;
}
