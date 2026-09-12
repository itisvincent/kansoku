import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { trackAppOpened } from './lib/analytics';
import { persistOptions, queryClient } from './lib/queryClient';
import { installRouter } from './lib/router';
import './styles.css';
import { LocaleProvider } from './lib/i18n';
import { LocaleBackendSync } from './features/settings/LocaleBackendSync';

installRouter();
// At module scope rather than in an effect: this counts page loads, and React would double-fire
// it in development's strict mode.
trackAppOpened('main');
createRoot(document.getElementById('root')!).render(
  <LocaleProvider>
    <LocaleBackendSync />
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <App />
    </PersistQueryClientProvider>
  </LocaleProvider>,
);
