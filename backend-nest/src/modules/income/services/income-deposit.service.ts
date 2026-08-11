import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DetailException } from '../../../common/exceptions/app.exception';
import {
  OwnedRepository,
  ownedRepositoryToken,
} from '../../../common/repository/owned.repository';
import { DepositService } from '../../savings/deposit.service';
import { SavingsAccount } from '../../savings/entities/savings-account.entity';
import { DepositIncomeDto } from '../dto/income-transaction.dto';
import { IncomeTransaction } from '../entities/income-transaction.entity';

export interface IncomeDepositResponse {
  income_transaction_id: string;
  account_transaction_id: string;
  deposited_to_account_id: string;
  amount: string;
  currency: string;
  message: string;
}

/**
 * Port of IncomeService.deposit_income_to_account. Every failure here is a 400 carrying FastAPI's
 * exact message, because its router converts IncomeDepositError into an HTTPException.
 */
@Injectable()
export class IncomeDepositService {
  constructor(
    @Inject(ownedRepositoryToken(IncomeTransaction))
    private readonly transactions: OwnedRepository<IncomeTransaction>,
    private readonly deposits: DepositService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async deposit(
    userId: string,
    transactionId: string,
    dto: DepositIncomeDto,
  ): Promise<IncomeDepositResponse> {
    // One transaction for the whole use case. FastAPI commits inside create_deposit and again
    // after updating the income row, so a crash between the two credits the account while the
    // income stays RECEIVED — retryable into a double deposit.
    return this.dataSource.transaction(async (manager) => {
      const scoped = this.transactions.withManager(manager);
      const transaction = await scoped.findOne(userId, { id: transactionId });
      if (!transaction) {
        throw new DetailException(400, 'Income transaction not found');
      }
      if (transaction.status === 'DEPOSITED') {
        throw new DetailException(400, 'Income has already been deposited');
      }

      const account = await manager.findOne(SavingsAccount, {
        where: { id: dto.account_id, userId },
      });
      if (!account) {
        throw new DetailException(400, 'Invalid target account');
      }

      let accountTransactionId: string;
      try {
        const accountTransaction = await this.deposits.createDeposit(manager, {
          accountId: dto.account_id,
          userId,
          amount: transaction.amount,
          description:
            dto.description ??
            `Income deposit: ${transaction.description ?? 'Income'}`,
          sourceType: 'income',
          sourceId: transaction.id,
          category: transaction.category,
        });
        accountTransactionId = accountTransaction.id;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new DetailException(400, `Failed to create deposit: ${message}`);
      }

      transaction.status = 'DEPOSITED';
      transaction.depositedToAccountId = dto.account_id;
      transaction.accountTransactionId = accountTransactionId;
      await manager.save(transaction);

      return {
        income_transaction_id: transaction.id,
        account_transaction_id: accountTransactionId,
        deposited_to_account_id: dto.account_id,
        // The raw Decimal string, which is also what FastAPI interpolates into the message.
        amount: transaction.amount,
        currency: transaction.currency,
        message: `Successfully deposited ${transaction.amount} ${transaction.currency} to account`,
      };
    });
  }
}
