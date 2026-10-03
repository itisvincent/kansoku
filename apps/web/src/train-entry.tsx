import { createRoot } from 'react-dom/client';
import { TrainerLauncher } from './features/training/TrainerLauncher';
import { trackAppOpened } from './lib/analytics';
import './styles.css';
import { LocaleProvider } from './lib/i18n';
import { LocaleBackendSync } from './features/settings/LocaleBackendSync';
import { applyThemeMode, followThemeChanges, readThemeMode } from './lib/themeMode';
import { reportThemeToShell } from './features/desktop/desktopWindowsBridge';

// Before the first render, so nothing paints in the wrong palette.
const themeMode = readThemeMode();
applyThemeMode(themeMode);
followThemeChanges(themeMode);
reportThemeToShell(themeMode);

trackAppOpened('trainer');
createRoot(document.getElementById('root')!).render(
  <LocaleProvider>
    <LocaleBackendSync />
    <TrainerLauncher />
  </LocaleProvider>,
);
