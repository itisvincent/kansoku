import type { EpsPePlan, EpsPeScenario } from '@kansoku/shared/types';

/** Smaller than this is treated as the model shopping a slightly different consensus print. */
export const EPS_MOVE_THRESHOLD = 0.02;

const KINDS = ['bear', 'base', 'bull'] as const;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function byKind(plan: EpsPePlan | null | undefined): Map<EpsPeScenario['kind'], EpsPeScenario> | null {
  if (!plan?.scenarios?.length) return null;
  const map = new Map<EpsPeScenario['kind'], EpsPeScenario>();
  for (const row of plan.scenarios) {
    if (!KINDS.includes(row.kind)) continue;
    if (!Number.isFinite(row.eps) || !Number.isFinite(row.pe) || row.eps <= 0 || row.pe <= 0) continue;
    map.set(row.kind, row);
  }
  return KINDS.every((kind) => map.has(kind)) ? map : null;
}

export interface LockedEpsPeFrame {
  plan: EpsPePlan;
  held: boolean;
  /** Signed earnings change applied to every scenario. Null when the frame was not held. */
  earningsMovePct: number | null;
  note: string | null;
}

/**
 * A later run may not invent a new PE ladder. Multiples stay on the saved frame.
 * Targets move only when consensus (bear) EPS moved past the noise threshold, and then
 * every scenario moves by that same percent.
 */
export function applySavedEpsPeFrame(
  saved: EpsPePlan | null | undefined,
  incoming: EpsPePlan,
): LockedEpsPeFrame {
  const savedRows = byKind(saved);
  const incomingRows = byKind(incoming);
  if (!saved || !savedRows || !incomingRows) {
    return { plan: incoming, held: false, earningsMovePct: null, note: null };
  }

  const savedBear = savedRows.get('bear')!.eps;
  const incomingBear = incomingRows.get('bear')!.eps;
  const rawMove = incomingBear / savedBear - 1;
  const earningsMove = Math.abs(rawMove) > EPS_MOVE_THRESHOLD ? rawMove : 0;
  const factor = 1 + earningsMove;

  const scenarios = KINDS.map((kind) => {
    const prior = savedRows.get(kind)!;
    const eps = round2(prior.eps * factor);
    const pe = prior.pe;
    return {
      ...prior,
      eps,
      pe,
      target: round2(eps * pe),
      upside_pct: undefined,
    };
  });

  const peLabel = scenarios.map((row) => `${row.pe}×`).join(' / ');
  const note =
    earningsMove === 0
      ? `Saved frame held multiples at ${peLabel}. Earnings were unchanged, so targets were not rebuilt.`
      : `Saved frame held multiples at ${peLabel}. Consensus earnings moved ${(earningsMove * 100).toFixed(1)}%, so all three targets were scaled by that amount.`;

  return {
    held: true,
    earningsMovePct: earningsMove === 0 ? 0 : round2(earningsMove * 100),
    note,
    plan: {
      ...saved,
      anchor_year: saved.anchor_year ?? incoming.anchor_year,
      scenarios,
      blended_target:
        saved.blended_target != null ? round2(saved.blended_target * factor) : undefined,
      wall_street_target: incoming.wall_street_target ?? saved.wall_street_target,
      black_swan: saved.black_swan
        ? {
            ...saved.black_swan,
            eps: round2(saved.black_swan.eps * factor),
            target: round2(saved.black_swan.eps * factor * saved.black_swan.pe),
          }
        : incoming.black_swan,
      digestion: saved.digestion?.map((row) => ({
        ...row,
        eps: round2(row.eps * factor),
        pe: factor === 1 ? row.pe : round2(row.pe / factor),
      })),
      bands: saved.bands?.map((band) => ({ ...band, price: round2(band.price * factor) })),
      sources: [note, ...(saved.sources ?? [])],
    },
  };
}
