import { Module } from '@nestjs/common';
import { WebSubService } from './websub.service';

@Module({
  providers: [WebSubService],
})
export class WebSubModule {}
