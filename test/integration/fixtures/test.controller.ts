import { Controller, Get } from '@nestjs/common';

import { Deprecated } from '../../../src/decorators/deprecated.decorator';

@Controller()
export class TestController {
  @Deprecated({
    deprecatedAt: new Date('2025-01-01'),
    sunset: new Date('2027-01-01'),
    link: '/docs/migration',
  })
  @Get('deprecated-full')
  getDeprecatedFull(): { ok: boolean } {
    return { ok: true };
  }

  @Deprecated()
  @Get('deprecated-minimal')
  getDeprecatedMinimal(): { ok: boolean } {
    return { ok: true };
  }

  @Get('active')
  getActive(): { ok: boolean } {
    return { ok: true };
  }
}
