import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionsRepository } from './sessions.repository';
import { UsersRepository } from './users.repository';
import { AuthController } from './auth.controller';

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
  ],
})
export class AuthModule {}
