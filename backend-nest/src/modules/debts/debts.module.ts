import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisplayCurrencyModule } from '../../common/currency/currency.common-module';
import { provideOwnedRepository } from '../../common/repository/owned.repository';
import { CurrencyModule } from '../currency/currency.module';
import { SavingsAccount } from '../savings/entities/savings-account.entity';
import { SavingsModule } from '../savings/savings.module';
import { UsersModule } from '../users/users.module';
import { DebtsController } from './debts.controller';
import { Debt } from './entities/debt.entity';
import { DebtPayment } from './entities/debt-payment.entity';
import { DebtPaymentsService } from './services/debt-payments.service';
import { DebtStatsService } from './services/debt-stats.service';
import { DebtsService } from './services/debts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Debt, DebtPayment, SavingsAccount]),
    UsersModule,
    SavingsModule,
    CurrencyModule,
    DisplayCurrencyModule,
  ],
  controllers: [DebtsController],
  providers: [
    provideOwnedRepository(Debt),
    provideOwnedRepository(DebtPayment),
    provideOwnedRepository(SavingsAccount),
    DebtsService,
    DebtPaymentsService,
    DebtStatsService,
  ],
})
export class DebtsModule {}
