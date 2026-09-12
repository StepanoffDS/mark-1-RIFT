import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { type Pool, type PoolClient } from 'pg';

import { PG_POOL } from './database.constants';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  query(text: string, values?: unknown[]) {
    return this.pool.query(text, values);
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
