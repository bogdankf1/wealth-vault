import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ListResponse, listed } from '../../../common/dto/page-query.dto';
import {
  DetailException,
  NotFoundException,
} from '../../../common/exceptions/app.exception';
import {
  decAdd,
  decCmp,
  decDiv,
  decMin,
  decMul,
  decSub,
} from '../../../common/money/money';
import {
  OwnedRepository,
  ownedRepositoryToken,
} from '../../../common/repository/owned.repository';
import { Goal } from '../../goals/entities/goal.entity';
import { GoalProgressService } from '../../goals/goal-progress.service';
import { AccountTransactionService } from '../../savings/account-transaction.service';
import { SavingsAccount } from '../../savings/entities/savings-account.entity';
import {
  CreateDistributionRuleDto,
  DistributionPreviewQueryDto,
  UpdateDistributionRuleDto,
} from '../dto/distribution.dto';
import { ListDistributionRulesQueryDto } from '../dto/income-query.dto';
import { IncomeDistributionRule } from '../entities/income-distribution-rule.entity';
import { IncomeSource } from '../entities/income-source.entity';
import { IncomeTransaction } from '../entities/income-transaction.entity';
import { DISTRIBUTION_TYPE_TO_NAME } from '../enums';
import {
  IncomeDistributionRuleResponse,
  toRuleResponse,
} from '../mappers/income-response.mapper';

export interface DistributionPreviewItem {
  rule_id: string;
  rule_name: string | null;
  target_type: string;
  target_id: string;
  target_name: string;
  amount: string;
  currency: string;
}

export interface DistributionPreviewResponse {
  income_amount: string;
  currency: string;
  distributions: DistributionPreviewItem[];
  remaining_amount: string;
  total_distributed: string;
}

@Injectable()
export class DistributionService {
  constructor(
    @Inject(ownedRepositoryToken(IncomeDistributionRule))
    private readonly rules: OwnedRepository<IncomeDistributionRule>,
    @Inject(ownedRepositoryToken(IncomeSource))
    private readonly sources: OwnedRepository<IncomeSource>,
    @Inject(ownedRepositoryToken(IncomeTransaction))
    private readonly transactions: OwnedRepository<IncomeTransaction>,
    private readonly deposits: AccountTransactionService,
    private readonly goalProgress: GoalProgressService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------- rules CRUD

  async list(
    userId: string,
    query: ListDistributionRulesQueryDto,
  ): Promise<ListResponse<IncomeDistributionRuleResponse>> {
    const rules = await this.findRules(userId, {
      incomeSourceId: query.income_source_id,
      isActive: query.is_active,
    });
    const enriched = await Promise.all(
      rules.map((rule) => this.enrich(userId, rule)),
    );
    // FastAPI's envelope here is {items, total} with total = len(items) — no page/page_size.
    return listed(enriched);
  }

  async get(
    userId: string,
    ruleId: string,
  ): Promise<IncomeDistributionRuleResponse> {
    return this.enrich(userId, await this.findOwnedOrFail(userId, ruleId));
  }

  async create(
    userId: string,
    dto: CreateDistributionRuleDto,
  ): Promise<IncomeDistributionRuleResponse> {
    // Validation order matters — FastAPI returns the first failure and clients read the message.
    if (!dto.target_account_id && !dto.target_goal_id) {
      throw new DetailException(
        400,
        'Rule must have either a target account or target goal',
      );
    }
    if (dto.distribution_type === 'percentage' && !dto.percentage) {
      throw new DetailException(
        400,
        'Percentage type requires percentage value',
      );
    }
    if (dto.distribution_type === 'fixed_amount' && !dto.amount) {
      throw new DetailException(400, 'Fixed amount type requires amount value');
    }
    await this.assertTargetsOwned(userId, dto);

    const rule = this.rules.raw.create({
      userId,
      incomeSourceId: dto.income_source_id ?? null,
      targetAccountId: dto.target_account_id ?? null,
      targetGoalId: dto.target_goal_id ?? null,
      distributionType: DISTRIBUTION_TYPE_TO_NAME[dto.distribution_type],
      amount: dto.amount ?? null,
      percentage: dto.percentage ?? null,
      priority: dto.priority,
      name: dto.name ?? null,
      isActive: dto.is_active,
    });
    await this.rules.raw.save(rule);
    return this.enrich(userId, rule);
  }

  async update(
    userId: string,
    ruleId: string,
    dto: UpdateDistributionRuleDto,
  ): Promise<IncomeDistributionRuleResponse> {
    const rule = await this.findOwnedOrFail(userId, ruleId);
    await this.assertTargetsOwned(userId, dto);

    if ('income_source_id' in dto) {
      rule.incomeSourceId = dto.income_source_id ?? null;
    }
    if ('target_account_id' in dto) {
      rule.targetAccountId = dto.target_account_id ?? null;
    }
    if ('target_goal_id' in dto) rule.targetGoalId = dto.target_goal_id ?? null;
    if (dto.distribution_type !== undefined) {
      rule.distributionType = DISTRIBUTION_TYPE_TO_NAME[dto.distribution_type];
    }
    if ('amount' in dto) rule.amount = dto.amount ?? null;
    if ('percentage' in dto) rule.percentage = dto.percentage ?? null;
    if (dto.priority !== undefined) rule.priority = dto.priority;
    if ('name' in dto) rule.name = dto.name ?? null;
    if (dto.is_active !== undefined) rule.isActive = dto.is_active;

    await this.rules.raw.save(rule);
    return this.enrich(userId, rule);
  }

  async remove(userId: string, ruleId: string): Promise<void> {
    const rule = await this.findOwnedOrFail(userId, ruleId);
    await this.rules.raw.softRemove(rule);
  }

  // ------------------------------------------------------------------- preview

  async preview(
    userId: string,
    query: DistributionPreviewQueryDto,
  ): Promise<DistributionPreviewResponse> {
    const distributions = await this.computeDistributions(
      userId,
      query.income_amount,
      query.currency,
      query.income_source_id ?? null,
    );
    return {
      income_amount: query.income_amount,
      currency: query.currency,
      ...distributions,
    };
  }

  /**
   * The core allocation loop. Three behaviours here look like bugs and are deliberate copies:
   *  - a percentage is taken off the ORIGINAL amount, never off what remains, so rules summing
   *    above 100% drive `remaining` negative (the loop then stops on the NEXT iteration, after the
   *    over-allocating rule has already been applied in full);
   *  - a fixed amount is clamped to what remains, so it can be partially satisfied;
   *  - nothing is rounded. The unrounded value is what gets written, and the numeric(12,2) column
   *    does the rounding in Postgres.
   */
  private async computeDistributions(
    userId: string,
    incomeAmount: string,
    currency: string,
    incomeSourceId: string | null,
  ): Promise<{
    distributions: DistributionPreviewItem[];
    remaining_amount: string;
    total_distributed: string;
  }> {
    const rules = await this.findRules(userId, {
      incomeSourceId: incomeSourceId ?? undefined,
      isActive: true,
    });

    const distributions: DistributionPreviewItem[] = [];
    let remaining = incomeAmount;
    let totalDistributed = '0';

    for (const rule of rules) {
      if (decCmp(remaining, '0') <= 0) break;

      let amount = '0';
      if (rule.distributionType === 'PERCENTAGE') {
        amount = decMul(incomeAmount, decDiv(rule.percentage ?? '0', '100'));
      } else if (rule.distributionType === 'FIXED_AMOUNT') {
        amount = decMin(rule.amount ?? '0', remaining);
      } else {
        amount = remaining;
      }
      if (decCmp(amount, '0') <= 0) continue;

      const targetType = rule.targetAccountId ? 'account' : 'goal';
      const targetId = (rule.targetAccountId ?? rule.targetGoalId)!;
      distributions.push({
        rule_id: rule.id,
        rule_name: rule.name,
        target_type: targetType,
        target_id: targetId,
        target_name: (await this.targetName(userId, rule)) ?? 'Unknown',
        amount,
        // Echoed verbatim from the request; FastAPI does not upper-case it here.
        currency,
      });

      totalDistributed = decAdd(totalDistributed, amount);
      remaining = decSub(remaining, amount);
    }

    return {
      distributions,
      remaining_amount: remaining,
      total_distributed: totalDistributed,
    };
  }

  // ------------------------------------------------------------------ applying

  async apply(
    userId: string,
    transactionId: string,
  ): Promise<{
    message: string;
    deposits: Array<{ account_transaction_id: string; amount: number }>;
  }> {
    // One transaction for the whole distribution. FastAPI commits per deposit and again per goal
    // snapshot, so a failure halfway leaves money moved into some targets and not others.
    return this.dataSource.transaction(async (manager) => {
      const transaction = await this.transactions
        .withManager(manager)
        .findOne(userId, { id: transactionId });
      if (!transaction) {
        throw new DetailException(400, 'Income transaction not found');
      }

      const { distributions } = await this.computeDistributions(
        userId,
        transaction.amount,
        transaction.currency,
        transaction.sourceId,
      );

      const created: Array<{ account_transaction_id: string; amount: string }> =
        [];
      let firstAccountTargetId: string | null = null;

      for (const distribution of distributions) {
        const label = `Income distribution: ${distribution.rule_name ?? 'Auto-distribution'}`;
        if (distribution.target_type === 'account') {
          const accountTransaction = await this.deposits.createDeposit(
            manager,
            {
              accountId: distribution.target_id,
              userId,
              amount: distribution.amount,
              sourceType: 'income',
              sourceId: transaction.id,
              description: label,
            },
          );
          created.push({
            account_transaction_id: accountTransaction.id,
            amount: distribution.amount,
          });
          firstAccountTargetId ??= distribution.target_id;
        } else {
          await this.goalProgress.addToGoal(manager, {
            userId,
            goalId: distribution.target_id,
            amount: distribution.amount,
            notes: label,
          });
        }
      }

      if (created.length > 0) {
        transaction.status = 'DEPOSITED';
        // FastAPI writes distributions[0].target_id here, which is a GOAL id whenever a goal rule
        // sorts first — into a column whose FK points at savings_accounts, i.e. a guaranteed
        // violation. Use the account that was actually credited.
        transaction.depositedToAccountId = firstAccountTargetId;
        transaction.accountTransactionId = created[0].account_transaction_id;
        await manager.save(transaction);
      }

      return {
        message: `Successfully distributed income to ${created.length} account(s)`,
        // The one place in this module where an amount is a JSON number, not a string: FastAPI
        // builds this dict by hand with float(amount) and response_model=dict, so nothing coerces
        // it back to a Decimal.
        deposits: created.map((deposit) => ({
          account_transaction_id: deposit.account_transaction_id,
          amount: Number(deposit.amount),
        })),
      };
    });
  }

  // ------------------------------------------------------------------- helpers

  private async findOwnedOrFail(
    userId: string,
    ruleId: string,
  ): Promise<IncomeDistributionRule> {
    const rule = await this.rules.findOne(userId, { id: ruleId });
    if (!rule) throw new NotFoundException('Distribution rule not found');
    return rule;
  }

  /**
   * When an income source is given, global rules (income_source_id IS NULL) apply as well — so a
   * source-specific query is an OR, not an equality.
   */
  private findRules(
    userId: string,
    filters: { incomeSourceId?: string; isActive?: boolean },
  ): Promise<IncomeDistributionRule[]> {
    const builder = this.rules.qb(userId, 'r');
    if (filters.incomeSourceId) {
      builder.andWhere(
        '(r.income_source_id = :sourceId OR r.income_source_id IS NULL)',
        { sourceId: filters.incomeSourceId },
      );
    }
    if (filters.isActive !== undefined) {
      builder.andWhere('r.is_active = :isActive', {
        isActive: filters.isActive,
      });
    }
    // ORDER BY priority only — FastAPI has no secondary sort, so ties are DB order.
    return builder.orderBy('r.priority', 'ASC').getMany();
  }

  /**
   * Every lookup is user-scoped. FastAPI's enrich_rule_response fetches by primary key with no
   * owner check, and its update path never validates income_source_id ownership — so a user can
   * point a rule at someone else's source and read that source's name back out. Fixed here.
   */
  private async enrich(
    userId: string,
    rule: IncomeDistributionRule,
  ): Promise<IncomeDistributionRuleResponse> {
    const [incomeSourceName, targetAccountName, targetGoalName] =
      await Promise.all([
        rule.incomeSourceId
          ? this.sources
              .findOne(userId, { id: rule.incomeSourceId })
              .then((source) => source?.name ?? null)
          : Promise.resolve(null),
        rule.targetAccountId
          ? this.dataSource
              .getRepository(SavingsAccount)
              .findOne({ where: { id: rule.targetAccountId, userId } })
              .then((account) => account?.name ?? null)
          : Promise.resolve(null),
        rule.targetGoalId
          ? this.dataSource
              .getRepository(Goal)
              .findOne({ where: { id: rule.targetGoalId, userId } })
              .then((goal) => goal?.name ?? null)
          : Promise.resolve(null),
      ]);

    return toRuleResponse(rule, {
      incomeSourceName,
      targetAccountName,
      targetGoalName,
    });
  }

  private async targetName(
    userId: string,
    rule: IncomeDistributionRule,
  ): Promise<string | null> {
    if (rule.targetAccountId) {
      const account = await this.dataSource
        .getRepository(SavingsAccount)
        .findOne({ where: { id: rule.targetAccountId, userId } });
      return account?.name ?? null;
    }
    if (rule.targetGoalId) {
      const goal = await this.dataSource
        .getRepository(Goal)
        .findOne({ where: { id: rule.targetGoalId, userId } });
      return goal?.name ?? null;
    }
    return null;
  }

  /** Ownership checks for the three foreign keys a rule can carry. */
  private async assertTargetsOwned(
    userId: string,
    dto: CreateDistributionRuleDto | UpdateDistributionRuleDto,
  ): Promise<void> {
    if (dto.income_source_id) {
      const source = await this.sources.findOne(userId, {
        id: dto.income_source_id,
      });
      if (!source) throw new DetailException(400, 'Invalid income source');
    }
    if (dto.target_account_id) {
      const account = await this.dataSource
        .getRepository(SavingsAccount)
        .findOne({ where: { id: dto.target_account_id, userId } });
      if (!account) throw new DetailException(400, 'Invalid target account');
    }
    if (dto.target_goal_id) {
      const goal = await this.dataSource
        .getRepository(Goal)
        .findOne({ where: { id: dto.target_goal_id, userId } });
      if (!goal) throw new DetailException(400, 'Invalid target goal');
    }
  }
}
