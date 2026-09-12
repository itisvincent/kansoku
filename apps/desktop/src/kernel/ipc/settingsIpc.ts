import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import type { SettingsApi } from '@kansoku/core/contract/index';
import { settingsService } from '@kansoku/core/settings/settings.service';
import { toEnvelope, type WrapEnvelope } from './envelope.js';

export class SettingsIpc extends IpcService implements WrapEnvelope<SettingsApi> {
  static readonly groupName = 'settings';

  @IpcMethod()
  getInterfaceLocale() {
    return toEnvelope('settings.getInterfaceLocale', () => settingsService.getInterfaceLocale());
  }

  @IpcMethod()
  putInterfaceLocale(input: Parameters<SettingsApi['putInterfaceLocale']>[0]) {
    return toEnvelope('settings.putInterfaceLocale', () =>
      settingsService.putInterfaceLocale(input),
    );
  }

  @IpcMethod()
  startXaiLogin() {
    return toEnvelope('settings.startXaiLogin', () => settingsService.startXaiLogin());
  }

  @IpcMethod()
  pollXaiLogin(input: Parameters<SettingsApi['pollXaiLogin']>[0]) {
    return toEnvelope('settings.pollXaiLogin', () => settingsService.pollXaiLogin(input));
  }

  @IpcMethod()
  cancelXaiLogin(input: Parameters<SettingsApi['cancelXaiLogin']>[0]) {
    return toEnvelope('settings.cancelXaiLogin', () => settingsService.cancelXaiLogin(input));
  }

  @IpcMethod()
  getAi() {
    return toEnvelope('settings.getAi', () => settingsService.getAi());
  }

  @IpcMethod()
  putRole(input: Parameters<SettingsApi['putRole']>[0]) {
    return toEnvelope('settings.putRole', () => settingsService.putRole(input));
  }

  @IpcMethod()
  deleteRole(input: Parameters<SettingsApi['deleteRole']>[0]) {
    return toEnvelope('settings.deleteRole', () => settingsService.deleteRole(input));
  }

  @IpcMethod()
  putCredential(input: Parameters<SettingsApi['putCredential']>[0]) {
    return toEnvelope('settings.putCredential', () => settingsService.putCredential(input));
  }

  @IpcMethod()
  putProviderBaseUrl(input: Parameters<SettingsApi['putProviderBaseUrl']>[0]) {
    return toEnvelope('settings.putProviderBaseUrl', () =>
      settingsService.putProviderBaseUrl(input),
    );
  }

  @IpcMethod()
  deleteCredential(input: Parameters<SettingsApi['deleteCredential']>[0]) {
    return toEnvelope('settings.deleteCredential', () => settingsService.deleteCredential(input));
  }

  @IpcMethod()
  getCatalog() {
    return toEnvelope('settings.getCatalog', () => settingsService.getCatalog());
  }

  @IpcMethod()
  testConnection(input: Parameters<SettingsApi['testConnection']>[0]) {
    return toEnvelope('settings.testConnection', () => settingsService.testConnection(input));
  }

  @IpcMethod()
  getUsageToday() {
    return toEnvelope('settings.getUsageToday', () => settingsService.getUsageToday());
  }

  @IpcMethod()
  resetCredentials() {
    return toEnvelope('settings.resetCredentials', () => settingsService.resetCredentials());
  }

  @IpcMethod()
  getWatchedMarkets() {
    return toEnvelope('settings.getWatchedMarkets', () => settingsService.getWatchedMarkets());
  }

  @IpcMethod()
  putWatchedMarkets(input: Parameters<SettingsApi['putWatchedMarkets']>[0]) {
    return toEnvelope('settings.putWatchedMarkets', () => settingsService.putWatchedMarkets(input));
  }

  @IpcMethod()
  getWebSearch() {
    return toEnvelope('settings.getWebSearch', () => settingsService.getWebSearch());
  }

  @IpcMethod()
  putWebSearchCodex(input: Parameters<SettingsApi['putWebSearchCodex']>[0]) {
    return toEnvelope('settings.putWebSearchCodex', () => settingsService.putWebSearchCodex(input));
  }

  @IpcMethod()
  getLongbridgeRegion() {
    return toEnvelope('settings.getLongbridgeRegion', () => settingsService.getLongbridgeRegion());
  }

  @IpcMethod()
  putLongbridgeRegion(input: Parameters<SettingsApi['putLongbridgeRegion']>[0]) {
    return toEnvelope('settings.putLongbridgeRegion', () =>
      settingsService.putLongbridgeRegion(input),
    );
  }

  @IpcMethod()
  getSubscribeUrl() {
    return toEnvelope('settings.getSubscribeUrl', () => settingsService.getSubscribeUrl());
  }
}
