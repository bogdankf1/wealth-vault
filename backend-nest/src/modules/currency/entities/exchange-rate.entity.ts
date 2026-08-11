import { Column, Entity } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';

/** PARTIAL entity — read-only in Phase 1. Nest never writes a rate; see the converter service. */
@Entity('exchange_rates')
export class ExchangeRate extends BaseModel {
  @Column({ type: 'varchar', length: 3 })
  fromCurrency!: string;

  @Column({ type: 'varchar', length: 3 })
  toCurrency!: string;

  // numeric(20,10) — string, like every other numeric column.
  @Column({ type: 'numeric', precision: 20, scale: 10 })
  rate!: string;

  @Column({ type: 'varchar', length: 100 })
  source!: string;

  @Column({ type: 'varchar' })
  fetchedAt!: string;

  @Column({ type: 'boolean' })
  isManualOverride!: boolean;
}
