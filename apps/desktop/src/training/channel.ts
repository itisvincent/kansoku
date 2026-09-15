import type { ProChannel } from '@kansoku/pro-api';
import { getLocalTrainer } from './instance.js';

export const localTrainingFillChannel: ProChannel = {
  kind: 'training-fill',
  parse: () => ({}),
  attach: (_message, push) =>
    getLocalTrainer().fill.subscribe((state) => {
      // Send the flags too, including suspension after a failed data fetch.
      push(JSON.stringify({ type: 'init', state }));
    }),
};
