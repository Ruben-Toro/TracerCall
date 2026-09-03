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

function valueAt(payload: unknown, ...paths: string[][]) {
  for (const path of paths) {
    let value: unknown = payload;
    for (const key of path) value = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function agentKey(agent: Record<string, unknown>) {
  const value = agent.id ?? agent.assistant_id ?? agent.uuid;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export async function GET() {
  const { apiKey, baseUrl } = getSophiaConnection();
  if (!apiKey) return NextResponse.json({ error: 'Configura primero la conexión con SophIA.' }, { status: 503 });
  try {
    const agents = new Map<string, Record<string, unknown>>();
    const pageSize = 100;
    const maxPages = 100;
    let pagesFetched = 0;
    let expectedTotal: number | null = null;

    for (let page = 1; page <= maxPages; page += 1) {
      const url = new URL(`${baseUrl}/assistants`);
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', String(pageSize));
      const response = await fetch(url, { headers: { 'x-api-key': apiKey, accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      if (response.status === 401 || response.status === 403) return NextResponse.json({ error: 'SophIA rechazó la API key configurada.' }, { status: 502 });
      if (!response.ok) return NextResponse.json({ error: `SophIA respondió con estado ${response.status} al consultar la página ${page}.` }, { status: 502 });

      const payload: unknown = await response.json();
      const pageAgents = records(payload);
      pagesFetched += 1;
      const totalValue = valueAt(payload, ['total'], ['count'], ['meta', 'total'], ['pagination', 'total'], ['data', 'total']);
      const parsedTotal = Number(totalValue);
      if (Number.isFinite(parsedTotal) && parsedTotal >= 0) expectedTotal = parsedTotal;

      let newAgents = 0;
      for (const agent of pageAgents) {
        const key = agentKey(agent) || `page-${page}-row-${agents.size}`;
        if (!agents.has(key)) newAgents += 1;
        agents.set(key, agent);
      }

      const hasNext = valueAt(payload, ['hasNext'], ['has_more'], ['hasMore'], ['meta', 'hasNext'], ['pagination', 'hasNext'], ['pagination', 'has_more']);
      const nextPage = valueAt(payload, ['nextPage'], ['next_page'], ['meta', 'nextPage'], ['pagination', 'nextPage'], ['pagination', 'next_page']);
      const totalPagesValue = valueAt(payload, ['totalPages'], ['total_pages'], ['meta', 'totalPages'], ['pagination', 'totalPages'], ['pagination', 'total_pages']);
      const totalPages = Number(totalPagesValue);

      if (!pageAgents.length || !newAgents) break;
      if (expectedTotal !== null && agents.size >= expectedTotal) break;
      if (Number.isFinite(totalPages) && page >= totalPages) break;
      if (hasNext === false || nextPage === null) break;
    }

    return NextResponse.json({ agents: [...agents.values()], pagination: { pagesFetched, total: agents.size, expectedTotal }, fetchedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'SophIA tardó demasiado en responder.' : 'No fue posible conectar con SophIA.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
