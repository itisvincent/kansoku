import { afterEach, describe, expect, it } from 'vitest';
import { createDb } from '../src/db/index.js';
import {
  createInterfaceLocaleStore,
  getInterfaceLocale,
  setActiveInterfaceLocaleStore,
  setInterfaceLocale,
} from '../src/settings/interfaceLocale.js';
import { MessagesEngine } from '../src/ai/conversation/messages/messageEngine.js';
import { composeWithDiscipline } from '../src/ai/runtime/promptPolicy.js';

afterEach(() => setActiveInterfaceLocaleStore(null));

describe('interface language', () => {
  it('persists the selected language and rejects unsupported values', () => {
    const db = createDb(':memory:');
    const store = createInterfaceLocaleStore(db);
    setActiveInterfaceLocaleStore(store);
    expect(getInterfaceLocale()).toBe('en-US');
    setInterfaceLocale('zh-CN');
    expect(createInterfaceLocaleStore(db).get()).toBe('zh-CN');
    expect(() => setInterfaceLocale('fr')).toThrow('Unsupported interface language');
    expect(store.get()).toBe('zh-CN');
    setInterfaceLocale('en-US');
    expect(createInterfaceLocaleStore(db).get()).toBe('en-US');
    db.$client.close();
  });

  it('updates a reused conversation engine without modifying saved messages', async () => {
    let locale: 'en-US' | 'zh-CN' = 'en-US';
    setActiveInterfaceLocaleStore({
      get: () => locale,
      set: (value) => {
        locale = value;
      },
    });
    const engine = new MessagesEngine([]);
    const raw = [{ role: 'user' as const, content: '保留这份原文 AAPL.US', timestamp: 1 }];
    const saved = structuredClone(raw);
    const english = await engine.process(raw);
    expect(JSON.stringify(english.messages[0])).toContain('interface language is English');
    setInterfaceLocale('zh-CN');
    const chinese = await engine.process(raw);
    expect(JSON.stringify(chinese.messages[0])).toContain(
      'interface language is Simplified Chinese',
    );
    expect(raw).toEqual(saved);
    expect(composeWithDiscipline('Default: Chinese', 'Analyze the chart')).toContain(
      'Current interface language: Simplified Chinese',
    );
    await engine.destroy();
  });
});
