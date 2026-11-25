import { describe, expect, it } from 'vitest';
import en from '../locales/en.json';
import { messagesFor, pickLanguage, pseudo, PSEUDO } from './i18n';

describe('choosing the language', () => {
  it('uses English for any language without a translation yet', () => {
    expect(pickLanguage('en-AU')).toBe('en');
    expect(pickLanguage('fr-FR')).toBe('en');
    expect(pickLanguage(undefined)).toBe('en');
    expect(pickLanguage(PSEUDO)).toBe(PSEUDO);
  });
});

describe('the pseudo-language', () => {
  it('accents and lengthens a message, keeping placeholders and tags', () => {
    const p = pseudo('Open {{name}} and <strong>save</strong>');
    expect(p).toMatch(/^\[.*\]$/);
    expect(p).toContain('{{name}}');
    expect(p).toContain('<strong>');
    expect(p).toContain('</strong>');
    expect(p).not.toMatch(/Open|save/);
    expect(p.length).toBeGreaterThan('Open {{name}} and <strong>save</strong>'.length);
  });

  it('covers every message', () => {
    const flat = (o: unknown): string[] =>
      typeof o === 'string' ? [o] : Object.values(o as object).flatMap(flat);
    const all = flat(messagesFor(PSEUDO));
    expect(all.length).toBe(flat(en).length);
    for (const m of all) expect(m.startsWith('[')).toBe(true);
  });
});

describe('the English messages', () => {
  it('has no empty message', () => {
    const flat = (o: unknown): string[] =>
      typeof o === 'string' ? [o] : Object.values(o as object).flatMap(flat);
    for (const m of flat(en)) expect(m.trim()).not.toBe('');
  });
});
