import { IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnalyticsQueryDto {
  @ApiProperty({ required: false, example: 30 })
  @IsOptional()
  days?: number;
}
