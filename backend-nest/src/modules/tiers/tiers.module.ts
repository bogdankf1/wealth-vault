import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Feature } from './entities/feature.entity';
import { Tier } from './entities/tier.entity';
import { TierFeature } from './entities/tier-feature.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tier, Feature, TierFeature])],
  exports: [TypeOrmModule],
})
export class TiersModule {}
