import { z } from 'zod';
import { BASE_PERIODS } from './model.js';

export const sessionInput = z.object({ sessionId: z.uuid() });
export const basePeriodSchema = z.enum(BASE_PERIODS);
export const reasonSchema = z.object({
  category: z.enum([
    'trend_following',
    'breakout',
    'pullback',
    'mean_reversion',
    'support_resistance',
    'momentum',
    'volume_flow',
    'volatility',
    'news_event',
    'fundamental',
    'risk_management',
    'thesis_invalidated',
    'profit_protection',
    'time_horizon',
    'no_setup',
    'other',
  ]),
  summary: z.string().trim().min(1).max(800),
});
export const sizeSchema = z.number().positive().max(1);
export const priceSchema = z.number().positive();
export const amendSchema = z.object({
  stop: priceSchema.optional(),
  target: priceSchema.optional(),
});
export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hold'),
    bars: z.number().int().min(1).max(20).optional(),
    period: z.enum(['h1', ...BASE_PERIODS, 'day', 'week']).optional(),
    reason: reasonSchema.optional(),
  }),
  amendSchema.extend({ type: z.literal('amend'), reason: reasonSchema }),
  z.object({ type: z.literal('cancel'), reason: reasonSchema }),
  z.object({ type: z.literal('exit_next_open'), reason: reasonSchema }),
  z.object({ type: z.literal('add'), size: sizeSchema, reason: reasonSchema }),
  z.object({ type: z.literal('reduce'), size: sizeSchema.optional(), reason: reasonSchema }),
]);
export const submissionSchema = z.object({
  direction: z.enum(['long', 'short', 'neutral']),
  anchor: z.object({
    timeframe: z.enum(['m5', 'm15', 'h1', 'day']),
    time: z.string(),
    price: priceSchema,
  }),
  entry_plan: z
    .object({
      entry: priceSchema,
      stop: priceSchema,
      target1: priceSchema.optional(),
      target2: priceSchema.optional(),
      target1_pct: z.number().optional(),
      target2_pct: z.number().optional(),
      note: z.string().max(4000).optional(),
      rationale: z.string().max(4000).optional(),
    })
    .optional(),
  // Human tickets intentionally omit the AI runner's scenario forecast.
  scenarios: z
    .array(
      z.object({
        label: z.string(),
        probability: z.number().min(0).max(100),
        trigger: z.string().optional(),
        path: z.string().optional(),
      }),
    )
    .max(4),
  decision_reason: reasonSchema.optional(),
  comment: z.string().max(4000),
});
