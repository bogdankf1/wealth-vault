import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Goal } from './entities/goal.entity';
import { GoalProgressHistory } from './entities/goal-progress-history.entity';
import { GoalProgressService } from './goal-progress.service';

/**
 * PARTIAL module — Phase 1 lands only the progress update that income distribution performs
 * against a goal target. Phase 3 owns goals.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Goal, GoalProgressHistory])],
  providers: [GoalProgressService],
  exports: [GoalProgressService, TypeOrmModule],
})
export class GoalsModule {}
