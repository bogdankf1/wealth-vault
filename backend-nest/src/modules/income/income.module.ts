import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { provideOwnedRepository } from '../../common/repository/owned.repository';
import { CurrencyModule } from '../currency/currency.module';
import { GoalsModule } from '../goals/goals.module';
import { SavingsModule } from '../savings/savings.module';
import { TiersModule } from '../tiers/tiers.module';
import { UsersModule } from '../users/users.module';
import { IncomeDistributionRule } from './entities/income-distribution-rule.entity';
import { IncomeSource } from './entities/income-source.entity';
import { IncomeTransaction } from './entities/income-transaction.entity';
import { DistributionController } from './distribution.controller';
import { IncomeController } from './income.controller';
import { DistributionService } from './services/distribution.service';
import { IncomeBackfillService } from './services/income-backfill.service';
import { IncomeDepositService } from './services/income-deposit.service';
import { DisplayCurrencyService } from './services/display-currency.service';
import { IncomeSourcesService } from './services/income-sources.service';
import { IncomeHistoryService } from './services/income-history.service';
import { IncomeStatsService } from './services/income-stats.service';
import { IncomeTransactionsService } from './services/income-transactions.service';
import { UsageLimitService } from './services/usage-limit.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IncomeSource,
      IncomeTransaction,
      IncomeDistributionRule,
    ]),
    UsersModule,
    TiersModule,
    SavingsModule,
    GoalsModule,
    CurrencyModule,
  ],
  controllers: [IncomeController, DistributionController],
  providers: [
    // Services receive these, never a bare Repository — user scoping is structural.
    provideOwnedRepository(IncomeSource),
    provideOwnedRepository(IncomeTransaction),
    provideOwnedRepository(IncomeDistributionRule),
    DisplayCurrencyService,
    IncomeSourcesService,
    UsageLimitService,
    IncomeTransactionsService,
    IncomeStatsService,
    IncomeHistoryService,
    IncomeDepositService,
    DistributionService,
    IncomeBackfillService,
  ],
})
export class IncomeModule {}
