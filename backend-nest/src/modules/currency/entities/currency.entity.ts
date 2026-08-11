import { Column, Entity } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';

/** PARTIAL entity — read-only in Phase 1, used to quantize a converted amount to the right scale. */
@Entity('currencies')
export class Currency extends BaseModel {
  @Column({ type: 'varchar', length: 3 })
  code!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 10 })
  symbol!: string;

  @Column({ type: 'int' })
  decimalPlaces!: number;

  @Column({ type: 'boolean' })
  isActive!: boolean;
}
