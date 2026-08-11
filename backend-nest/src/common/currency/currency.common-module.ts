import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrencyModule } from '../../modules/currency/currency.module';
import { UserPreferences } from '../../modules/users/entities/user-preferences.entity';
import { DisplayCurrencyService } from './display-currency.service';

/** Shared by income and expenses — both need the same display-currency enrichment. */
@Module({
  imports: [TypeOrmModule.forFeature([UserPreferences]), CurrencyModule],
  providers: [DisplayCurrencyService],
  exports: [DisplayCurrencyService],
})
export class DisplayCurrencyModule {}
