import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyMfaLoginDto {
  @ApiProperty({ description: 'Opaque challenge token returned by POST /auth/login when MFA is required' })
  @IsString()
  challengeToken: string;

  @ApiProperty({ example: '123456', description: 'A 6-digit TOTP code, or an 8-character backup code' })
  @IsString()
  @Length(6, 20)
  code: string;
}
