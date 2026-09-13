import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfGuard } from './guards/csrf.guard';
import { PasswordService } from './password.service';
import { SessionsRepository } from './sessions.repository';
import { UsersRepository } from './users.repository';

@Module({
  imports: [
    DatabaseModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          issuer: config.getOrThrow<string>('JWT_ISSUER'),
          audience: config.getOrThrow<string>('JWT_AUDIENCE'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    PasswordService,
    UsersRepository,
    SessionsRepository,
    AuthService,
    CsrfGuard,
  ],
})
export class AuthModule {}
