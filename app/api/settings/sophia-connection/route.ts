import { NextRequest, NextResponse } from 'next/server';
import { clearSophiaApiKey, getSophiaConnection, keyHint, saveSophiaApiKey } from '../../../lib/sophia-connection';

async function validate(apiKey: string, baseUrl: string) {
  const url = new URL(`${baseUrl}/assistants`);
  const response = await fetch(url, {
    headers: { 'x-api-key': apiKey, accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 401 || response.status === 403) throw new Error('SophIA rechazó la API key.');
  if (!response.ok) throw new Error(`SophIA respondió con estado ${response.status}.`);
}

export async function GET() {
  const connection = getSophiaConnection();
  return NextResponse.json({
    configured: Boolean(connection.apiKey),
    connected: Boolean(connection.validatedAt || connection.source === 'environment'),
    keyHint: keyHint(connection.apiKey),
    source: connection.source,
    validatedAt: connection.validatedAt || null,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { apiKey?: unknown };
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    if (apiKey.length < 12) return NextResponse.json({ error: 'La API key no tiene un formato válido.' }, { status: 400 });
    const { baseUrl } = getSophiaConnection();
    await validate(apiKey, baseUrl);
    saveSophiaApiKey(apiKey);
    return NextResponse.json({ configured: true, connected: true, keyHint: keyHint(apiKey), source: 'memory', validatedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'SophIA tardó demasiado en responder.' : error instanceof Error ? error.message : 'No fue posible validar la conexión.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE() {
  clearSophiaApiKey();
  const fallback = getSophiaConnection();
  return NextResponse.json({ configured: Boolean(fallback.apiKey), connected: fallback.source === 'environment', keyHint: keyHint(fallback.apiKey), source: fallback.source, validatedAt: null });
}
