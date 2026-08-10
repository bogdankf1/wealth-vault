import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';
import { User } from './user.entity';

@Entity('user_preferences')
export class UserPreferences extends BaseModel {
  @Column({ type: 'uuid', unique: true })
  userId!: string;

  @Column({ type: 'varchar', length: 20 })
  theme!: string;

  @Column({ type: 'varchar', length: 20 })
  accentColor!: string;

  @Column({ type: 'varchar', length: 20 })
  fontSize!: string;

  @Column({ type: 'varchar', length: 20 })
  defaultContentView!: string;

  @Column({ type: 'varchar', length: 20 })
  defaultStatsView!: string;

  @Column({ type: 'varchar', length: 10 })
  language!: string;

  @Column({ type: 'varchar', length: 2, nullable: true })
  country!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  occupation!: string | null;

  @Column({ type: 'varchar', length: 50 })
  timezone!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 3, nullable: true })
  displayCurrency!: string | null;

  @Column({ type: 'varchar', length: 20 })
  dateFormat!: string;

  @Column({ type: 'json', nullable: true })
  emailNotifications!: Record<string, boolean> | null;

  @Column({ type: 'json', nullable: true })
  pushNotifications!: Record<string, boolean> | null;

  @Column({ type: 'json', nullable: true })
  analyticsOptOut!: Record<string, boolean> | null;

  @Column({ type: 'varchar', length: 20 })
  dataVisibility!: string;

  @Column({ type: 'json', nullable: true })
  dashboardLayout!: Record<string, unknown> | null;

  // persistence: false — userId is the write path; setting .user on save() would silently
  // override userId with a different value if the two ever disagreed.
  @OneToOne(() => User, { persistence: false })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
