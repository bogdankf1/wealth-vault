import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisplayCurrencyModule } from '../../common/currency/currency.common-module';
import { provideOwnedRepository } from '../../common/repository/owned.repository';
import { IncomeModule } from '../income/income.module';
import { SavingsModule } from '../savings/savings.module';
import { TiersModule } from '../tiers/tiers.module';
import { UsersModule } from '../users/users.module';
import { Expense } from './entities/expense.entity';
import { ExpensesController } from './expenses.controller';
import { ExpensesCrudService } from './services/expenses-crud.service';
import { ExpensePaymentsService } from './services/expense-payments.service';
import { ExpenseStatsService } from './services/expense-stats.service';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Expense]),
    UsersModule,
    TiersModule,
    SavingsModule,
    DisplayCurrencyModule,
    CurrencyModule,
    // For UsageLimitService, which income already owns and both modules need.
    IncomeModule,
  ],
  controllers: [ExpensesController],
  providers: [
    provideOwnedRepository(Expense),
    ExpensesCrudService,
    ExpensePaymentsService,
    ExpenseStatsService,
  ],
})
export class ExpensesModule {}
