const DEFAULT_API_URL = 'https://dashboard.soph-ia.ai/api/v2';

type ConnectionState = {
  apiKey?: string;
  validatedAt?: string;
};

const globalState = globalThis as typeof globalThis & { __sophiaConnection?: ConnectionState };

function state() {
  globalState.__sophiaConnection ??= {};
  return globalState.__sophiaConnection;
}

export function getSophiaConnection() {
  const memory = state();
  const apiKey = memory.apiKey || process.env.SOPHIA_API_KEY;
  return {
    apiKey,
    baseUrl: (process.env.SOPHIA_API_URL || DEFAULT_API_URL).replace(/\/$/, ''),
    source: memory.apiKey ? 'memory' : apiKey ? 'environment' : 'none',
    validatedAt: memory.validatedAt,
  } as const;
}

export function saveSophiaApiKey(apiKey: string) {
  state().apiKey = apiKey;
  state().validatedAt = new Date().toISOString();
}

export function clearSophiaApiKey() {
  delete state().apiKey;
  delete state().validatedAt;
}

export function keyHint(apiKey?: string) {
  return apiKey ? `••••${apiKey.slice(-4)}` : null;
}
