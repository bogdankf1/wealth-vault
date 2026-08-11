import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { provideOwnedRepository } from '../../common/repository/owned.repository';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionPayment } from './entities/subscription-payment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription, SubscriptionPayment])],
  providers: [
    provideOwnedRepository(Subscription),
    provideOwnedRepository(SubscriptionPayment),
  ],
})
export class SubscriptionsModule {}
