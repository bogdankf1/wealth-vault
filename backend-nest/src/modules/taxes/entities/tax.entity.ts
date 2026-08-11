import { Column, Entity } from 'typeorm';
import { NaiveTimestampModel } from '../../../common/entities/naive-timestamp.entity';

/**
 * `tax_type` and `frequency` hold lowercase text — but for a different reason than subscriptions
 * and installments do. FastAPI declares them `SQLEnum(TaxType, native_enum=False)`, which persists
 * the enum member's NAME; the names happen to equal the values (`fixed = "fixed"`). So the columns
 * agree with slice 2 by coincidence, not by convention. Treat them as plain lowercase strings.
 *
 * Soft-deleted via deleted_at, like expenses — every read must filter it.
 */
@Entity('taxes')
export class Tax extends NaiveTimestampModel {
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** fixed | percentage */
  @Column({ type: 'varchar', length: 20 })
  taxType!: string;

  /** monthly | quarterly | annually */
  @Column({ type: 'varchar', length: 20 })
  frequency!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  fixedAmount!: string | null;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  /** 0-100, a percent rather than a fraction — unlike savings_accounts.interest_rate. */
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  percentage!: string | null;

  /** NULL means the tax applies to ALL income sources, not none. */
  @Column({ type: 'uuid', nullable: true })
  incomeSourceId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  paymentAccountId!: string | null;

  @Column({ type: 'boolean' })
  autoPay!: boolean;

  @Column({ type: 'varchar', nullable: true })
  nextPaymentDate!: string | null;

  @Column({ type: 'boolean' })
  isActive!: boolean;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'varchar', nullable: true })
  deletedAt!: string | null;
}
