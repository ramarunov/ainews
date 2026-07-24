import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAiProviderKeysDto {
  @ApiProperty({ required: false, description: 'Leave unset to keep the current value' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  openaiApiKey?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  anthropicApiKey?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  googleAiApiKey?: string;
}

export class SetAiServicesEnabledDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}

export class UpdateMediaProviderKeysDto {
  @ApiProperty({ required: false, description: 'Leave unset to keep the current value' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  pexelsApiKey?: string;
}

export class UpdateTelegramSettingsDto {
  @ApiProperty({ required: false, description: 'Leave unset to keep the current value' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  botToken?: string;

  @ApiProperty({ required: false, description: 'Channel to post to, e.g. @channelname or a numeric chat id. Leave unset to keep the current value' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  chatId?: string;
}

export class UpdateGoogleIndexingSettingsDto {
  @ApiProperty({
    required: false,
    description:
      'The full JSON key file downloaded for a Google Cloud service account with the Indexing API enabled ' +
      'and added as an Owner of the Search Console property. Leave unset to keep the current value. ' +
      'Structural validity (parses as JSON, has client_email/private_key) is checked on save.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  serviceAccountJson?: string;
}
