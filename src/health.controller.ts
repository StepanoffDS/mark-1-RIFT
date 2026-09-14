import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { DatabaseService } from './infrastructure/database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get()
  async checkHealth() {
    try {
      await this.databaseService.query('SELECT 1');
      return { database: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Database connection failed');
    }
  }
}
