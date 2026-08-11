import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisplayCurrencyModule } from '../../common/currency/currency.common-module';
import { provideOwnedRepository } from '../../common/repository/owned.repository';
import { CurrencyModule } from '../currency/currency.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { SavingsModule } from '../savings/savings.module';
import { UsersModule } from '../users/users.module';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionPayment } from './entities/subscription-payment.entity';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionStatsService } from './services/subscription-stats.service';
import { SubscriptionsService } from './services/subscriptions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, SubscriptionPayment]),
    UsersModule,
    SavingsModule,
    CurrencyModule,
    DisplayCurrencyModule,
    // For the mirror expense — subscriptions record payments as rows in expenses.
    ExpensesModule,
  ],
  controllers: [SubscriptionsController],
  providers: [
    provideOwnedRepository(Subscription),
    provideOwnedRepository(SubscriptionPayment),
    SubscriptionsService,
    SubscriptionStatsService,
  ],
})
export class SubscriptionsModule {}
