import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { DatabaseService } from './database.service';
import { PG_POOL } from './database.constants';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_POOL,
      useFactory: async (configService: ConfigService) => {
        const pool = new Pool({
          host: 'localhost',
          port: 5432,
          user: configService.get<string>('POSTGRES_USER'),
          password: configService.get<string>('POSTGRES_PASSWORD'),
          database: configService.get<string>('POSTGRES_DB'),
        });
        await pool.connect();
        return pool;
      },
      inject: [ConfigService],
    },
    DatabaseService,
  ],
  exports: ['PG_POOL', DatabaseService],
})
export class DatabaseModule {}
