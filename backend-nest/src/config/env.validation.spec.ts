import { validateEnv, parseCorsOrigins } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  SECRET_KEY: 's3cret',
};

describe('validateEnv', () => {
  it('accepts minimal config and applies defaults', () => {
    const env = validateEnv({ ...base });
    expect(env.PORT).toBe(8001);
    expect(env.REDIS_URL).toBe('redis://localhost:6379/0');
    expect(env.ACCESS_TOKEN_EXPIRE_MINUTES).toBe(30);
    expect(env.DEBUG).toBe(false);
    expect(env.APP_VERSION).toBe('0.1.0');
  });

  it('throws when SECRET_KEY is missing', () => {
    expect(() => validateEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(
      /SECRET_KEY/,
    );
  });

  it('strips +asyncpg from DATABASE_URL', () => {
    const env = validateEnv({
      ...base,
      DATABASE_URL: 'postgresql+asyncpg://u:p@h:5432/db',
    });
    expect(env.DATABASE_URL).toBe('postgresql://u:p@h:5432/db');
  });

  it('coerces PORT and DEBUG from strings', () => {
    const env = validateEnv({ ...base, PORT: '8001', DEBUG: 'true' });
    expect(env.PORT).toBe(8001);
    expect(env.DEBUG).toBe(true);
  });

  it('ignores unknown env keys instead of throwing', () => {
    const env = validateEnv({ ...base, MONOBANK_TEST_TOKEN: 'xyz' });
    expect(env).not.toHaveProperty('MONOBANK_TEST_TOKEN');
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => validateEnv({ SECRET_KEY: base.SECRET_KEY })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('throws when PORT is not numeric', () => {
    expect(() => validateEnv({ ...base, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('throws when DEBUG has an unrecognized value', () => {
    expect(() => validateEnv({ ...base, DEBUG: 'banana' })).toThrow(/DEBUG/);
  });
});

describe('parseCorsOrigins', () => {
  it('parses a JSON array', () => {
    expect(
      parseCorsOrigins('["http://localhost:3000","https://x.app"]'),
    ).toEqual(['http://localhost:3000', 'https://x.app']);
  });

  it('parses a comma-separated list', () => {
    expect(parseCorsOrigins('http://a.com, http://b.com')).toEqual([
      'http://a.com',
      'http://b.com',
    ]);
  });
});
