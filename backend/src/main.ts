import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { AppModule } from './app.module';
import cookieParser = require('cookie-parser');
import { isProduction } from './config/app-env';

// добавить import-sort и начать делать модуль auth
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = Number(configService.get<string>('BACKEND_PORT') ?? 3000);
  const corsOrigin = configService.get<string>('CORS_ORIGIN');

  app.use(helmet());
  app.use(cookieParser());

  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
      disableErrorMessages: isProduction(configService),
    }),
  );

  if (corsOrigin) {
    app.enableCors({
      origin: corsOrigin,
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
  }

  app.enableShutdownHooks();

  await app.listen(port);
}
void bootstrap();
