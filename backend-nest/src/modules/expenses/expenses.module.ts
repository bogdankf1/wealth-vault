import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { provideOwnedRepository } from '../../common/repository/owned.repository';
import { Expense } from './entities/expense.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Expense])],
  controllers: [],
  providers: [provideOwnedRepository(Expense)],
})
export class ExpensesModule {}
