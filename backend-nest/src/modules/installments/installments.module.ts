import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisplayCurrencyModule } from '../../common/currency/currency.common-module';
import { provideOwnedRepository } from '../../common/repository/owned.repository';
import { CurrencyModule } from '../currency/currency.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { SavingsModule } from '../savings/savings.module';
import { UsersModule } from '../users/users.module';
import { Installment } from './entities/installment.entity';
import { InstallmentPayment } from './entities/installment-payment.entity';
import { InstallmentsController } from './installments.controller';
import { InstallmentStatsService } from './services/installment-stats.service';
import { InstallmentsService } from './services/installments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Installment, InstallmentPayment]),
    UsersModule,
    SavingsModule,
    CurrencyModule,
    DisplayCurrencyModule,
    ExpensesModule,
  ],
  controllers: [InstallmentsController],
  providers: [
    provideOwnedRepository(Installment),
    provideOwnedRepository(InstallmentPayment),
    InstallmentsService,
    InstallmentStatsService,
  ],
})
export class InstallmentsModule {}
