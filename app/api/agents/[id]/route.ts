import { NextRequest, NextResponse } from 'next/server';
import { getSophiaConnection, saveAgentBackup } from '../../../lib/sophia-connection';

const ID_PATTERN = /^[a-zA-Z0-9_-]{6,100}$/;
const EDITABLE_FIELDS = new Set([
  'name','enabled_channels','initialMessage','systemPrompt','language','voice','ttsProvider','ttsModel',
  'voiceCustomSettings','transcriptionModel','llmProvider','llmModel','llmTemperature','maxTokens',
  'idleMessages','idleTimeout','maxIdleMessages','silenceTimeout','backchannel','backchannelWords',
  'voicemail','voicemailMode','voicemailMessage','analysisPrompt','successEvaluationPrompt',
  'successEvaluationRubric','structuredDataPrompt','dataSchema','serverURL','serverMessages',
]);

function findRecord(payload: unknown, id: string): Record<string, unknown> | null {
  if (Array.isArray(payload)) return payload.find(item => item && typeof item === 'object' && String((item as Record<string, unknown>).id ?? (item as Record<string, unknown>).assistant_id) === id) as Record<string, unknown> || null;
  if (!payload || typeof payload !== 'object') return null;
  const object = payload as Record<string, unknown>;
  if (String(object.id ?? object.assistant_id) === id) return object;
  for (const key of ['data','rows','results','items']) { const found = findRecord(object[key], id); if (found) return found; }
  return null;
}

async function fetchAgent(id: string, baseUrl: string, apiKey: string) {
  const url = new URL(`${baseUrl}/assistants`); url.searchParams.set('id', id);
  const response = await fetch(url, { headers: { 'x-api-key': apiKey, accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(response.status === 404 ? 'No se encontró el agente.' : `SophIA respondió con estado ${response.status}.`);
  return findRecord(await response.json(), id);
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) return NextResponse.json({ error: 'El ID del agente no es válido.' }, { status: 400 });
  const { apiKey, baseUrl } = getSophiaConnection();
  if (!apiKey) return NextResponse.json({ error: 'Configura primero la conexión con SophIA.' }, { status: 503 });
  try {
    const agent = await fetchAgent(id, baseUrl, apiKey);
    if (!agent) return NextResponse.json({ error: 'No se encontró el agente.' }, { status: 404 });
    return NextResponse.json({ agent });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'No fue posible consultar el agente.' }, { status: 502 }); }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) return NextResponse.json({ error: 'El ID del agente no es válido.' }, { status: 400 });
  const { apiKey, baseUrl } = getSophiaConnection();
  if (!apiKey) return NextResponse.json({ error: 'Configura primero la conexión con SophIA.' }, { status: 503 });
  try {
    const input = await request.json() as { changes?: Record<string, unknown> };
    const requested = input.changes && typeof input.changes === 'object' ? input.changes : {};
    const changes = Object.fromEntries(Object.entries(requested).filter(([key]) => EDITABLE_FIELDS.has(key)));
    if (!Object.keys(changes).length) return NextResponse.json({ error: 'No hay cambios editables para publicar.' }, { status: 400 });
    if ('name' in changes && (typeof changes.name !== 'string' || !changes.name.trim())) return NextResponse.json({ error: 'El nombre del agente es obligatorio.' }, { status: 400 });
    if ('llmTemperature' in changes && (typeof changes.llmTemperature !== 'number' || changes.llmTemperature < 0 || changes.llmTemperature > 2)) return NextResponse.json({ error: 'La temperatura debe estar entre 0 y 2.' }, { status: 400 });
    if ('serverURL' in changes && changes.serverURL) { if (typeof changes.serverURL !== 'string') return NextResponse.json({ error: 'La URL del webhook no es válida.' }, { status: 400 }); try { new URL(changes.serverURL); } catch { return NextResponse.json({ error: 'La URL del webhook no es válida.' }, { status: 400 }); } }

    const current = await fetchAgent(id, baseUrl, apiKey);
    if (!current) return NextResponse.json({ error: 'No se encontró el agente.' }, { status: 404 });
    saveAgentBackup(id, current);
    const url = new URL(`${baseUrl}/assistants`); url.searchParams.set('id', id);
    const response = await fetch(url, { method: 'PUT', headers: { 'x-api-key': apiKey, accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify(changes), cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return NextResponse.json({ error: `SophIA rechazó la actualización con estado ${response.status}.` }, { status: 502 });
    const verified = await fetchAgent(id, baseUrl, apiKey);
    if (!verified) return NextResponse.json({ error: 'La actualización respondió correctamente, pero no pudo verificarse.' }, { status: 502 });
    return NextResponse.json({ agent: verified, publishedFields: Object.keys(changes), verifiedAt: new Date().toISOString() });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'No fue posible publicar los cambios.' }, { status: 502 }); }
}
