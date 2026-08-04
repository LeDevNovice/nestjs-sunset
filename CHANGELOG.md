# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.1] — 2026-08-04

### Fixed

- `DeprecationRegistry` now indexes records by handler function reference
  (`Map<Function, DeprecationRecord>`) instead of a reconstructed route description
  string. The interceptor passes `context.getHandler()` directly to
  `registry.recordCall()`, eliminating the adapter-specific divergence where
  Fastify's `request.url` (e.g. `/users/42`) did not match the boot-time registry
  key (e.g. `GET /users/:id`), causing `callCount` to silently stay at 0 on all
  parameterised routes.

- `buildDeprecationHeaders` previously called `new Date()` on every request when
  `options.deprecatedAt` was absent, producing a different `@<timestamp>` value on
  each response. `DeprecationRegistry` now resolves the effective deprecation date
  once during `onApplicationBootstrap` and stores it as `DeprecationRecord.resolvedDeprecatedAt`.
  The header value is now stable and identical for the lifetime of the process.

- `toIMFFixdate()` was replacing the mandatory `GMT` token with `UTC`
  (`date.toUTCString().replace('GMT', 'UTC')`). RFC 9110 §5.6.7 is explicit:
  the only valid timezone token in an IMF-fixdate is `GMT`. RFC 8594 §2 confirms
  the canonical format: `Sunset: Sat, 31 Dec 2018 23:59:59 GMT`. Strict HTTP parsers
  (CDN, reverse proxies) may reject the former value. The `UTC` example in RFC 9745
  §3 is inconsistent with RFC 9110 and believed to be a documentation error.

### Internal

- `DeprecationInterceptor` no longer depends on `Reflector`. `registry.getRecord()`
  is the sole mechanism for detecting deprecated handlers at request time, replacing
  the redundant `Reflector.getAllAndOverride()` call.
- `DeprecationRecord` gains `resolvedDeprecatedAt: Date` (readonly) — the boot-time
  effective deprecation date used exclusively for `Deprecation` header generation.

## [1.0.0] — 2026-07-22

First public release. Implements RFC 9745 (Deprecation), RFC 8594 (Sunset), and
RFC 8288 (Web Linking) for NestJS REST API endpoints.

### Added

#### Core decorator

- `@Deprecated(options?)` — method decorator that stores RFC deprecation options as
  Reflect metadata on the handler. Accepts `Date | string | number` for dates.
  Calling with no arguments is valid and marks the resource as immediately deprecated.

#### HTTP headers (automatic, zero configuration)

- `Deprecation: @<unix_seconds>` header (RFC 9745 §2.1, Structured Field Date format)
  injected by `DeprecationInterceptor` before the handler executes.
- `Sunset: <IMF-fixdate>` header (RFC 8594 §2) emitted when `sunset` option is provided.
- `Link: <url>; rel="deprecation"; type="text/html"` header (RFC 8288) emitted when
  `link` option is provided. The `deprecation` relation is registered in the IANA link
  relations registry by RFC 9745 §4.

#### NestJS module

- `SunsetModule.forRoot(options?)` — synchronous dynamic module. Registers
  `DeprecationInterceptor` globally via `APP_INTERCEPTOR` and exports
  `DeprecationRegistry`.
- `SunsetModule.forRootAsync(options)` — async variant supporting `useFactory`,
  `useClass`, and `useExisting`. Integrates with `ConfigService`.
- `isGlobal: true` support — makes `DeprecationRegistry` injectable everywhere
  without explicit module imports.

#### Boot-time validation

- `onApplicationBootstrap` scans all registered NestJS controllers for `@Deprecated()`
  metadata, validates date constraints, and throws a single aggregated `Error` listing
  all configuration problems if any `sunset` date is not strictly after `deprecatedAt`
  (RFC 9745 §4). The application refuses to start on invalid configuration.
- Pre-sunset proximity alerts: emits `Logger.warn` at startup when an endpoint's
  sunset date is within the configured threshold (default: 30 days). Configurable via
  `sunsetWarningThresholdDays`.

#### Introspection

- `DeprecationRegistry.getAll()` — returns a `ReadonlyArray<DeprecationRecord>` with
  the route description, decorator options, call count since last restart, and
  timestamp of the last request for every deprecated endpoint.

#### Observability hook

- `onDeprecatedEndpointCalled: (event: DeprecationEvent) => void` — optional hook
  invoked on every request to a deprecated endpoint. Carries the endpoint identifier,
  decorator options, request timestamp, and days until sunset. Use this to forward
  events to Datadog, Prometheus, or custom alerting systems.

#### Optional @nestjs/swagger integration

- `@Deprecated()` automatically sets `deprecated: true` on the corresponding OpenAPI
  operation when `@nestjs/swagger` is present in the project. Detection is silent via
  dynamic `import()` — no configuration required, no errors if the package is absent.

#### Adapter compatibility

- Tested against Express (`@nestjs/platform-express`) and Fastify
  (`@nestjs/platform-fastify`) with identical header output verified by Supertest
  E2E tests.
- Headers are injected before `next.handle()` (not in `tap()`), ensuring compatibility
  with Fastify's asynchronous route registration and response commitment model.

#### Public TypeScript types

- `DeprecatedOptions` — decorator input interface
- `SunsetModuleOptions` — module configuration interface
- `DeprecationEvent` — hook payload interface
- `DeprecationRecord` — registry entry interface

### Technical

- Dual ESM + CJS build via `tsdown` (Rolldown-based). Fully tree-shakeable
  (`"sideEffects": false`).
- Exports map with `import` / `require` / `types` triple for all TypeScript module
  resolution modes (`node10`, `node16`, `bundler`) — validated by `publint` and
  `@arethetypeswrong/cli`.
- Test suite: 162 tests across 11 test files (unit + integration E2E).
- Coverage: 100% statements, functions, and lines; 97.26% branches.
- Zero runtime dependencies. Peer dependencies: `@nestjs/common`, `@nestjs/core`,
  `reflect-metadata`, `rxjs`.

---

[1.0.1]: https://github.com/LeDevNovice/nestjs-sunset/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/LeDevNovice/nestjs-sunset/releases/tag/v1.0.0
