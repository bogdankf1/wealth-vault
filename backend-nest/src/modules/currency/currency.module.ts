import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrencyConverterService } from './currency-converter.service';
import { Currency } from './entities/currency.entity';
import { ExchangeRate } from './entities/exchange-rate.entity';

/** PARTIAL module — the read-only slice of currency conversion that income's display fields need. */
@Module({
  imports: [TypeOrmModule.forFeature([Currency, ExchangeRate])],
  providers: [CurrencyConverterService],
  exports: [CurrencyConverterService, TypeOrmModule],
})
export class CurrencyModule {}
