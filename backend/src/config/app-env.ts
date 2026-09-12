import { ConfigService } from '@nestjs/config';

export function isProduction(configService: ConfigService) {
  return configService.get<string>('NODE_ENV') === 'production';
}

export function getRefreshSessionTtlMs(configService: ConfigService) {
  const days = Number(
    configService.getOrThrow<string>('REFRESH_SESSION_TTL_DAYS'),
  );

  if (!Number.isFinite(days) || days <= 0) {
    throw new Error('REFRESH_SESSION_TTL_DAYS must be a positive number');
  }

  return days * 24 * 60 * 60 * 1000;
}
