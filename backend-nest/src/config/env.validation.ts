import {
  plainToInstance,
  Transform,
  TransformFnParams,
} from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  @IsString()
  @Transform((params: TransformFnParams): unknown => {
    const value: unknown = params.value;
    return typeof value === 'string'
      ? value.replace('postgresql+asyncpg://', 'postgresql://')
      : value;
  })
  DATABASE_URL!: string;

  @IsString()
  @MinLength(1)
  SECRET_KEY!: string;

  @IsString()
  REDIS_URL: string = 'redis://localhost:6379/0';

  @IsInt()
  @Transform(({ value }) =>
    value === undefined ? 8001 : parseInt(String(value), 10),
  )
  PORT: number = 8001;

  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  DEBUG: boolean = false;

  @IsInt()
  @Transform(({ value }) =>
    value === undefined ? 30 : parseInt(String(value), 10),
  )
  ACCESS_TOKEN_EXPIRE_MINUTES: number = 30;

  @IsString()
  GOOGLE_CLIENT_ID: string = '';

  @IsString()
  CORS_ORIGINS: string = '["http://localhost:3000"]';

  @IsString()
  APP_NAME: string = 'Wealth Vault API';

  @IsString()
  APP_VERSION: string = '0.1.0';
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: true,
  });
  if (errors.length > 0) {
    const properties = errors.map((e) => e.property).join(', ');
    const details = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment: ${properties} — ${details}`);
  }
  return validated;
}

export function parseCorsOrigins(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return (parsed as unknown[]).map((entry) => String(entry));
    }
  } catch {
    // fall through to comma-separated parsing
  }
  return raw.split(',').map((s) => s.trim());
}
