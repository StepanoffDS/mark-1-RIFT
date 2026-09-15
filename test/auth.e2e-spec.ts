import { randomUUID } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AppModule } from 'src/app.module';
import { DatabaseService } from 'src/infrastructure/database/database.service';
import request = require('supertest');
import type { Agent, Response } from 'supertest';
import cookieParser = require('cookie-parser');

const csrfCookieName = 'rift_csrf';
const refreshCookieName = 'rift_refresh';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let origin: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    const config = app.get(ConfigService);

    if (config.getOrThrow<string>('POSTGRES_DB') !== 'mark-1-rift-test') {
      throw new Error('E2E tests must use mark-1-rift-test database');
    }

    database = app.get(DatabaseService);
    origin = config.getOrThrow<string>('CORS_ORIGIN');
  });

  beforeEach(async () => {
    await database.query('TRUNCATE sessions, users RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects register without a CSRF token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .send(credentials())
      .expect(403);
  });

  it('registers a user and returns the current user from access cookie', async () => {
    const agent = request.agent(app.getHttpServer());
    const csrfToken = await getCsrf(agent);
    const user = credentials();

    const registerResponse = await agent
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrfToken)
      .send(user)
      .expect(201);

    expect(cookie(registerResponse, 'rift_access')).toBeDefined();
    expect(cookie(registerResponse, refreshCookieName)).toBeDefined();
    expect(cookie(registerResponse, csrfCookieName)).toBeDefined();

    const meResponse = await agent.get('/api/v1/users/me').expect(200);

    expect(meResponse.body).toMatchObject({
      user: {
        email: user.email,
        username: user.username,
      },
    });
  });

  it('rotates refresh tokens and rejects their reuse', async () => {
    const agent = request.agent(app.getHttpServer());
    const csrfToken = await getCsrf(agent);

    const registerResponse = await agent
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrfToken)
      .send(credentials())
      .expect(201);

    const oldRefreshToken = cookie(registerResponse, refreshCookieName)!;
    const nextCsrfToken = cookie(registerResponse, csrfCookieName)!;

    const refreshResponse = await agent
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('X-CSRF-Token', nextCsrfToken)
      .expect(204);

    expect(cookie(refreshResponse, refreshCookieName)).not.toBe(
      oldRefreshToken,
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', [
        `${refreshCookieName}=${oldRefreshToken}`,
        `${csrfCookieName}=${nextCsrfToken}`,
      ])
      .set('X-CSRF-Token', nextCsrfToken)
      .expect(401);
  });

  it('revokes the session on logout', async () => {
    const agent = request.agent(app.getHttpServer());
    const csrfToken = await getCsrf(agent);

    const registerResponse = await agent
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrfToken)
      .send(credentials())
      .expect(201);

    const refreshToken = cookie(registerResponse, refreshCookieName)!;
    const nextCsrfToken = cookie(registerResponse, csrfCookieName)!;

    await agent
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('X-CSRF-Token', nextCsrfToken)
      .expect(204);

    await agent.get('/api/v1/users/me').expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', [
        `${refreshCookieName}=${refreshToken}`,
        `${csrfCookieName}=${nextCsrfToken}`,
      ])
      .set('X-CSRF-Token', nextCsrfToken)
      .expect(401);
  });
});

async function getCsrf(agent: Agent) {
  const response = await agent.get('/api/v1/auth/csrf').expect(204);

  return cookie(response, csrfCookieName)!;
}

function cookie(response: Response, name: string) {
  return response
    .get('Set-Cookie')
    ?.find((value) => value.startsWith(`${name}=`))
    ?.split(';', 1)[0]
    .slice(name.length + 1);
}

function credentials() {
  const id = randomUUID().slice(0, 8);

  return {
    email: `e2e-${id}@example.test`,
    username: `e2e_${id}`,
    password: 'SecurePassword123!',
  };
}
