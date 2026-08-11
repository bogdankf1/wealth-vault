import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisplayCurrencyModule } from '../../common/currency/currency.common-module';
import { provideOwnedRepository } from '../../common/repository/owned.repository';
import { CurrencyModule } from '../currency/currency.module';
import { IncomeSource } from '../income/entities/income-source.entity';
import { SavingsAccount } from '../savings/entities/savings-account.entity';
import { SavingsModule } from '../savings/savings.module';
import { UsersModule } from '../users/users.module';
import { Tax } from './entities/tax.entity';
import { TaxPayment } from './entities/tax-payment.entity';
import { TaxesController } from './taxes.controller';
import { TaxDuePaymentsService } from './services/tax-due-payments.service';
import { TaxEnrichmentService } from './services/tax-enrichment.service';
import { TaxPaymentsService } from './services/tax-payments.service';
import { TaxStatsService } from './services/tax-stats.service';
import { TaxesService } from './services/taxes.service';

/**
 * Reads income sources and savings accounts but owns neither — both are registered here only to get
 * an OwnedRepository, so every cross-module read is user-scoped rather than FK-scoped.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Tax, TaxPayment, IncomeSource, SavingsAccount]),
    UsersModule,
    SavingsModule,
    CurrencyModule,
    DisplayCurrencyModule,
  ],
  controllers: [TaxesController],
  providers: [
    provideOwnedRepository(Tax),
    provideOwnedRepository(TaxPayment),
    provideOwnedRepository(IncomeSource),
    provideOwnedRepository(SavingsAccount),
    TaxesService,
    TaxEnrichmentService,
    TaxPaymentsService,
    TaxStatsService,
    TaxDuePaymentsService,
  ],
})
export class TaxesModule {}
