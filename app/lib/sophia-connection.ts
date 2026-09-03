const DEFAULT_API_URL = 'https://dashboard.soph-ia.ai/api/v2';

type ConnectionState = {
  apiKey?: string;
  validatedAt?: string;
  backups?: Map<string, { savedAt: string; agent: Record<string, unknown> }>;
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

export function saveAgentBackup(id: string, agent: Record<string, unknown>) {
  const connection = state();
  connection.backups ??= new Map();
  connection.backups.set(id, { savedAt: new Date().toISOString(), agent });
}

export function keyHint(apiKey?: string) {
  return apiKey ? `••••${apiKey.slice(-4)}` : null;
}
