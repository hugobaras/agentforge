import { Module } from '@nestjs/common';
import { SubmissionController } from './submission.controller';
import { SubmissionService } from './submission.service';
import { TenantsController } from './tenants.controller';

@Module({
  controllers: [SubmissionController, TenantsController],
  providers: [SubmissionService],
  exports: [SubmissionService],
})
export class SubmissionModule {}
