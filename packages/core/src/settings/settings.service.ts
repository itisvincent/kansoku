import { resolveSubscription } from '../license/subscription.js';
import { clearLongbridgeEndpointCacheForPreferenceChange } from '../marketdata/longbridgeEndpoints.js';
import {
  getActiveLongbridgeRegionStore,
  validateLongbridgeRegionPreference,
} from '../marketdata/longbridgeRegionStore.js';
import {
  getActiveWatchedMarketsStore,
  validateWatchedMarkets,
} from '../marketdata/watchedMarketsStore.js';
import { setCodexSearchEnabled } from '../ai/websearch/codexOptIn.js';
import { webSearchStatus } from '../ai/websearch/index.js';
import { futuStatus, resetFutuCacheForTests } from '../marketdata/futu/futuAccount.js';
import { readFutuSettings, writeFutuSettings } from '../marketdata/futu/futuSettings.js';
import { inWatchedMarkets, watchedMarketsOrDefault } from '../marketdata/futu/withFutu.js';

const countWatched = (symbols: string[]) =>
  inWatchedMarkets(symbols, watchedMarketsOrDefault()).length;
import type { SettingsApi } from '../contract/settings.js';
import { aiSettingsService } from './aiSettings.service.js';
import { settingsDeps } from './settings.deps.js';
import { xaiLogin } from './xaiLogin.js';
import { ClientError } from '../platform/errors.js';
import { getInterfaceLocale, setInterfaceLocale } from './interfaceLocale.js';

export const settingsService: SettingsApi = {
  async getInterfaceLocale() {
    return { locale: getInterfaceLocale() };
  },
  async putInterfaceLocale(input) {
    return { locale: setInterfaceLocale(input.locale) };
  },
  async startXaiLogin() {
    const { models, credentials } = settingsDeps();
    const oauth = models.getProvider('xai')?.auth.oauth;
    if (!oauth) throw new ClientError('xAI OAuth is unavailable in this build.');
    if (credentials.getBaseUrl('xai')) {
      throw new ClientError(
        'Reset the xAI Base URL to the official endpoint before using subscription sign-in.',
      );
    }
    return xaiLogin.start(oauth, credentials);
  },
  async pollXaiLogin(input) {
    return xaiLogin.poll(input.sessionId);
  },
  async cancelXaiLogin(input) {
    xaiLogin.cancel(input.sessionId);
    return { cancelled: true };
  },
  getAi() {
    return aiSettingsService.getAi();
  },
  putRole(input) {
    return aiSettingsService.putRole(input);
  },
  deleteRole(input) {
    return aiSettingsService.deleteRole(input);
  },
  putCredential(input) {
    return aiSettingsService.putCredential(input);
  },
  putProviderBaseUrl(input) {
    return aiSettingsService.putProviderBaseUrl(input);
  },
  deleteCredential(input) {
    return aiSettingsService.deleteCredential(input);
  },
  getCatalog() {
    return aiSettingsService.getCatalog();
  },
  testConnection(input) {
    return aiSettingsService.testConnection(input);
  },
  getUsageToday() {
    return aiSettingsService.getUsageToday();
  },
  resetCredentials() {
    return aiSettingsService.resetCredentials();
  },

  async getWatchedMarkets() {
    return { markets: getActiveWatchedMarketsStore().get() };
  },

  async putWatchedMarkets(input) {
    const store = getActiveWatchedMarketsStore();
    store.set(validateWatchedMarkets(input.markets));
    return { markets: store.get() };
  },

  async getFutu() {
    const settings = readFutuSettings();
    return { settings, status: await futuStatus(settings, countWatched) };
  },

  async putFutu(input) {
    const current = readFutuSettings();
    const settings = writeFutuSettings({
      enabled: input.enabled ?? current.enabled,
      watchlist: input.watchlist ?? current.watchlist,
      candles: input.candles ?? current.candles,
      host: input.host ?? current.host,
      port: input.port ?? current.port,
    });
    resetFutuCacheForTests();
    return { settings, status: await futuStatus(settings, countWatched) };
  },

  async getWebSearch() {
    return webSearchStatus();
  },

  async putWebSearchCodex(input) {
    setCodexSearchEnabled(input.enabled === true);
    return webSearchStatus();
  },

  async getLongbridgeRegion() {
    return { region: getActiveLongbridgeRegionStore().get() };
  },

  async putLongbridgeRegion(input) {
    const store = getActiveLongbridgeRegionStore();
    store.set(validateLongbridgeRegionPreference(input.region));
    clearLongbridgeEndpointCacheForPreferenceChange();
    return { region: store.get() };
  },

  async getSubscribeUrl() {
    const subscription = resolveSubscription();
    return {
      subscribeUrl: subscription.url,
      priceLabel: subscription.priceLabel,
      listPriceLabel: subscription.listPriceLabel,
      discountLabel: subscription.discountLabel,
      trialDays: subscription.trialDays,
      yearly: {
        subscribeUrl: subscription.yearly.url,
        priceLabel: subscription.yearly.priceLabel,
        listPriceLabel: subscription.yearly.listPriceLabel,
        discountLabel: subscription.yearly.discountLabel,
        trialDays: subscription.yearly.trialDays,
        savingsLabel: subscription.yearly.savingsLabel,
      },
    };
  },
};
