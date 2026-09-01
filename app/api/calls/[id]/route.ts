import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_API_URL = 'https://dashboard.soph-ia.ai/api/v2';
const CALL_ID_PATTERN = /^[a-zA-Z0-9_-]{8,100}$/;
type ErrorCode = 'INVALID_CALL_ID'|'NOT_CONFIGURED'|'UPSTREAM_AUTH'|'UPSTREAM_HTTP'|'NOT_FOUND'|'UPSTREAM_TIMEOUT'|'UPSTREAM_NETWORK'|'INVALID_RESPONSE';

function failure(status:number,code:ErrorCode,message:string,requestId:string,detail?:string){
  return NextResponse.json({error:{code,message,requestId,detail}},{status});
}
function findRecord(payload:unknown,requestedId:string):Record<string,unknown>|null{
  if(Array.isArray(payload))return payload.find(item=>item&&typeof item==='object'&&String((item as Record<string,unknown>).id)===requestedId) as Record<string,unknown>||null;
  if(!payload||typeof payload!=='object')return null;
  const object=payload as Record<string,unknown>;
  if(String(object.id)===requestedId)return object;
  for(const key of ['data','rows','results','items']){const match=findRecord(object[key],requestedId);if(match)return match}
  return null;
}

export async function GET(_request:NextRequest,context:{params:Promise<{id:string}>}){
  const requestId=crypto.randomUUID();
  const {id}=await context.params;
  if(!CALL_ID_PATTERN.test(id))return failure(400,'INVALID_CALL_ID','El ID de llamada no tiene un formato válido.',requestId);
  const apiKey=process.env.SOPHIA_API_KEY;
  if(!apiKey)return failure(503,'NOT_CONFIGURED','La conexión con SophIA no está configurada.',requestId);
  try{
    const baseUrl=(process.env.SOPHIA_API_URL||DEFAULT_API_URL).replace(/\/$/,'');
    const url=new URL(`${baseUrl}/callLogs`);url.searchParams.set('id',id);
    const response=await fetch(url,{headers:{'x-api-key':apiKey,accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(15_000)});
    if(response.status===401||response.status===403)return failure(502,'UPSTREAM_AUTH','SophIA rechazó la API key configurada.',requestId);
    if(!response.ok)return failure(502,'UPSTREAM_HTTP',`SophIA respondió con estado ${response.status}.`,requestId,`HTTP ${response.status}`);
    let payload:unknown;
    try{payload=await response.json()}catch{return failure(502,'INVALID_RESPONSE','SophIA devolvió una respuesta que no es JSON.',requestId)}
    const call=findRecord(payload,id);
    if(!call)return failure(404,'NOT_FOUND','No se encontró una llamada con ese ID.',requestId);
    return NextResponse.json({call,meta:{requestId,source:'SophIA callLogs v2',fetchedAt:new Date().toISOString()}});
  }catch(error){
    const timedOut=error instanceof Error&&(error.name==='TimeoutError'||error.name==='AbortError');
    const detail=error instanceof Error?`${error.name}: ${error.message}`:'Error desconocido';
    console.error(`[trace:${requestId}] SophIA request failed`,error);
    return failure(502,timedOut?'UPSTREAM_TIMEOUT':'UPSTREAM_NETWORK',timedOut?'SophIA tardó demasiado en responder.':'No fue posible conectar con SophIA.',requestId,detail);
  }
}
