import { DecisionType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateDecisionDto {
  @IsEnum(DecisionType)
  type: DecisionType;

  @IsOptional()
  @IsString()
  comment?: string;
}
