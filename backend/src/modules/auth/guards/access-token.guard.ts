import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { getAuthCookieName } from '../lib/auth-cookie';
import { AccessTokenPayload, AuthCookie, AuthenticatedRequest } from '../types';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = request.cookies[
      getAuthCookieName(this.configService, AuthCookie.Access)
    ] as string;

    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      request.user = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        {
          issuer: this.configService.getOrThrow<string>('JWT_ISSUER'),
          audience: this.configService.getOrThrow<string>('JWT_AUDIENCE'),
          algorithms: ['HS256'],
        },
      );
    } catch {
      throw new UnauthorizedException();
    }

    return true;
  }
}
