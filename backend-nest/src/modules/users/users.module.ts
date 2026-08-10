import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserPreferences } from './entities/user-preferences.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserPreferences])],
  exports: [TypeOrmModule],
})
export class UsersModule {}
