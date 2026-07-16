import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DisableMfaDto {
  @ApiProperty({ description: 'Current account password, required to turn MFA off' })
  @IsString()
  @MinLength(1)
  password: string;
}
