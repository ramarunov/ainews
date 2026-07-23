import { IsDefined, IsOptional, IsBoolean, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetSettingDto {
  // `value` is deliberately untyped (any JSON shape a setting might need),
  // but main.ts's global ValidationPipe runs with forbidNonWhitelisted:
  // true - a property with zero class-validator decorators is invisible
  // to the whitelist check and gets rejected as "should not exist" for
  // every single caller, not validated leniently as you'd expect. @IsDefined()
  // requires no particular shape but registers the property so it survives
  // whitelisting. Without this, PUT /settings/:key could never work at all.
  //
  // @ValidateIf skips @IsDefined() specifically when value is null - several
  // settings use `null` as a real, meaningful value (e.g. autonomous-pipeline
  // daily/hourly limits and auto-publish confidence threshold all use null
  // for "unset"/"off"), and plain @IsDefined() rejects null exactly like
  // undefined, making those settings impossible to ever clear once set. A
  // genuinely missing `value` key (undefined) is still rejected.
  @ApiProperty({ description: 'Arbitrary JSON value for this setting (null is a valid "unset" value)' })
  @ValidateIf((o) => o.value !== null)
  @IsDefined()
  value: any;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
