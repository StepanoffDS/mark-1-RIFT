import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { AccessTokenGuard } from './guards/access-token.guard';
import { CsrfGuard } from './guards/csrf.guard';
import { SessionsRepository } from './sessions.repository';
import { AuthenticatedRequest } from './types';
import { UsersRepository } from './users.repository';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionsRepository: SessionsRepository,
  ) {}

  @Get('me')
  @UseGuards(AccessTokenGuard)
  async me(@Req() request: AuthenticatedRequest) {
    const user = await this.usersRepository.findById(request.user.sub);

    if (!user) {
      throw new UnauthorizedException();
    }

    return { user };
  }

  @Get('me/sessions')
  @UseGuards(AccessTokenGuard)
  async sessions(@Req() request: AuthenticatedRequest) {
    const sessions = await this.sessionsRepository.findActiveByUserId(
      request.user.sub,
    );

    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        userAgent: session.user_agent,
        createdAt: session.created_at,
        lastUsedAt: session.last_used_at,
        expiresAt: session.expires_at,
        current: session.id === request.user.sid,
      })),
    };
  }

  @Delete('me/sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard, CsrfGuard)
  async revokeSession(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    if (sessionId === request.user.sid) {
      throw new BadRequestException('Use /auth/logout for the current session');
    }

    await this.sessionsRepository.revokeByIdAndUserId(
      sessionId,
      request.user.sub,
    );
  }
}
