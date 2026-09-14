import type { ConfigService } from '@nestjs/config';
import { isProduction } from 'src/config/app-env';

import { AuthCookie } from '../types';

export function getAuthCookieName(
  configService: ConfigService,
  cookie: AuthCookie,
) {
  return isProduction(configService)
    ? `__Host-rift_${cookie}`
    : `rift_${cookie}`;
}
