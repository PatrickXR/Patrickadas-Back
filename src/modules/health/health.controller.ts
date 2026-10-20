import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get(['health', 'v1/health'])
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
