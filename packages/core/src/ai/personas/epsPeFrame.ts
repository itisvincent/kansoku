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

/** One line for the analyst's task: the multiples the server will hold for this run. */
export function describeSavedEpsPeFrame(saved: EpsPePlan | null | undefined): string | null {
  const rows = byKind(saved);
  if (!saved || !rows) return null;
  const ladder = KINDS.map((kind) => `${kind} ${rows.get(kind)!.pe}×`).join(', ');
  const year = saved.anchor_year ? ` for ${saved.anchor_year}` : '';
  return `A saved EPS × PE frame exists${year}: ${ladder}. The server keeps these multiples, so write each scenario's rationale, the thesis-break triggers and the band notes for exactly these multiples.`;
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

  // Numbers come from the saved frame; wording comes from this run, which writes in the
  // current interface language (the saved text may be in the language of an older run).
  const scenarios = KINDS.map((kind) => {
    const prior = savedRows.get(kind)!;
    const fresh = incomingRows.get(kind)!;
    const eps = round2(prior.eps * factor);
    const pe = prior.pe;
    return {
      ...prior,
      eps,
      pe,
      target: round2(eps * pe),
      upside_pct: undefined,
      rationale: fresh.rationale ?? prior.rationale,
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
      eps_growth_note: incoming.eps_growth_note ?? saved.eps_growth_note,
      scenarios,
      blended_target:
        saved.blended_target != null ? round2(saved.blended_target * factor) : undefined,
      wall_street_target: incoming.wall_street_target ?? saved.wall_street_target,
      black_swan: saved.black_swan
        ? {
            ...saved.black_swan,
            eps: round2(saved.black_swan.eps * factor),
            target: round2(saved.black_swan.eps * factor * saved.black_swan.pe),
            triggers: incoming.black_swan?.triggers ?? saved.black_swan.triggers,
          }
        : incoming.black_swan,
      digestion: saved.digestion?.map((row) => ({
        ...row,
        eps: round2(row.eps * factor),
        pe: factor === 1 ? row.pe : round2(row.pe / factor),
      })),
      bands: saved.bands?.map((band, i) => {
        // Bands line up by position only when this run produced the same set of bands.
        const fresh = incoming.bands?.length === saved.bands?.length ? incoming.bands?.[i] : undefined;
        return {
          ...band,
          price: round2(band.price * factor),
          label: fresh?.label ?? band.label,
          note: fresh?.note ?? band.note,
        };
      }),
      sources: [note, ...(incoming.sources ?? saved.sources ?? [])],
    },
  };
}
