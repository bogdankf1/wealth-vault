import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountTransaction } from './entities/account-transaction.entity';
import { BalanceHistory } from './entities/balance-history.entity';
import { SavingsAccount } from './entities/savings-account.entity';
import { DepositService } from './deposit.service';

/**
 * PARTIAL module — Phase 1 lands only the deposit path, which income's deposit and distribute
 * endpoints require. Phase 3 owns savings properly and will grow this module rather than replace it.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SavingsAccount,
      AccountTransaction,
      BalanceHistory,
    ]),
  ],
  providers: [DepositService],
  exports: [DepositService, TypeOrmModule],
})
export class SavingsModule {}
