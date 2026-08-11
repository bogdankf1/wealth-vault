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
import { IncomeController } from './income.controller';
import { DisplayCurrencyService } from './services/display-currency.service';
import { IncomeSourcesService } from './services/income-sources.service';
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
  controllers: [IncomeController],
  providers: [
    // Services receive these, never a bare Repository — user scoping is structural.
    provideOwnedRepository(IncomeSource),
    provideOwnedRepository(IncomeTransaction),
    provideOwnedRepository(IncomeDistributionRule),
    DisplayCurrencyService,
    IncomeSourcesService,
    UsageLimitService,
  ],
})
export class IncomeModule {}
