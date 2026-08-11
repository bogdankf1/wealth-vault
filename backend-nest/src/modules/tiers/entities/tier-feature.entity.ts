import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';
import { Feature } from './feature.entity';
import { Tier } from './tier.entity';

@Entity('tier_features')
export class TierFeature extends BaseModel {
  // tierId/tier and featureId/feature are each dual-mapped to the same tier_id/feature_id
  // column — see user.entity.ts's `tier` for the full mechanism and live-verified evidence
  // (relation silently wins over a conflicting scalar; insert:false/update:false was tried
  // and disables writes for both sides instead of isolating one). Only ever set one side of
  // each pair per save().
  @Column({ type: 'uuid' })
  tierId!: string;

  @Column({ type: 'uuid' })
  featureId!: string;

  @Column({ type: 'boolean' })
  enabled!: boolean;

  @Column({ type: 'int', nullable: true })
  limitValue!: number | null;

  @ManyToOne(() => Tier, (t) => t.tierFeatures)
  @JoinColumn({ name: 'tier_id' })
  tier!: Tier;

  @ManyToOne(() => Feature)
  @JoinColumn({ name: 'feature_id' })
  feature!: Feature;
}
