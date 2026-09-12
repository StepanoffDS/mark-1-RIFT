import { randomBytes } from 'node:crypto';

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { getRefreshSessionTtlMs, isProduction } from 'src/config/app-env';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthCookie, type Credentials } from './types';

type RequestWithCookies = Request & {
  cookies: Record<string, string | undefined>;
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.register(
      dto.email,
      dto.username,
      dto.password,
      request.get('user-agent') ?? undefined,
    );

    this.setCredentials(response, result);
    return { user: result.user };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(
      dto.email,
      dto.password,
      request.get('user-agent') ?? undefined,
    );

    this.setCredentials(response, result);
    return { user: result.user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  async refresh(
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ) {
    const credentials = await this.authService.refresh(
      request.cookies[this.cookieName(AuthCookie.Refresh)] ?? '',
    );

    this.setCredentials(response, credentials);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(
      request.cookies[this.cookieName(AuthCookie.Refresh)] ?? '',
    );

    this.clearCredentials(response);
  }

  private setCredentials(response: Response, credentials: Credentials) {
    const secure = isProduction(this.configService);
    const refreshMaxAge = getRefreshSessionTtlMs(this.configService);

    response.setHeader('Cache-Control', 'no-store');

    response.cookie(
      this.cookieName(AuthCookie.Access),
      credentials.accessToken,
      {
        ...this.cookieOptions(true),
        maxAge:
          Number(
            this.configService.getOrThrow<string>('ACCESS_TOKEN_TTL_SECONDS'),
          ) * 1000,
      },
    );

    response.cookie(
      this.cookieName(AuthCookie.Refresh),
      credentials.refreshToken,
      {
        ...this.cookieOptions(true),
        maxAge: refreshMaxAge,
      },
    );

    response.cookie(
      this.cookieName(AuthCookie.Csrf),
      randomBytes(32).toString('base64url'),
      {
        ...this.cookieOptions(false),
        maxAge: refreshMaxAge,
        secure,
      },
    );
  }

  private clearCredentials(response: Response) {
    response.setHeader('Cache-Control', 'no-store');

    for (const name of Object.values(AuthCookie)) {
      response.clearCookie(
        this.cookieName(name),
        this.cookieOptions(name !== AuthCookie.Csrf),
      );
    }
  }

  private cookieOptions(httpOnly: boolean) {
    return {
      httpOnly,
      secure: isProduction(this.configService),
      sameSite: 'strict' as const,
      path: '/',
    };
  }

  private cookieName(name: AuthCookie) {
    return isProduction(this.configService)
      ? `__Host-rift_${name}`
      : `rift_${name}`;
  }
}
