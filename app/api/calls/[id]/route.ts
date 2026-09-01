import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_API_URL = 'https://dashboard.soph-ia.ai/api/v2';
const CALL_ID_PATTERN = /^[a-zA-Z0-9_-]{8,100}$/;

function firstRecord(payload: unknown): Record<string, unknown> | null {
  if (Array.isArray(payload)) return (payload[0] as Record<string, unknown>) ?? null;
  if (!payload || typeof payload !== 'object') return null;
  const object = payload as Record<string, unknown>;
  for (const key of ['data', 'rows', 'results', 'items']) {
    const value = object[key];
    if (Array.isArray(value)) return (value[0] as Record<string, unknown>) ?? null;
    if (value && typeof value === 'object') return value as Record<string, unknown>;
  }
  return object;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!CALL_ID_PATTERN.test(id)) {
    return NextResponse.json({ error: 'El ID de llamada no tiene un formato válido.' }, { status: 400 });
  }

  const apiKey = process.env.SOPHIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'La conexión con SophIA no está configurada.' }, { status: 503 });
  }

  const baseUrl = (process.env.SOPHIA_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
  const url = new URL(`${baseUrl}/callLogs`);
  url.searchParams.set('id', id);

  try {
    const response = await fetch(url, {
      headers: { 'x-api-key': apiKey, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 401 || response.status === 403) {
      return NextResponse.json({ error: 'SophIA rechazó la API key configurada.' }, { status: 502 });
    }
    if (!response.ok) {
      return NextResponse.json({ error: `SophIA respondió con estado ${response.status}.` }, { status: 502 });
    }
    const payload: unknown = await response.json();
    const call = firstRecord(payload);
    if (!call || Object.keys(call).length === 0) {
      return NextResponse.json({ error: 'No se encontró una llamada con ese ID.' }, { status: 404 });
    }
    return NextResponse.json({ call });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return NextResponse.json({ error: timedOut ? 'SophIA tardó demasiado en responder.' : 'No fue posible conectar con SophIA.' }, { status: 502 });
  }
}
