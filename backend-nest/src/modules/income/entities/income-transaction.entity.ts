import { Column, Entity } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';
import type { IncomeStatusName } from '../enums';

@Entity('income_transactions')
export class IncomeTransaction extends BaseModel {
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid', nullable: true })
  sourceId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  // NOT NULL, and naive — see IncomeSource.date.
  @Column({ type: 'varchar' })
  date!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category!: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes!: string | null;

  @Column({ type: 'uuid', nullable: true })
  depositedToAccountId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  accountTransactionId!: string | null;

  // varchar(20) holding the enum NAME: 'RECEIVED' | 'DEPOSITED' | 'EXPECTED'.
  @Column({ type: 'varchar', length: 20 })
  status!: IncomeStatusName;
}
