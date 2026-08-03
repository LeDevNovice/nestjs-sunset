import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';

import { DeprecationRegistry } from '../../../src/registry/deprecation.registry';
import { TestAppModule } from '../fixtures/test-app.module';

const DEPRECATION_FULL = '@1735689600';
const SUNSET_FULL = 'Fri, 01 Jan 2027 00:00:00 UTC';
const LINK_FULL = '</docs/migration>; rel="deprecation"; type="text/html"';

describe('SunsetModule E2E [Fastify]', () => {
  let app: INestApplication;

  const http = () => supertest(app.getHttpServer() as Server);

  const findRecord = (route: string) =>
    app
      .get(DeprecationRegistry)
      .getAll()
      .find((r) => r.routeDescription === route);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleRef.createNestApplication(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /deprecated-full', () => {
    let res: Awaited<ReturnType<ReturnType<typeof http>['get']>>;

    beforeAll(async () => {
      res = await http().get('/deprecated-full');
    });

    it('should return HTTP 200', () => {
      expect(res.status).toBe(200);
    });

    it(`should have Deprecation header that is exactly "${DEPRECATION_FULL}" (2025-01-01T00:00:00Z in unix seconds)`, () => {
      expect(res.headers['deprecation']).toBe(DEPRECATION_FULL);
    });

    it(`should have Sunset header that is exactly "${SUNSET_FULL}" (2027-01-01T00:00:00Z in IMF-fixdate)`, () => {
      expect(res.headers['sunset']).toBe(SUNSET_FULL);
    });

    it(`should have Link header that is "${LINK_FULL}"`, () => {
      expect(res.headers['link']).toBe(LINK_FULL);
    });

    it('should have Deprecation header that match "@<digits>" Structured Field Date format (RFC 9745)', () => {
      expect(res.headers['deprecation']).toMatch(/^@\d+$/);
    });

    it('should have Sunset header that is in IMF-fixdate format and NOT "@<digits>" (RFC 9745)', () => {
      expect(res.headers['sunset']).toMatch(
        /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} UTC$/,
      );
      expect(res.headers['sunset']).not.toMatch(/^@\d+$/);
    });

    it('should have Sunset header that ends with "UTC" — never "GMT"', () => {
      expect(res.headers['sunset']).toMatch(/ UTC$/);
      expect(res.headers['sunset']).not.toMatch(/ GMT$/);
    });

    it('should have response body { ok: true }', () => {
      expect(res.body).toStrictEqual({ ok: true });
    });
  });

  describe('GET /deprecated-minimal', () => {
    let res: Awaited<ReturnType<ReturnType<typeof http>['get']>>;

    beforeAll(async () => {
      res = await http().get('/deprecated-minimal');
    });

    it('should return HTTP 200', () => {
      expect(res.status).toBe(200);
    });

    it('should have Deprecation header', () => {
      expect(res.headers['deprecation']).toBeDefined();
    });

    it('should have Deprecation header matches "@<digits>" Structured Field Date format', () => {
      expect(res.headers['deprecation']).toMatch(/^@\d+$/);
    });

    it('should have Sunset header ABSENT when no sunset option was provided', () => {
      expect(res.headers['sunset']).toBeUndefined();
    });

    it('should have Link header ABSENT when no link option was provided', () => {
      expect(res.headers['link']).toBeUndefined();
    });
  });

  describe('GET /active', () => {
    let res: Awaited<ReturnType<ReturnType<typeof http>['get']>>;

    beforeAll(async () => {
      res = await http().get('/active');
    });

    it('should return HTTP 200', () => {
      expect(res.status).toBe(200);
    });

    it('should have Deprecation header ABSENT and endpoint is not deprecated', () => {
      expect(res.headers['deprecation']).toBeUndefined();
    });

    it('should have Sunset header ABSENT', () => {
      expect(res.headers['sunset']).toBeUndefined();
    });

    it('should have Link header ABSENT', () => {
      expect(res.headers['link']).toBeUndefined();
    });
  });

  describe('GET /deprecated-parameterized/:id', () => {
    it('should return HTTP 200 with the resolved id in the body', async () => {
      const res = await http().get('/deprecated-parameterized/42');

      expect(res.status).toBe(200);
      expect(res.body).toStrictEqual({ ok: true, id: '42' });
    });

    it('should have Deprecation header present on parameterised routes', async () => {
      const res = await http().get('/deprecated-parameterized/42');

      expect(res.headers['deprecation']).toMatch(/^@\d+$/);
    });

    it('should increment callCount using the route pattern key and not the concrete URL', async () => {
      const before = findRecord('GET /deprecated-parameterized/:id')?.callCount ?? 0;
      await http().get('/deprecated-parameterized/42');

      expect(findRecord('GET /deprecated-parameterized/:id')?.callCount).toBe(before + 1);
    });
  });

  describe('DeprecationRegistry', () => {
    it('should have callCount for GET /deprecated-full increments after each request', async () => {
      const before = findRecord('GET /deprecated-full')?.callCount ?? 0;
      await http().get('/deprecated-full');

      expect(findRecord('GET /deprecated-full')?.callCount).toBe(before + 1);
    });

    it('should have lastCalledAt for GET /deprecated-full as a Date set within the request window', async () => {
      const wallBefore = new Date();
      await http().get('/deprecated-full');
      const wallAfter = new Date();

      const record = findRecord('GET /deprecated-full');

      expect(record?.lastCalledAt).toBeInstanceOf(Date);
      expect(record?.lastCalledAt?.getTime()).toBeGreaterThanOrEqual(wallBefore.getTime());
      expect(record?.lastCalledAt?.getTime()).toBeLessThanOrEqual(wallAfter.getTime());
    });

    it('should have GET /active with no increment of any registry entry', async () => {
      const countBefore = findRecord('GET /active')?.callCount;
      await http().get('/active');
      const countAfter = findRecord('GET /active')?.callCount;

      expect(countBefore).toBeUndefined();
      expect(countAfter).toBeUndefined();
    });
  });
});
