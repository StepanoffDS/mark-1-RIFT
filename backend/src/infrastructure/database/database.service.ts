import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from './database.constants';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  query(text: string, values?: unknown[]) {
    return this.pool.query(text, values);
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
