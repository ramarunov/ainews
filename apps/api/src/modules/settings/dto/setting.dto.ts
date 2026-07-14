import { IsDefined, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetSettingDto {
  // `value` is deliberately untyped (any JSON shape a setting might need),
  // but main.ts's global ValidationPipe runs with forbidNonWhitelisted:
  // true - a property with zero class-validator decorators is invisible
  // to the whitelist check and gets rejected as "should not exist" for
  // every single caller, not validated leniently as you'd expect. @IsDefined()
  // requires no particular shape but registers the property so it survives
  // whitelisting. Without this, PUT /settings/:key could never work at all.
  @ApiProperty({ description: 'Arbitrary JSON value for this setting' })
  @IsDefined()
  value: any;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
