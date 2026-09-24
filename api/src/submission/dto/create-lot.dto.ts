import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateSpecDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  body: string;
}

export class CreateLotDto {
  @IsUUID()
  tenantId: string;

  @IsString()
  @MinLength(1)
  title: string;

  @ValidateNested()
  @Type(() => CreateSpecDto)
  spec: CreateSpecDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  repoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  baseBranch?: string;
}
