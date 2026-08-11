import { SetMetadata } from '@nestjs/common';

export const FORBID_DEMO_KEY = 'forbidDemo';
export const ForbidDemo = () => SetMetadata(FORBID_DEMO_KEY, true);
