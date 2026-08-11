import { Column, Entity } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';
import { IncomeFrequencyName } from '../enums';

@Entity('income_sources')
export class IncomeSource extends BaseModel {
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category!: string | null;

  // numeric(15,2) — arrives as a string from node-postgres and stays one. Never add a transformer.
  @Column({ type: 'numeric', precision: 15, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  // varchar(20) holding the enum NAME, e.g. 'MONTHLY'. The wire value is 'monthly'.
  @Column({ type: 'varchar', length: 20 })
  frequency!: IncomeFrequencyName;

  @Column({ type: 'boolean' })
  isActive!: boolean;

  // These three columns are `timestamp WITHOUT time zone` in Postgres, deliberately declared
  // `varchar` here. Two things have to line up to keep the value a string:
  //   1. the OID 1114 parser registered at bootstrap, so node-postgres hands back the raw text;
  //   2. this type, because TypeORM re-hydrates anything it considers a date column through
  //      `new Date(value)` regardless of what the driver returned — which reinterprets the naive
  //      text in the process timezone and lands on the previous calendar day west of UTC.
  // Declaring varchar keeps reads verbatim, and writes bind an untyped parameter that Postgres
  // casts back into the timestamp column. `synchronize: false` means the type mismatch is inert.
  @Column({ type: 'varchar', nullable: true })
  date!: string | null;

  @Column({ type: 'varchar', nullable: true })
  startDate!: string | null;

  @Column({ type: 'varchar', nullable: true })
  endDate!: string | null;

  @Column({ type: 'uuid', nullable: true })
  targetAccountId!: string | null;

  @Column({ type: 'boolean' })
  autoDeposit!: boolean;
}
