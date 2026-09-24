import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateLotDto } from './dto/create-lot.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import {
  LotDetail,
  LotWithSpec,
  SubmissionService,
} from './submission.service';

@Controller('lots')
export class SubmissionController {
  constructor(private readonly submissionService: SubmissionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateLotDto): Promise<LotWithSpec> {
    return this.submissionService.create(dto);
  }

  @Get()
  findAll(
    @Query('tenantId') tenantId?: string,
  ): Promise<LotWithSpec[]> {
    return this.submissionService.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<LotDetail> {
    return this.submissionService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLotDto,
  ): Promise<LotWithSpec> {
    return this.submissionService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.submissionService.remove(id);
  }
}
