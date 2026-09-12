import { createRoot } from 'react-dom/client';
import { TrainerLauncher } from './features/training/TrainerLauncher';
import { trackAppOpened } from './lib/analytics';
import './styles.css';
import { LocaleProvider } from './lib/i18n';
import { LocaleBackendSync } from './features/settings/LocaleBackendSync';

trackAppOpened('trainer');
createRoot(document.getElementById('root')!).render(
  <LocaleProvider>
    <LocaleBackendSync />
    <TrainerLauncher />
  </LocaleProvider>,
);
