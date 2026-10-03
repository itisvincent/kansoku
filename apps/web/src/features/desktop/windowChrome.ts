/**
 * The desktop windows draw their own title bar. macOS puts the traffic lights at the left of
 * it; Windows and Linux put their window buttons over its right end and have no menu bar.
 */
export function isMacPlatform(
  nav: Pick<Navigator, 'platform' | 'userAgent'> | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator,
): boolean {
  if (!nav) return false;
  return /mac|iphone|ipad|ipod/i.test(nav.platform || nav.userAgent);
}
