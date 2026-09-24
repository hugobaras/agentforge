import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Decision } from '@prisma/client';
import { DecisionService } from './decision.service';
import { CreateDecisionDto } from './dto/create-decision.dto';

@Controller('lots/:lotId/decisions')
export class DecisionController {
  constructor(private readonly decisionService: DecisionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('lotId', ParseUUIDPipe) lotId: string,
    @Body() dto: CreateDecisionDto,
  ): Promise<Decision> {
    return this.decisionService.create(lotId, dto);
  }

  @Get()
  findAll(@Param('lotId', ParseUUIDPipe) lotId: string): Promise<Decision[]> {
    return this.decisionService.findAll(lotId);
  }
}
