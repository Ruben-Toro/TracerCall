import { NextRequest, NextResponse } from 'next/server';
import { getSophiaConnection } from '../../../lib/sophia-connection';

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
  const {apiKey,baseUrl}=getSophiaConnection();
  if(!apiKey)return failure(503,'NOT_CONFIGURED','La conexión con SophIA no está configurada.',requestId);
  try{
    const url=new URL(`${baseUrl}/callLogs`);url.searchParams.set('id',id);
    const response=await fetch(url,{headers:{'x-api-key':apiKey,accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(15_000)});
    if(response.status===401||response.status===403)return failure(502,'UPSTREAM_AUTH','SophIA rechazó la API key configurada.',requestId);
    if(!response.ok)return failure(502,'UPSTREAM_HTTP',`SophIA respondió con estado ${response.status}.`,requestId,`HTTP ${response.status}`);
    let payload:unknown;
    try{payload=await response.json()}catch{return failure(502,'INVALID_RESPONSE','SophIA devolvió una respuesta que no es JSON.',requestId)}
    const call=findRecord(payload,id);
    if(!call)return failure(404,'NOT_FOUND','No se encontró una llamada con ese ID.',requestId);
    const assistantId=call.assistant_id;
    if(assistantId){
      try{
        const assistantUrl=new URL(`${baseUrl}/assistants`);assistantUrl.searchParams.set('id',String(assistantId));
        const assistantResponse=await fetch(assistantUrl,{headers:{'x-api-key':apiKey,accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(8_000)});
        if(assistantResponse.ok){const assistantPayload:unknown=await assistantResponse.json();const assistant=findRecord(assistantPayload,String(assistantId));if(assistant)call.assistant_name=assistant.name||assistant.assistant_name||assistant.title}
      }catch(error){console.warn(`[trace:${requestId}] Assistant name lookup failed`,error)}
    }
    const crm:Record<string,unknown>={};
    const lookups:[string,string,unknown][]=[['lead','crm_leads',Array.isArray(call.crm_lead_ids)?call.crm_lead_ids[0]:undefined],['contact','crm_contacts',Array.isArray(call.crm_contact_ids)?call.crm_contact_ids[0]:undefined],['account','crm_accounts',Array.isArray(call.crm_account_ids)?call.crm_account_ids[0]:undefined]];
    await Promise.all(lookups.map(async([label,table,entityId])=>{
      if(entityId===undefined)return;
      try{const entityUrl=new URL(`${baseUrl}/${table}`);entityUrl.searchParams.set('id',String(entityId));const entityResponse=await fetch(entityUrl,{headers:{'x-api-key':apiKey,accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(6_000)});if(entityResponse.ok){const entityPayload:unknown=await entityResponse.json();crm[label]=findRecord(entityPayload,String(entityId))}}
      catch(error){console.warn(`[trace:${requestId}] ${table} lookup failed`,error)}
    }));
    call.crm=crm;
    return NextResponse.json({call,meta:{requestId,source:'SophIA callLogs v2',fetchedAt:new Date().toISOString()}});
  }catch(error){
    const timedOut=error instanceof Error&&(error.name==='TimeoutError'||error.name==='AbortError');
    const detail=error instanceof Error?`${error.name}: ${error.message}`:'Error desconocido';
    console.error(`[trace:${requestId}] SophIA request failed`,error);
    return failure(502,timedOut?'UPSTREAM_TIMEOUT':'UPSTREAM_NETWORK',timedOut?'SophIA tardó demasiado en responder.':'No fue posible conectar con SophIA.',requestId,detail);
  }
}
