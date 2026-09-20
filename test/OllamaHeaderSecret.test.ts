import { describe, expect, it, vi } from 'vitest';
import { storeOllamaHeadersSecret } from '../src/core/OllamaHeaderSecret';

describe('storeOllamaHeadersSecret', () => {
  it('stores legacy headers in secret storage', () => {
    const setSecret = vi.fn();

    expect(storeOllamaHeadersSecret('Authorization: Bearer token', {
      getSecret: () => null,
      setSecret,
    })).toBe('akaire-ollama-headers');
    expect(setSecret).toHaveBeenCalledWith(
      'akaire-ollama-headers',
      'Authorization: Bearer token',
    );
  });

  it('reuses a matching secret', () => {
    const setSecret = vi.fn();

    expect(storeOllamaHeadersSecret('X-Token: value', {
      getSecret: () => 'X-Token: value',
      setSecret,
    })).toBe('akaire-ollama-headers');
    expect(setSecret).not.toHaveBeenCalled();
  });

  it('does not overwrite a secret with different contents', () => {
    const setSecret = vi.fn();

    expect(storeOllamaHeadersSecret('X-Token: new', {
      getSecret: (id) => id === 'akaire-ollama-headers' ? 'X-Token: existing' : null,
      setSecret,
    })).toBe('akaire-ollama-headers-2');
    expect(setSecret).toHaveBeenCalledWith('akaire-ollama-headers-2', 'X-Token: new');
  });
});
