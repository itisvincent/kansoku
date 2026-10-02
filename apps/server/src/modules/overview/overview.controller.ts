import { Body, Controller, Get, Post, Query } from '@tsuki-hono/common';
import { overviewService } from '@kansoku/core/overview/overview.service';

export { resetOverviewCacheForTests } from '@kansoku/core/overview/overview.service';

@Controller('overview')
export class OverviewController {
  @Get('/')
  async getBoard() {
    const data = await overviewService.board();
    return { ok: true, data };
  }

  @Get('/events')
  async getEvents() {
    const data = await overviewService.events();
    return { ok: true, data };
  }

  @Get('/industries')
  async getIndustries() {
    const data = await overviewService.industries();
    return { ok: true, data };
  }

  @Get('/recap')
  async getRecap(@Query() query: { date?: string }) {
    const data = await overviewService.recap({ date: query.date });
    return { ok: true, data };
  }

  @Get('/stats')
  async getStats() {
    const data = await overviewService.stats();
    return { ok: true, data };
  }

  @Get('/scorecard')
  async getScorecard(@Query() query: { days?: string }) {
    const days = query.days ? Number(query.days) : undefined;
    const data = await overviewService.scorecard({ days });
    return { ok: true, data };
  }

  @Post('/scan')
  async startScan(
    @Body() body: { timeframes?: unknown; anchorTf?: unknown; scope?: unknown } | null,
  ) {
    const timeframes = Array.isArray(body?.timeframes)
      ? body.timeframes.filter((tf): tf is string => typeof tf === 'string')
      : undefined;
    const anchorTf = typeof body?.anchorTf === 'string' ? body.anchorTf : undefined;
    const scope = body?.scope === 'positions' ? 'positions' : 'watchlist';
    const data = await overviewService.scanStart({ timeframes, anchorTf, scope });
    return { ok: true, data };
  }

  @Get('/scan')
  async getScan() {
    const data = await overviewService.scanStatus();
    return { ok: true, data };
  }

  @Post('/scan/cancel')
  async cancelScan() {
    const data = await overviewService.scanCancel();
    return { ok: true, data };
  }

  @Get('/usage')
  async getUsage(@Query() query: { date?: string }) {
    const data = await overviewService.usage({ date: query.date });
    return { ok: true, data };
  }

  @Get('/recap-dates')
  async getRecapDates() {
    const data = await overviewService.recapDates();
    return { ok: true, data };
  }
}
