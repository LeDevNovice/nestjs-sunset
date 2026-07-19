# Security Policy

## Supported versions

| Version      | Supported              |
| ------------ | ---------------------- |
| 1.x (latest) | ✅ Security updates    |
| < 1.0        | ❌ No longer supported |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

To report a security issue, email **gregory.saison@proton.me** with the subject line:
`[SECURITY] nestjs-sunset - <brief description>`.

Include:

- A description of the vulnerability and its potential impact
- Steps to reproduce (minimal code or curl commands)
- The version of `nestjs-sunset` affected
- Any suggested mitigation if you have one

## Scope

This library emits HTTP response headers. Security-relevant areas include:

- Header injection via `options.link` (unvalidated URLs containing newlines)
- Supply chain: we publish with **npm provenance**. Verify with `npm audit signatures nestjs-sunset`

## Out of scope

- Issues in NestJS, Express, or Fastify themselves
- Vulnerabilities requiring attacker control of the `@Deprecated()` decorator options
  (if an attacker controls your source code, the threat model is already broken)
