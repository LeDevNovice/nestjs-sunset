# nestjs-sunset

> RFC-compliant API deprecation lifecycle for NestJS.
> One decorator. Three standards. Zero configuration.

[![npm version](https://img.shields.io/npm/v/nestjs-sunset.svg)](https://www.npmjs.com/package/nestjs-sunset)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://img.shields.io/github/actions/workflow/status/LeDevNovice/nestjs-sunset/ci.yml?label=CI)](https://github.com/LeDevNovice/nestjs-sunset/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/codecov/c/github/LeDevNovice/nestjs-sunset)](https://codecov.io/gh/LeDevNovice/nestjs-sunset)

---

## The problem

Deprecating a NestJS endpoint today means three disconnected annotations, a Unix timestamp you compute by hand, and zero visibility into who is still calling the old route.

```typescript
// Before — fragile, incomplete, non-standard
@Get('v1/users')
@ApiOperation({ deprecated: true })       // ← Swagger only, runtime gets nothing
@Header('Deprecation', '@1688169599')     // ← timestamp you computed manually
async listUsersLegacy() { ... }
//                                        ← No Sunset header
//                                        ← No Link to migration docs
//                                        ← No pre-sunset alert at startup
//                                        ← No call counter to know who migrated
```

```typescript
// After — one decorator, three RFC headers, automated everything
@Deprecated({
  deprecatedAt: '2025-06-01',
  sunset:       '2026-01-01',
  link:         '/docs/migration/v2-users',
})
@Get('v1/users')
async listUsersLegacy() { ... }
```

Every response from `/v1/users` now carries:

```http
HTTP/1.1 200 OK
Deprecation: @1748736000
Sunset: Wed, 01 Jan 2026 00:00:00 UTC
Link: </docs/migration/v2-users>; rel="deprecation"; type="text/html"
```

---

## Quick Start

**1. Install**

```bash
npm install nestjs-sunset
```

**2. Import the module**

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { SunsetModule } from 'nestjs-sunset';

@Module({
  imports: [SunsetModule.forRoot({ isGlobal: true })],
})
export class AppModule {}
```

**3. Decorate your endpoint**

```typescript
import { Controller, Get } from '@nestjs/common';
import { Deprecated } from 'nestjs-sunset';

@Controller('v1')
export class UsersController {
  @Deprecated({
    deprecatedAt: '2025-01-01',
    sunset: '2026-01-01',
    link: '/docs/migration/v2-users',
    message: 'Migrate to GET /v2/users — supports cursor-based pagination.',
  })
  @Get('users')
  listUsers() {
    return [];
  }
}
```

That's it. `Deprecation`, `Sunset`, and `Link` headers are injected into every response automatically. No middleware, no filters, no further configuration.

> **Zero-arg usage** — `@Deprecated()` works with no options. The `Deprecation` header will reflect the current deployment time. Add `sunset` and `link` when you know them.

---

## Standards

nestjs-sunset implements three IETF standards and emits no custom or proprietary headers.

| Standard                                           | Header emitted | Format                     | Purpose                                        |
| -------------------------------------------------- | -------------- | -------------------------- | ---------------------------------------------- |
| [RFC 9745](https://www.rfc-editor.org/rfc/rfc9745) | `Deprecation`  | `@<unix_seconds>`          | Signals when the resource was deprecated       |
| [RFC 8594](https://www.rfc-editor.org/rfc/rfc8594) | `Sunset`       | IMF-fixdate                | Signals when the resource will stop responding |
| [RFC 8288](https://www.rfc-editor.org/rfc/rfc8288) | `Link`         | `<url>; rel="deprecation"` | Links to the migration documentation           |

The `Deprecation` and `Sunset` headers use intentionally different date formats — an asymmetry documented in RFC 9745 §3 ("for historical reasons"). nestjs-sunset handles both formats transparently; you supply a `Date`, a string, or a number and the correct format is computed automatically.

---

## Options

### `@Deprecated(options?)`

All options are optional. Calling `@Deprecated()` with no arguments is valid.

| Option         | Type                       | Default      | Emits                                                           |
| -------------- | -------------------------- | ------------ | --------------------------------------------------------------- |
| `deprecatedAt` | `Date \| string \| number` | `Date.now()` | `Deprecation: @<unix_seconds>` (RFC 9745)                       |
| `sunset`       | `Date \| string \| number` | —            | `Sunset: <IMF-fixdate>` (RFC 8594)                              |
| `link`         | `string`                   | —            | `Link: <url>; rel="deprecation"; type="text/html"` (RFC 8288)   |
| `message`      | `string`                   | —            | Structured log entry only — **never emitted as an HTTP header** |

**Input flexibility** — `deprecatedAt` and `sunset` accept all three forms:

```typescript
@Deprecated({ deprecatedAt: new Date('2025-01-01') })          // Date object
@Deprecated({ deprecatedAt: '2025-01-01' })                    // ISO 8601 string
@Deprecated({ deprecatedAt: 1735689600000 })                   // Unix ms number
```

**Validation at startup** — If `sunset` is not strictly after `deprecatedAt`, the application refuses to start with an actionable error message that cites RFC 9745 §4 and names the endpoint.

---

## Module configuration

### `SunsetModule.forRoot(options?)`

```typescript
SunsetModule.forRoot({
  isGlobal: true, // register as NestJS global module (recommended)
  logLevel: 'warn', // log level for deprecated-endpoint calls
  sunsetWarningThresholdDays: 60, // warn at startup if sunset is within N days
  onDeprecatedEndpointCalled: (event) => {
    metrics.increment('api.deprecated', { endpoint: event.endpoint });
  },
});
```

| Option                       | Type                                | Default  | Description                                                                                                        |
| ---------------------------- | ----------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `isGlobal`                   | `boolean`                           | `false`  | Register as a global NestJS module — `DeprecationRegistry` becomes injectable everywhere without explicit imports. |
| `logLevel`                   | `LogLevel`                          | `'warn'` | NestJS log level for structured log entries on each deprecated request.                                            |
| `sunsetWarningThresholdDays` | `number`                            | `30`     | Emit a startup warning when an endpoint's sunset date is within this many days.                                    |
| `onDeprecatedEndpointCalled` | `(event: DeprecationEvent) => void` | —        | Hook called on every request to a deprecated endpoint. Useful for Datadog, Prometheus, or Slack alerts.            |

### `SunsetModule.forRootAsync(options)`

Use this when module options come from a `ConfigService` or another async provider:

```typescript
SunsetModule.forRootAsync({
  isGlobal: true,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    sunsetWarningThresholdDays: config.get<number>('SUNSET_WARNING_DAYS', 30),
    onDeprecatedEndpointCalled: (event) => {
      // event.endpoint        → "GET /v1/users"
      // event.daysUntilSunset → 42  (null if no sunset configured)
      // event.timestamp       → Date of the request
      // event.options         → the full @Deprecated() options
    },
  }),
});
```

---

## Introspection

`DeprecationRegistry` tracks every deprecated endpoint registered at startup and counts calls in memory since the last restart. Inject it anywhere in your application:

```typescript
import { Injectable } from '@nestjs/common';
import { DeprecationRegistry } from 'nestjs-sunset';

@Injectable()
export class MonitoringService {
  constructor(private readonly registry: DeprecationRegistry) {}

  getSummary() {
    return this.registry.getAll();
    // ReadonlyArray<{
    //   routeDescription: string    // "GET /v1/users"
    //   options:          DeprecatedOptions
    //   callCount:        number    // requests since last restart
    //   lastCalledAt:     Date | null
    // }>
  }
}
```

> `DeprecationRegistry` is available without explicit import when `isGlobal: true` is set on `SunsetModule.forRoot()`.

---

## Compatibility

|             | NestJS 10 | NestJS 11 |
| ----------- | --------- | --------- |
| **Express** | ✅        | ✅        |
| **Fastify** | ✅        | ✅        |

**Node.js** — Requires Node.js ≥ 20.0.0.

**`@nestjs/swagger`** — Optional. When `@nestjs/swagger` is present in your project, `@Deprecated()` automatically sets `deprecated: true` on the corresponding OpenAPI operation. No configuration needed — the detection is automatic via a silent dynamic import.

**Peer dependencies** — `@nestjs/common`, `@nestjs/core`, `reflect-metadata`, `rxjs`. No additional runtime dependencies.

---

## License

MIT — see [LICENSE](./LICENSE).
