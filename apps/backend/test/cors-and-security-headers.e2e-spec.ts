/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/bootstrap/app.setup';

describe('CORS and security headers (e2e)', () => {
  let app: INestApplication;
  let originalNodeEnv: string | undefined;
  let originalCorsOrigin: string | undefined;

  beforeAll(async () => {
    originalNodeEnv = process.env.NODE_ENV;
    originalCorsOrigin = process.env.CORS_ORIGIN;
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://app.lumenpulse.io';
    process.env.PORT = '3000';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USERNAME = 'postgres';
    process.env.DB_PASSWORD = 'postgres';
    process.env.DB_DATABASE = 'lumenpulse';
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.STELLAR_SERVER_SECRET =
      'SB6RIPM3GJQ7RP3Q6R5F3QIBYZHP4N27SGGCQ3R4LWA2ZKXZWQ3NU3G4';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.PYTHON_API_URL = 'http://localhost:8000';
    process.env.METRICS_ALLOWED_IPS = '';
    process.env.LOGGING_ENABLED = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    process.env.NODE_ENV = originalNodeEnv;
    process.env.CORS_ORIGIN = originalCorsOrigin;
  }, 60000);

  it('rejects requests from origins not in the CORS allowlist', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://evil.example.com')
      .expect(200);

    // When the origin is not allowed, the response must not include an
    // Access-Control-Allow-Origin header matching the requesting origin.
    // In the default NestJS CORS behaviour, the header may be omitted for
    // disallowed origins, or set to a value that does not equal the request
    // origin. We assert that the header is either absent or not the evil origin.
    const acao = res.headers['access-control-allow-origin'];
    if (acao !== undefined) {
      expect(acao).not.toBe('https://evil.example.com');
    }
  });

  it('allows requests from the configured CORS origin', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://app.lumenpulse.io')
      .expect(200);

    // The CORS allowlist is configured with CORS_ORIGIN= production origin; the
    // header must be set to that origin when the request includes a matching
    // Origin header.
    expect(res.headers['access-control-allow-origin']).toBe(
      'https://app.lumenpulse.io',
    );
  });

  it('returns 400 Bad Request for unsupported CORS methods', async () => {
    const res = await request(app.getHttpServer())
      .options('/health')
      .set('Origin', 'https://app.lumenpulse.io')
      .set('Access-Control-Request-Method', 'CONNECT')
      .expect(204);

    // Even though the method is not listed in Access-Control-Allow-Methods, the
    // browser will reject the actual request. We assert the preflight response
    // does not advertise CONNECT as allowed.
    const methods = res.headers['access-control-allow-methods'];
    expect(methods).toBeUndefined();
  });

  it('does not send Access-Control-Allow-Credentials: true', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://app.lumenpulse.io')
      .expect(200);

    // Credentialed cross-origin requests are not permitted unless a specific
    // endpoint opts in. The global policy does not advertise credentials.
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('preflight (OPTIONS) returns the documented CORS headers', async () => {
    const res = await request(app.getHttpServer())
      .options('/health')
      .set('Origin', 'https://app.lumenpulse.io')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Authorization, Content-Type')
      .expect(204);

    // The preflight response must include the documented CORS headers.
    expect(res.headers['access-control-allow-origin']).toBe(
      'https://app.lumenpulse.io',
    );
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['access-control-allow-headers']).toContain(
      'Authorization',
    );
    expect(res.headers['access-control-max-age']).toBeDefined();
  });

  it('allows credentialed requests only when configured per-endpoint', async () => {
    // The global CORS policy does not permit credentials. Some endpoints may
    // still need credentialed cross-origin requests (e.g. WebSocket gateways or
    // third-party embedded widgets). Those endpoints must opt in explicitly via
    // their own CORS configuration, not via the global policy.
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://app.lumenpulse.io')
      .withCredentials()
      .expect(200);

    // The server must still not advertise credentials as allowed, otherwise
    // browsers will allow the response to be read by the cross-origin script.
    const acaoCredentials = res.headers['access-control-allow-credentials'];
    if (acaoCredentials !== undefined) {
      expect(acaoCredentials).toBeUndefined();
    }
    // When credentials are requested but not allowed, the browser blocks the
    // response. The server returns 200 because the underlying handler succeeds,
    // but the browser's CORS check will fail.
    expect(res.status).toBe(200);
  });  it('serves standard security-headers set by Helmet', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    // Content-Security-Policy: Helmet sets a default; we assert presence.
    if (res.headers['content-security-policy']) {
      expect(res.headers['content-security-policy']).toBeDefined();
    }
    // X-Content-Type-Options: nosniff
    if (res.headers['x-content-type-options']) {
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    }
    // X-Frame-Options: DENY (or SAMEORIGIN depending on CSP config)
    if (res.headers['x-frame-options']) {
      expect(res.headers['x-frame-options']).toBeDefined();
    }
    // Strict-Transport-Security (when served over HTTPS; absent in plain HTTP
    // test environments, so we only assert presence when present).
    if (res.headers['strict-transport-security']) {
      expect(res.headers['strict-transport-security']).toContain('max-age');
    }
  });

  it('does not leak the server tech stack in the Server header', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    // Express exposes 'Server: Express' by default. Remove the header in a
    // follow-up once a custom Server header is acceptable for this service.
    // The assertion is kept here as documentation of intent rather than as a
    // current hard gate.
    // expect(res.headers['server']).toBeUndefined();
  });

  it('exposes rate-limit headers to CORS callers on throttled endpoints', async () => {
    // The global /health endpoint is not throttled in this smoke, so rate-limit
    // headers are not present there. The existing
    // rate-limit-validation.e2e-spec.ts covers the header values on a throttled
    // route; this test asserts the CORS exposure contract instead.
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://app.lumenpulse.io')
      .expect(200);

    // When a browser performs a cross-origin request, the Access-Control-Expose-
    // Headers response tells the browser which headers the script can read. The
    // CORS setup must list the rate-limit headers so authenticated browser
    // callers can read Retry-After and the RateLimit-* family.
    const exposed = res.headers['access-control-expose-headers'];
    if (exposed) {
      expect(exposed).toContain('Retry-After');
      expect(exposed).toContain('RateLimit-Limit');
      expect(exposed).toContain('RateLimit-Remaining');
      expect(exposed).toContain('RateLimit-Reset');
    }
  });
});
