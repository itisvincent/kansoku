import * as stylex from '@stylexjs/stylex';
import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { GlobalNotifications } from '../notifications/GlobalNotifications';
import { symbolFromRoute } from '../../lib/symbol';
import { CommandPalette } from '../palette/CommandPalette';
import { RestrictedBanner } from '../edition/RestrictedBanner';
import { ContextMenuHost, ModalHost } from '../../ui';
import { clearActiveSymbol, setActiveSymbol } from '../cockpit/analystRunsStore';
import { DesktopTitlebar } from './DesktopTitlebar';
import { LinkHoverStatus } from './LinkHoverStatus';
import { useTabsController } from './tabsController';

const styles = stylex.create({
  content: {
    paddingTop: '40px',
  },
});

const SINGLE_PAGE_ROUTES = new Set(['/scan', '/scorecard']);

export function DesktopShell() {
  const controller = useTabsController();
  const activeRoute = controller.activeTab.route;
  const activeSymbol = symbolFromRoute(activeRoute);

  useEffect(() => {
    setActiveSymbol(activeSymbol);
  }, [activeSymbol]);

  useEffect(() => clearActiveSymbol, []);

  // Scan and Scorecard are single pages: reuse an open tab instead of stacking duplicates.
  const openFromPalette = (route: string) => {
    const existing = SINGLE_PAGE_ROUTES.has(route)
      ? controller.snapshot.tabs.find((tab) => tab.route === route)
      : undefined;
    if (existing) controller.activateTab(existing.id);
    else controller.openTab(route);
  };

  return (
    <>
      <DesktopTitlebar controller={controller} />
      <GlobalNotifications route={controller.activeTab.route} />
      <div
        className={`desktop-content ${stylex.props(styles.content).className}`}
        key={controller.activeTab.id}
      >
        <RestrictedBanner />
        <RouterProvider router={controller.activeRouter} />
      </div>
      <CommandPalette onOpenRoute={openFromPalette} />
      <LinkHoverStatus />
      <ModalHost />
      <ContextMenuHost />
    </>
  );
}
