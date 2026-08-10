import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Tier } from '../src/modules/tiers/entities/tier.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { UserPreferences } from '../src/modules/users/entities/user-preferences.entity';

describe('Entity mappings against the live dev DB', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  // A find() selects every mapped column — it throws if any column doesn't exist in the DB.
  it('User maps onto users', async () => {
    await expect(
      dataSource.getRepository(User).find({ take: 1, withDeleted: true }),
    ).resolves.toBeDefined();
  });

  it('Tier maps and the wealth tier exists (with features relation)', async () => {
    const wealth = await dataSource.getRepository(Tier).findOne({
      where: { name: 'wealth' },
      relations: { tierFeatures: { feature: true } },
    });
    expect(wealth).not.toBeNull();
    expect(wealth!.displayName.length).toBeGreaterThan(0);
  });

  it('UserPreferences maps onto user_preferences', async () => {
    await expect(
      dataSource
        .getRepository(UserPreferences)
        .find({ take: 1, withDeleted: true }),
    ).resolves.toBeDefined();
  });
});
