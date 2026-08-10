import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';
import { Feature } from './feature.entity';
import { Tier } from './tier.entity';

@Entity('tier_features')
export class TierFeature extends BaseModel {
  @Column({ type: 'uuid' })
  tierId!: string;

  @Column({ type: 'uuid' })
  featureId!: string;

  @Column({ type: 'boolean' })
  enabled!: boolean;

  @Column({ type: 'int', nullable: true })
  limitValue!: number | null;

  // persistence: false on both relations below — tierId/featureId are the write path;
  // setting .tier/.feature on save() would silently override them with a different value
  // if the two ever disagreed.
  @ManyToOne(() => Tier, (t) => t.tierFeatures, { persistence: false })
  @JoinColumn({ name: 'tier_id' })
  tier!: Tier;

  @ManyToOne(() => Feature, { persistence: false })
  @JoinColumn({ name: 'feature_id' })
  feature!: Feature;
}
