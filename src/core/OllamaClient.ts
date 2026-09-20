type HttpResponse = {
  status: number;
  json: unknown;
  text: string;
};

type RequestFn = (request: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  throw: boolean;
}) => Promise<HttpResponse>;

type OllamaTagsResponse = {
  models?: Array<{ name?: unknown; model?: unknown }>;
};

type OllamaChatResponse = {
  message?: { content?: unknown };
  error?: unknown;
};

export function parseHttpHeaders(input: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const seenNames = new Set<string>();

  for (const [index, rawLine] of input.split('\n').entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator <= 0) {
      throw new Error(`HTTP header line ${index + 1} must use "Name: value"`);
    }
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || !value) {
      throw new Error(`HTTP header line ${index + 1} is invalid`);
    }
    const normalizedName = name.toLowerCase();
    if (seenNames.has(normalizedName)) {
      throw new Error(`HTTP header ${name} is duplicated`);
    }
    seenNames.add(normalizedName);
    headers[name] = value;
  }

  return headers;
}

export class OllamaClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(
    opts: { baseUrl: string; headers?: Record<string, string> },
    private request: RequestFn,
  ) {
    const url = new URL(opts.baseUrl.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Ollama URL must use HTTP or HTTPS');
    }
    if (url.username || url.password) {
      throw new Error('Ollama URL must not contain credentials');
    }
    this.baseUrl = url.toString().replace(/\/$/, '');
    this.headers = opts.headers ?? {};
  }

  async listModels(): Promise<string[]> {
    const response = await this.send('/api/tags', 'GET');
    const body = response.json as OllamaTagsResponse;
    if (!Array.isArray(body.models)) {
      throw new Error('Ollama returned an invalid model list');
    }
    return [...new Set(body.models.flatMap((model) => {
      const name = typeof model.name === 'string' ? model.name : model.model;
      return typeof name === 'string' && name ? [name] : [];
    }))].sort((a, b) => a.localeCompare(b));
  }

  async chat(body: Record<string, unknown>): Promise<string> {
    const response = await this.send('/api/chat', 'POST', JSON.stringify(body));
    const parsed = response.json as OllamaChatResponse;
    if (typeof parsed.error === 'string') throw new Error(parsed.error);
    if (typeof parsed.message?.content !== 'string' || !parsed.message.content) {
      throw new Error('Ollama returned no message');
    }
    return parsed.message.content;
  }

  private async send(path: string, method: string, body?: string): Promise<HttpResponse> {
    const response = await this.request({
      url: `${this.baseUrl}${path}`,
      method,
      headers: {
        ...this.headers,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body } : {}),
      throw: false,
    });
    if (response.status < 200 || response.status >= 300) {
      const detail = response.text.trim().slice(0, 300);
      throw new Error(`Ollama HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    return response;
  }
}
