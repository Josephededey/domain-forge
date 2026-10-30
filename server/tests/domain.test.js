import { describe, it, expect } from 'vitest';
import { parseDomainInput, parseTldList } from '../src/validators/domain.js';
import { loadConfig } from '../src/config/env.js';

describe('parseDomainInput', () => {
  it('trims, lowercases and accepts a bare label', () => {
    expect(parseDomainInput('  MyShop ')).toEqual({ ok: true, label: 'myshop', tld: null });
  });
  it('extracts a supported extension', () => {
    expect(parseDomainInput('example.com')).toEqual({ ok: true, label: 'example', tld: 'com' });
    expect(parseDomainInput('shop.com.ng')).toEqual({ ok: true, label: 'shop', tld: 'com.ng' });
  });
  it.each(['', '   ', '-bad', 'bad-', 'a b', 'a/b', 'http://x.com', 'a..com', 'x'.repeat(64), 'ab--cd'])(
    'rejects %j',
    (v) => expect(parseDomainInput(v).ok).toBe(false),
  );
  it('rejects unsupported extensions and subdomains', () => {
    expect(parseDomainInput('example.xyz').ok).toBe(false);
    expect(parseDomainInput('www.example.com').ok).toBe(false);
  });
  it('explicitly rejects internationalised names', () => {
    expect(parseDomainInput('café.com').issue).toMatch(/Internationalised/);
    expect(parseDomainInput('xn--caf-dma.com').ok).toBe(false);
  });
  it('rejects non-strings', () => expect(parseDomainInput(undefined).ok).toBe(false));
});

describe('parseTldList', () => {
  it('normalises and de-duplicates', () => expect(parseTldList('.COM, com,net')).toEqual({ ok: true, tlds: ['com', 'net'] }));
  it('rejects unsupported', () => expect(parseTldList('com,zzz').ok).toBe(false));
});

describe('loadConfig', () => {
  it('requires SESSION_SECRET when DATABASE_URL is set', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://x' })).toThrow(/SESSION_SECRET/);
    expect(loadConfig({ DATABASE_URL: 'postgresql://x', SESSION_SECRET: 'x'.repeat(32) }).SESSION_TTL_HOURS).toBe(168);
  });
  it('derives allowed client origins', () => {
    expect(loadConfig({ CLIENT_URL: 'http://localhost:5173/, http://localhost:4173' }).CLIENT_ORIGINS)
      .toEqual(['http://localhost:5173', 'http://localhost:4173']);
  });
  it('applies defaults', () => expect(loadConfig({}).PORT).toBe(3001));
  it('fails safely without echoing values', () => {
    expect(() => loadConfig({ PORT: 'nope', SESSION_SECRET: 'short-secret' })).toThrow(/PORT, SESSION_SECRET/);
    try { loadConfig({ SESSION_SECRET: 'short-secret' }); } catch (e) { expect(e.message).not.toMatch(/short-secret/); }
  });
});
