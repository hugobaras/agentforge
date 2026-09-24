import { Module } from '@nestjs/common';
import { GitModule } from '../git/git.module';
import { DecisionController } from './decision.controller';
import { DecisionService } from './decision.service';

@Module({
  imports: [GitModule],
  controllers: [DecisionController],
  providers: [DecisionService],
})
export class DecisionModule {}
