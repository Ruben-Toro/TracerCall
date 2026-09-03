import { NextResponse } from 'next/server';
import { getSophiaConnection } from '../../lib/sophia-connection';

function records(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(item => item && typeof item === 'object') as Record<string, unknown>[];
  if (!payload || typeof payload !== 'object') return [];
  const object = payload as Record<string, unknown>;
  for (const key of ['data', 'rows', 'results', 'items']) {
    const found = records(object[key]);
    if (found.length) return found;
  }
  return [];
}

export async function GET() {
  const { apiKey, baseUrl } = getSophiaConnection();
  if (!apiKey) return NextResponse.json({ error: 'Configura primero la conexión con SophIA.' }, { status: 503 });
  try {
    const response = await fetch(`${baseUrl}/assistants`, { headers: { 'x-api-key': apiKey, accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (response.status === 401 || response.status === 403) return NextResponse.json({ error: 'SophIA rechazó la API key configurada.' }, { status: 502 });
    if (!response.ok) return NextResponse.json({ error: `SophIA respondió con estado ${response.status}.` }, { status: 502 });
    const payload: unknown = await response.json();
    return NextResponse.json({ agents: records(payload), fetchedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'SophIA tardó demasiado en responder.' : 'No fue posible conectar con SophIA.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
