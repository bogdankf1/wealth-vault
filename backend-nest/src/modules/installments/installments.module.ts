import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { provideOwnedRepository } from '../../common/repository/owned.repository';
import { Installment } from './entities/installment.entity';
import { InstallmentPayment } from './entities/installment-payment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Installment, InstallmentPayment])],
  providers: [
    provideOwnedRepository(Installment),
    provideOwnedRepository(InstallmentPayment),
  ],
})
export class InstallmentsModule {}
