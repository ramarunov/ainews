import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AIGatewayService } from './ai-gateway.service';
import { AIWriterService } from './ai-writer.service';
import { AIController } from './ai.controller';
import {
  OpenAIProvider,
  AnthropicProvider,
  GoogleAIProvider,
} from './providers/ai-providers';

@Module({
  imports: [ConfigModule],
  providers: [
    OpenAIProvider,
    AnthropicProvider,
    GoogleAIProvider,
    AIGatewayService,
    AIWriterService,
  ],
  controllers: [AIController],
  exports: [AIGatewayService, AIWriterService],
})
export class AIModule {}
