import { Column, Entity } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';
import { DistributionTypeName } from '../enums';

/**
 * The table carries a CHECK constraint — target_account_id IS NOT NULL OR target_goal_id IS NOT NULL
 * — so a rule with neither target is rejected by Postgres as well as by the service. The service
 * check exists to return FastAPI's 400 message rather than a 500 from the constraint violation.
 */
@Entity('income_distribution_rules')
export class IncomeDistributionRule extends BaseModel {
  @Column({ type: 'uuid' })
  userId!: string;

  /** null = a global rule, applying to every income source. */
  @Column({ type: 'uuid', nullable: true })
  incomeSourceId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  targetAccountId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  targetGoalId!: string | null;

  // varchar(20) holding the enum NAME: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'REMAINDER'.
  @Column({ type: 'varchar', length: 20 })
  distributionType!: DistributionTypeName;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  amount!: string | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  percentage!: string | null;

  @Column({ type: 'int' })
  priority!: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name!: string | null;

  @Column({ type: 'boolean' })
  isActive!: boolean;
}
