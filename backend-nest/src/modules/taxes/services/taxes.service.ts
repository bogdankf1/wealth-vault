import { Inject, Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { DisplayCurrencyService } from '../../../common/currency/display-currency.service';
import { DetailException } from '../../../common/exceptions/app.exception';
import {
  PaginatedResponse,
  paginated,
} from '../../../common/dto/page-query.dto';
import { naiveUtcNow } from '../../../common/entities/naive-timestamp.entity';
import { reload } from '../../../common/repository/reload';
import {
  OwnedRepository,
  ownedRepositoryToken,
} from '../../../common/repository/owned.repository';
import { IncomeSource } from '../../income/entities/income-source.entity';
import { SavingsAccount } from '../../savings/entities/savings-account.entity';
import {
  BatchDeleteTaxesDto,
  CreateTaxDto,
  ListTaxesQueryDto,
  UpdateTaxDto,
} from '../dto/tax.dto';
import { Tax } from '../entities/tax.entity';
import { TaxResponse, toTaxResponse } from '../mappers/tax-response.mapper';
import { nextTaxPaymentDate } from '../tax-period';
import { TaxEnrichmentService } from './tax-enrichment.service';

@Injectable()
export class TaxesService {
  constructor(
    @Inject(ownedRepositoryToken(Tax))
    private readonly taxes: OwnedRepository<Tax>,
    @Inject(ownedRepositoryToken(IncomeSource))
    private readonly incomeSources: OwnedRepository<IncomeSource>,
    @Inject(ownedRepositoryToken(SavingsAccount))
    private readonly accounts: OwnedRepository<SavingsAccount>,
    private readonly enrichment: TaxEnrichmentService,
    private readonly displayCurrency: DisplayCurrencyService,
    private readonly dataSource: DataSource,
  ) {}

  async list(
    userId: string,
    query: ListTaxesQueryDto,
  ): Promise<PaginatedResponse<TaxResponse>> {
    const where = {
      deletedAt: IsNull(),
      ...(query.is_active === undefined ? {} : { isActive: query.is_active }),
      ...(query.income_source_id
        ? { incomeSourceId: query.income_source_id }
        : {}),
    };

    const total = await this.taxes.count(userId, where);
    const rows = await this.taxes.find(userId, {
      where,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size,
    });

    // One display-currency lookup for the whole page; FastAPI re-reads preferences per row, which
    // is the same answer at more cost.
    const display = await this.displayCurrency.forUser(userId);
    const items: TaxResponse[] = [];
    for (const row of rows) {
      items.push(
        toTaxResponse(row, await this.enrichment.enrich(userId, row, display)),
      );
    }
    return paginated(items, total, query);
  }

  async get(userId: string, taxId: string): Promise<TaxResponse> {
    const tax = await this.requireTax(userId, taxId);
    return toTaxResponse(tax, await this.enrichment.enrich(userId, tax));
  }

  async create(userId: string, dto: CreateTaxDto): Promise<TaxResponse> {
    await this.assertLinksOwned(
      userId,
      dto.income_source_id,
      dto.payment_account_id,
    );

    const tax = await this.dataSource.transaction(async (manager) => {
      const row = manager.create(Tax, {
        userId,
        name: dto.name,
        description: dto.description ?? null,
        taxType: dto.tax_type,
        frequency: dto.frequency,
        fixedAmount: dto.fixed_amount ?? null,
        currency: dto.currency,
        percentage: dto.percentage ?? null,
        incomeSourceId: dto.income_source_id ?? null,
        paymentAccountId: dto.payment_account_id ?? null,
        autoPay: dto.auto_pay,
        // Only derived when auto_pay is on and the client supplied nothing.
        nextPaymentDate:
          dto.auto_pay && !dto.next_payment_date
            ? nextTaxPaymentDate(dto.frequency)
            : (dto.next_payment_date ?? null),
        isActive: dto.is_active,
        notes: dto.notes ?? null,
        deletedAt: null,
      });
      await manager.save(row);
      // FastAPI re-selects through get_tax() after committing, so the response carries the
      // column's scale rather than the request body's.
      return reload(manager, Tax, row.id);
    });

    return toTaxResponse(tax, await this.enrichment.enrich(userId, tax));
  }

  async update(
    userId: string,
    taxId: string,
    dto: UpdateTaxDto,
  ): Promise<TaxResponse> {
    await this.assertLinksOwned(
      userId,
      dto.income_source_id,
      dto.payment_account_id,
    );

    const tax = await this.dataSource.transaction(async (manager) => {
      const scoped = this.taxes.withManager(manager);
      const row = await scoped.findOne(userId, {
        id: taxId,
        deletedAt: IsNull(),
      });
      if (!row) throw new DetailException(404, 'Tax not found');

      // The auto-derived date fires only when auto_pay is being turned ON and no date exists on
      // either the payload or the row — FastAPI's two-part condition, kept verbatim.
      const enablingAutoPay = dto.auto_pay === true && !row.autoPay;
      const hasNoDate = !dto.next_payment_date && !row.nextPaymentDate;

      assign(row, dto);

      if (enablingAutoPay && hasNoDate) {
        row.nextPaymentDate = nextTaxPaymentDate(
          dto.frequency ?? row.frequency,
        );
      }
      row.updatedAt = naiveUtcNow();
      await manager.save(row);
      return reload(manager, Tax, row.id);
    });

    return toTaxResponse(tax, await this.enrichment.enrich(userId, tax));
  }

  async remove(userId: string, taxId: string): Promise<void> {
    const deleted = await this.softDelete(userId, taxId);
    if (!deleted) throw new DetailException(404, 'Tax not found');
  }

  /**
   * Batch delete. Every failure — missing, already deleted, or an outright error — lands in
   * failed_ids; FastAPI wraps each iteration in a bare `except Exception`.
   */
  async batchDelete(
    userId: string,
    dto: BatchDeleteTaxesDto,
  ): Promise<{ deleted_count: number; failed_ids: string[] }> {
    let deleted_count = 0;
    const failed_ids: string[] = [];
    for (const id of dto.ids) {
      try {
        if (await this.softDelete(userId, id)) deleted_count += 1;
        else failed_ids.push(id);
      } catch {
        failed_ids.push(id);
      }
    }
    return { deleted_count, failed_ids };
  }

  private async softDelete(userId: string, taxId: string): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const scoped = this.taxes.withManager(manager);
      const row = await scoped.findOne(userId, {
        id: taxId,
        deletedAt: IsNull(),
      });
      if (!row) return false;
      row.deletedAt = naiveUtcNow();
      await manager.save(row);
      return true;
    });
  }

  async requireTax(userId: string, taxId: string): Promise<Tax> {
    const tax = await this.taxes.findOne(userId, {
      id: taxId,
      deletedAt: IsNull(),
    });
    if (!tax) throw new DetailException(404, 'Tax not found');
    return tax;
  }

  /**
   * Deliberate divergence: FastAPI validates neither id, so a tax can be pointed at another user's
   * income source or savings account and will then echo that row's name, amount and balance back.
   * Rejecting on write is the write-side half of the fix; TaxEnrichmentService scopes the reads.
   */
  private async assertLinksOwned(
    userId: string,
    incomeSourceId?: string | null,
    paymentAccountId?: string | null,
  ): Promise<void> {
    if (incomeSourceId) {
      const source = await this.incomeSources.findOne(userId, {
        id: incomeSourceId,
      });
      if (!source) throw new DetailException(404, 'Income source not found');
    }
    if (paymentAccountId) {
      const account = await this.accounts.findOne(userId, {
        id: paymentAccountId,
      });
      if (!account) throw new DetailException(404, 'Payment account not found');
    }
  }
}

/** `model_dump(exclude_unset=True)` — only keys actually present in the body are written. */
function assign(row: Tax, dto: UpdateTaxDto): void {
  if ('name' in dto) row.name = dto.name!;
  if ('description' in dto) row.description = dto.description ?? null;
  if ('tax_type' in dto) row.taxType = dto.tax_type!;
  if ('frequency' in dto) row.frequency = dto.frequency!;
  if ('fixed_amount' in dto) row.fixedAmount = dto.fixed_amount ?? null;
  if ('currency' in dto) row.currency = dto.currency!;
  if ('percentage' in dto) row.percentage = dto.percentage ?? null;
  if ('income_source_id' in dto)
    row.incomeSourceId = dto.income_source_id ?? null;
  if ('payment_account_id' in dto)
    row.paymentAccountId = dto.payment_account_id ?? null;
  if ('auto_pay' in dto) row.autoPay = dto.auto_pay!;
  if ('next_payment_date' in dto)
    row.nextPaymentDate = dto.next_payment_date ?? null;
  if ('is_active' in dto) row.isActive = dto.is_active!;
  if ('notes' in dto) row.notes = dto.notes ?? null;
}
