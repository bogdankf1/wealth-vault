import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  decAdd,
  decCmp,
  decDiv,
  decMin,
  decMul,
} from '../../common/money/money';
import { Goal } from './entities/goal.entity';
import { GoalProgressHistory } from './entities/goal-progress-history.entity';

function naiveNow(now: Date): string {
  return now.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * calculate_progress_percentage (app/modules/goals/service/common.py:83): (current/target)*100,
 * capped at 100, and 0 when the target is not positive.
 */
export function progressPercentage(
  currentAmount: string,
  targetAmount: string,
): string {
  if (decCmp(targetAmount, '0') <= 0) return '0';
  return decMin(decMul(decDiv(currentAmount, targetAmount), '100'), '100');
}

/**
 * The goal half of income distribution: port of the inline goal update in
 * DistributionService.apply_distribution plus record_progress_snapshot.
 *
 * One deliberate difference from FastAPI, which disagrees with itself here: its inline update writes
 * an UNCAPPED (current/target)*100 into goals.progress_percentage, a numeric(5,2) column, so a goal
 * at 10x its target raises a numeric-overflow error mid-distribution — while the snapshot row it
 * writes in the same breath uses the capped helper. Both are capped here.
 */
@Injectable()
export class GoalProgressService {
  async addToGoal(
    manager: EntityManager,
    input: {
      userId: string;
      goalId: string;
      amount: string;
      notes: string | null;
    },
  ): Promise<Goal | null> {
    const goal = await manager.findOne(Goal, {
      where: { id: input.goalId, userId: input.userId, isActive: true },
    });
    if (!goal) return null;

    const now = new Date();
    goal.currentAmount = decAdd(goal.currentAmount, input.amount);
    goal.progressPercentage = progressPercentage(
      goal.currentAmount,
      goal.targetAmount,
    );
    if (
      !goal.isCompleted &&
      decCmp(goal.currentAmount, goal.targetAmount) >= 0
    ) {
      goal.isCompleted = true;
      goal.completedAt = naiveNow(now);
    }
    goal.updatedAt = naiveNow(now);
    await manager.save(goal);

    await this.recordSnapshot(manager, {
      userId: input.userId,
      goal,
      triggerType: 'transaction',
      notes: input.notes,
      now,
    });

    return goal;
  }

  /**
   * Skips writing when the newest snapshot for this goal has the same amount and is less than 60
   * seconds old — FastAPI's `skip_if_unchanged` dedup, kept so repeated distributions don't stack
   * identical history rows.
   */
  private async recordSnapshot(
    manager: EntityManager,
    input: {
      userId: string;
      goal: Goal;
      triggerType: string;
      notes: string | null;
      now: Date;
    },
  ): Promise<void> {
    const recent = await manager.findOne(GoalProgressHistory, {
      where: { goalId: input.goal.id, userId: input.userId },
      order: { recordedDate: 'DESC' },
    });

    if (recent) {
      const recordedAt = new Date(`${recent.recordedDate.replace(' ', 'T')}Z`);
      const secondsAgo = (input.now.getTime() - recordedAt.getTime()) / 1000;
      const sameAmount =
        decCmp(recent.currentAmount, input.goal.currentAmount) === 0;
      if (secondsAgo < 60 && sameAmount) return;
    }

    await manager.save(
      manager.create(GoalProgressHistory, {
        goalId: input.goal.id,
        userId: input.userId,
        recordedDate: naiveNow(input.now),
        currentAmount: input.goal.currentAmount,
        targetAmount: input.goal.targetAmount,
        progressPercentage: progressPercentage(
          input.goal.currentAmount,
          input.goal.targetAmount,
        ),
        linkedAccountsSnapshot: null,
        triggerType: input.triggerType,
        notes: input.notes,
        createdAt: naiveNow(input.now),
      }),
    );
  }
}
