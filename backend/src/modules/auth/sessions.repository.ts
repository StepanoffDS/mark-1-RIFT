import { Injectable } from '@nestjs/common';
import { type PoolClient } from 'pg';
import { DatabaseService } from 'src/infrastructure/database/database.service';

type SessionRow = {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
};

@Injectable()
export class SessionsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(
    client: PoolClient,
    userId: string,
    refreshTokenHash: string,
    expiresAt: Date,
    userAgent?: string,
  ): Promise<SessionRow> {
    const result = await client.query(
      `INSERT INTO sessions (user_id, refresh_token_hash, expires_at, user_agent)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, refresh_token_hash, expires_at, revoked_at`,
      [userId, refreshTokenHash, expiresAt, userAgent ?? null],
    );

    return result.rows[0] as SessionRow;
  }

  async findByIdForUpdate(
    client: PoolClient,
    sessionId: string,
  ): Promise<SessionRow | null> {
    const result = await client.query(
      `SELECT id, user_id, refresh_token_hash, expires_at, revoked_at
       FROM sessions
       WHERE id = $1
       FOR UPDATE`,
      [sessionId],
    );

    return (result.rows[0] as SessionRow | undefined) ?? null;
  }

  async rotate(
    client: PoolClient,
    sessionId: string,
    refreshTokenHash: string,
  ) {
    await client.query(
      `UPDATE sessions
       SET refresh_token_hash = $2, last_used_at = now()
       WHERE id = $1`,
      [sessionId, refreshTokenHash],
    );
  }

  async revoke(client: PoolClient, sessionId: string) {
    await client.query(
      `UPDATE sessions
       SET revoked_at = now()
       WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId],
    );
  }
}
