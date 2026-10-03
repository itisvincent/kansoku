import { Controller, Get, Post } from '@tsuki-hono/common';
import { createPositionsService } from '@kansoku/core/cockpit/positions.service';

@Controller('positions')
export class PositionsController {
  private readonly service = createPositionsService();

  @Get('/')
  async getPositions() {
    const data = await this.service.list();
    return { ok: true, data };
  }

  @Post('/refresh')
  async refreshPositions() {
    const data = await this.service.refresh();
    return { ok: true, data };
  }

  @Get('/plans')
  async getPlans() {
    const data = await this.service.plans();
    return { ok: true, data };
  }
}
