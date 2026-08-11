import { Column, Entity } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';

@Entity('features')
export class Feature extends BaseModel {
  @Column({ type: 'varchar', length: 100, unique: true })
  key!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  module!: string | null;
}
