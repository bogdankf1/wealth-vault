import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';
import { TierFeature } from './tier-feature.entity';

@Entity('tiers')
export class Tier extends BaseModel {
  @Column({ type: 'varchar', length: 50, unique: true })
  name!: string;

  @Column({ type: 'varchar', length: 100 })
  displayName!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'int' })
  priceMonthly!: number;

  @Column({ type: 'int' })
  priceAnnual!: number;

  @Column({ type: 'boolean' })
  isActive!: boolean;

  @OneToMany(() => TierFeature, (tf) => tf.tier)
  tierFeatures!: TierFeature[];
}
