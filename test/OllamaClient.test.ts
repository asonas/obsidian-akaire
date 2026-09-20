import { describe, expect, it, vi } from 'vitest';
import { OllamaClient, parseHttpHeaders } from '../src/core/OllamaClient';

describe('parseHttpHeaders', () => {
  it('parses one header per line and preserves colons in values', () => {
    expect(parseHttpHeaders([
      'CF-Access-Client-Id: client-id',
      'CF-Access-Client-Secret: secret:with:colons',
      '',
    ].join('\n'))).toEqual({
      'CF-Access-Client-Id': 'client-id',
      'CF-Access-Client-Secret': 'secret:with:colons',
    });
  });

  it('rejects malformed and duplicate header names', () => {
    expect(() => parseHttpHeaders('invalid')).toThrow('line 1');
    expect(() => parseHttpHeaders('X-Token: first\nx-token: second')).toThrow('duplicated');
  });
});

describe('OllamaClient', () => {
  it('uses configured headers while loading the downloaded model list', async () => {
    const request = vi.fn().mockResolvedValue({
      status: 200,
      json: { models: [{ name: 'qwen3:8b' }, { model: 'gemma3:4b' }, { name: 'qwen3:8b' }] },
      text: '',
    });
    const client = new OllamaClient({
      baseUrl: 'https://ollama.example.com/',
      headers: { 'CF-Access-Client-Id': 'client-id' },
    }, request);

    await expect(client.listModels()).resolves.toEqual(['gemma3:4b', 'qwen3:8b']);
    expect(request).toHaveBeenCalledWith({
      url: 'https://ollama.example.com/api/tags',
      method: 'GET',
      headers: { 'CF-Access-Client-Id': 'client-id' },
      throw: false,
    });
  });

  it('uses configured headers for chat requests', async () => {
    const request = vi.fn().mockResolvedValue({
      status: 200,
      json: { message: { content: 'reply' } },
      text: '',
    });
    const client = new OllamaClient({
      baseUrl: 'http://localhost:11434',
      headers: { Authorization: 'Bearer token' },
    }, request);

    await expect(client.chat({ model: 'qwen3:8b' })).resolves.toBe('reply');
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://localhost:11434/api/chat',
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'content-type': 'application/json',
      },
    }));
  });
});
