import { OwnedRepository } from './owned.repository';

interface Row {
  id: string;
  userId: string;
}

function fakeRepo() {
  return {
    target: class {},
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(),
  };
}

describe('OwnedRepository', () => {
  it('injects user_id into findOne', async () => {
    const repo = fakeRepo();
    await new OwnedRepository<Row>(repo as never).findOne('u-1', {
      id: 'x',
    });
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'x', userId: 'u-1' },
    });
  });

  it('injects user_id into find, preserving order and paging options', async () => {
    const repo = fakeRepo();
    await new OwnedRepository<Row>(repo as never).find('u-1', {
      where: { id: 'x' },
      order: { id: 'DESC' } as never,
      skip: 10,
      take: 5,
    });
    expect(repo.find).toHaveBeenCalledWith({
      where: { id: 'x', userId: 'u-1' },
      order: { id: 'DESC' },
      skip: 10,
      take: 5,
    });
  });

  it('injects user_id into count', async () => {
    const repo = fakeRepo();
    await new OwnedRepository<Row>(repo as never).count('u-1');
    expect(repo.count).toHaveBeenCalledWith({ where: { userId: 'u-1' } });
  });

  // The caller cannot override the owner by passing their own userId in the where clause.
  it('wins over a user_id supplied by the caller', async () => {
    const repo = fakeRepo();
    await new OwnedRepository<Row>(repo as never).findOne('u-1', {
      userId: 'someone-else',
    });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { userId: 'u-1' } });
  });

  it('pre-scopes a query builder', () => {
    const repo = fakeRepo();
    const qb = { andWhere: jest.fn().mockReturnThis() };
    repo.createQueryBuilder.mockReturnValue(qb);
    new OwnedRepository<Row>(repo as never).qb('u-1', 's');
    expect(repo.createQueryBuilder).toHaveBeenCalledWith('s');
    expect(qb.andWhere).toHaveBeenCalledWith('s.user_id = :ownerId', {
      ownerId: 'u-1',
    });
  });
});
