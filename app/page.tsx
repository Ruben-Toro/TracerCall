'use client';

import { Activity, AlertTriangle, ArrowRight, BookOpen, Check, ChevronDown, Clock3, Copy, DollarSign, Download, Globe2, Headphones, KeyRound, Phone, Search, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

type TraceEvent = { time: string; title: string; detail: string; kind: 'ok' | 'info' | 'warn'; tag: string; duration?: string };
type CallRecord = Record<string, unknown>;
const pick=(record:CallRecord,...keys:string[])=>{for(const key of keys){const value=record[key];if(value!==undefined&&value!==null&&value!=='')return value}return undefined};
const text=(value:unknown)=>typeof value==='string'?value:value===undefined?'':JSON.stringify(value);
const object=(value:unknown):CallRecord=>value&&typeof value==='object'&&!Array.isArray(value)?value as CallRecord:{};
function formatDuration(seconds:number){const safe=Math.max(0,Math.round(seconds||0));const h=Math.floor(safe/3600);const m=Math.floor((safe%3600)/60);const s=safe%60;return [h,m,s].map(value=>String(value).padStart(2,'0')).join(':')}
function formatDate(value:unknown){
  if(!value)return '—';const date=new Date(String(value));if(Number.isNaN(date.getTime()))return text(value);
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(date);
  const get=(type:string)=>parts.find(part=>part.type===type)?.value||'';
  return `${get('year')}-${get('day')}-${get('month')} ${get('hour')}:${get('minute')}:${get('second')}`;
}
function countryFromPhone(value:unknown){
  if(typeof value!=='string'||!value.trim())return null;
  const phone=parsePhoneNumberFromString(value.trim());if(!phone?.country)return null;
  const name=new Intl.DisplayNames(['es'],{type:'region'}).of(phone.country)||phone.country;
  const flag=phone.country.replace(/./g,char=>String.fromCodePoint(127397+char.charCodeAt(0)));
  return {name,flag,code:`+${phone.countryCallingCode}`};
}
function asArray(value:unknown):CallRecord[]{
  if(typeof value==='string'){try{return asArray(JSON.parse(value))}catch{return []}}
  return Array.isArray(value)?value.filter(item=>item&&typeof item==='object') as CallRecord[]:[];
}
function eventTime(item:CallRecord,index:number){
  const value=pick(item,'timestamp','time','created_at','start_time','startTime','secondsFromStart','start_ts');
  if(typeof value==='number')return `${value.toFixed(2)}s`;
  if(typeof value==='string'){const date=new Date(value);return Number.isNaN(date.getTime())?value.slice(0,12):date.toLocaleTimeString('es-CO',{hour12:false})}
  return `#${index+1}`;
}
function normalizeEvents(call:CallRecord):TraceEvent[]{
  const transcriptJson=object(call.transcript_json);
  let transcript=asArray(transcriptJson.segments);
  if(!transcript.length)transcript=asArray(pick(call,'messages','conversation','turns'));
  if(!transcript.length&&typeof call.transcript==='string')transcript=call.transcript.split('\n').filter(Boolean).map(line=>({role:line.split(':')[0],text:line.slice(line.indexOf(':')+1).trim()}));
  const tools=[...asArray(pick(call,'toolCalls','tool_calls','tools','function_calls')),...asArray(call.mcpCalls)];
  const status=object(call.statusUpdates);const latency=object(call.latency);
  const result:TraceEvent[]=[{time:eventTime({time:pick(call,'call_started_time','created_at','started_at','startTime','start_time')},0),title:'Llamada iniciada',detail:`${text(pick(call,'direction')||'sin dirección')} · ${text(pick(call,'from')||'—')} → ${text(pick(call,'to')||'—')}`,kind:'ok',tag:'TELEPHONY'}];
  transcript.forEach((item,index)=>{const role=text(pick(item,'role','speaker','type')).toLowerCase();const detail=text(pick(item,'content','text','message','transcript','detail'));if(!detail)return;const isEvent=role==='event';result.push({time:eventTime(item,index),title:isEvent?text(pick(item,'label','event_type'))||'Evento':role.includes('user')||role.includes('caller')?'Intervención del contacto':'Respuesta del agente',detail,kind:isEvent?'warn':'info',tag:isEvent?'SYSTEM':role.includes('user')?'CALLER':'AGENT',duration:pick(item,'stt_processing_ms')?`${text(item.stt_processing_ms)} ms`:undefined})});
  tools.forEach((item,index)=>result.push({time:eventTime(item,index),title:`Herramienta: ${text(pick(item,'name','tool_name','function'))||'sin nombre'}`,detail:text(pick(item,'result','response','output','arguments','args'))||'Sin detalle',kind:text(pick(item,'error','status')).toLowerCase().includes('error')?'warn':'ok',tag:'TOOL'}));
  Object.entries(latency).forEach(([name,value])=>{const metric=object(value);if(metric.avg_ms!==undefined)result.push({time:'Métrica',title:`Latencia ${name.replaceAll('_',' ')}`,detail:`Promedio ${text(metric.avg_ms)} ms · p95 ${text(metric.p95_ms)} ms · máximo ${text(metric.max_ms)} ms`,kind:Number(metric.p95_ms)>900?'warn':'info',tag:'LATENCY'})});
  if(call.structuredDataResult)result.push({time:'Resultado',title:'Datos estructurados',detail:text(call.structuredDataResult),kind:'ok',tag:'OUTPUT'});
  result.push({time:eventTime({time:pick(call,'call_ended_time','ended_at','end_time')},result.length),title:'Llamada finalizada',detail:`Motivo: ${text(pick(call,'endedReason','ended_reason','end_reason', 'answer_status')||'sin dato')}`,kind:'ok',tag:'TELEPHONY',duration:status.callDuration?`${Number(status.callDuration).toFixed(2)} s`:text(pick(call,'duration'))||undefined});
  return result;
}
function Logo(){return <div className="brand-mark" aria-hidden="true"><span/><span/><span/></div>}

export default function Home() {
  const [view,setView]=useState<'explorer'|'docs'>('explorer');
  const [callId,setCallId]=useState('');
  const [searchedId,setSearchedId]=useState('Esperando consulta');
  const [loading,setLoading]=useState(false);
  const [traceEvents,setTraceEvents]=useState<TraceEvent[]>([]);
  const [call,setCall]=useState<CallRecord>({});
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [onlyWarnings,setOnlyWarnings]=useState(false);
  const [toast,setToast]=useState('');
  const customVars=object(call.custom_vars);
  const crm=object(call.crm);const crmLead=object(crm.lead);const crmContact=object(crm.contact);const crmAccount=object(crm.account);
  const statusUpdates=object(call.statusUpdates);
  const durationSeconds=Number(statusUpdates.callDuration||0)||(Number(call.duration)>300?Number(call.duration)/1000:Number(call.duration)||0);
  const destinationCountry=countryFromPhone(call.to);
  const filtered=useMemo(()=>traceEvents.filter(e=>`${e.title} ${e.detail} ${e.tag}`.toLowerCase().includes(query.toLowerCase())&&(!onlyWarnings||e.kind==='warn')),[traceEvents,query,onlyWarnings]);
  function notify(message:string){setToast(message);window.setTimeout(()=>setToast(''),1800)}
  function exportReport(){
    if(!Object.keys(call).length){setError('Consulta una llamada antes de exportar.');return}
    const report={callId:searchedId,timezone:'America/Bogota',exportedAt:new Date().toISOString(),summary:{status:pick(call,'status','endedReason','ended_reason'),duration:formatDuration(durationSeconds),cost:pick(call,'cost','total_cost')},timeline:traceEvents,raw:call};
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`traza-${searchedId}.json`;anchor.click();URL.revokeObjectURL(url);notify('Reporte JSON descargado');
  }
  async function scan(e:FormEvent){
    e.preventDefault();if(!callId.trim())return;setLoading(true);setError('');setCall({});setTraceEvents([]);setSearchedId(callId.trim());
    try{const response=await fetch(`/api/calls/${encodeURIComponent(callId.trim())}`,{cache:'no-store'});const payload=await response.json();if(!response.ok){const apiError=payload.error;throw new Error(`${typeof apiError==='object'?apiError.message:apiError||'No fue posible consultar la llamada.'}${apiError?.code?` · ${apiError.code}`:''}${apiError?.requestId?` · Ref. ${apiError.requestId.slice(0,8)}`:''}`)}setCall(payload.call);setTraceEvents(normalizeEvents(payload.call));setSearchedId(callId.trim())}
    catch(err){setError(err instanceof Error?err.message:'No fue posible consultar la llamada.')}
    finally{setLoading(false)}
  }
  if(view==='docs')return <main>
    <header className="topbar"><button className="brand brand-button" onClick={()=>setView('explorer')}><Logo/><span>traza<b>.</b></span></button><nav><button onClick={()=>setView('explorer')}>Explorador</button><button className="active" onClick={()=>setView('docs')}>Documentación</button></nav><div className="header-actions"><div className="avatar">RT</div><button className="user-menu">Rubén Toro <ChevronDown size={15}/></button></div></header>
    <section className="docs-shell">
      <div className="docs-heading"><div className="eyebrow"><span/> DOCUMENTACIÓN</div><h1>Conexión con SophIA</h1><p>Referencia rápida para configurar y consultar llamadas sin exponer credenciales en el navegador.</p></div>
      <div className="docs-grid">
        <article className="docs-card"><div className="docs-icon"><KeyRound size={19}/></div><h2>1. Configura la API key</h2><p>Guarda la clave únicamente en el archivo <code>.env</code> del servidor.</p><pre>{`SOPHIA_API_URL=https://dashboard.soph-ia.ai/api/v2\nSOPHIA_API_KEY=tu_secreto_completo`}</pre></article>
        <article className="docs-card"><div className="docs-icon"><BookOpen size={19}/></div><h2>2. Consulta un call ID</h2><p>La aplicación envía el ID al endpoint interno. El servidor agrega la cabecera privada.</p><pre>{`GET /api/v2/callLogs?id=CALL_ID\nx-api-key: ••••••••••••`}</pre></article>
        <article className="docs-card"><div className="docs-icon"><ShieldCheck size={19}/></div><h2>3. Manejo seguro</h2><p>La clave nunca viaja al navegador. Rota la credencial si se comparte y limita el acceso del servidor.</p><ul><li>No guardar la clave en Git.</li><li>No usar variables <code>NEXT_PUBLIC_*</code>.</li><li>Consultar siempre por ID exacto.</li></ul></article>
      </div>
      <section className="docs-flow"><span>Navegador</span><ArrowRight size={17}/><span>Servidor Traza</span><ArrowRight size={17}/><span>SophIA API v2</span></section>
    </section>
  </main>
  return <main>
    <header className="topbar">
      <button className="brand brand-button" onClick={()=>setView('explorer')}><Logo/><span>traza<b>.</b></span></button>
      <nav><button className="active" onClick={()=>setView('explorer')}>Explorador</button><button onClick={()=>setView('docs')}>Documentación</button></nav>
      <div className="header-actions"><button className="icon-button" aria-label="Actividad"><Activity size={18}/></button><div className="avatar">RT</div><button className="user-menu">Rubén Toro <ChevronDown size={15}/></button></div>
    </header>
    <section className="search-shell" id="explorer">
      <div className="search-copy"><div className="eyebrow"><span/> EXPLORADOR DE LLAMADAS</div><h1>Sigue el rastro de una llamada.</h1><p>Pega el ID y reconstruye cada paso, desde que entra hasta que termina.</p></div>
      <form className="call-search" onSubmit={scan}><label htmlFor="call-id">ID DE LLAMADA</label><div className="input-row"><Search size={19}/><input id="call-id" value={callId} onChange={e=>setCallId(e.target.value)} placeholder="Ej. 6f46d5ab-b8ed-49d4-9d38-0d40ba54b3d3" spellCheck={false}/>{callId&&<button type="button" className="clear" onClick={()=>setCallId('')} aria-label="Limpiar"><X size={17}/></button>}<button className="scan-button" disabled={loading}>{loading?'Barriendo…':'Barrer traza'} <ArrowRight size={17}/></button></div><div className="search-hint"><Clock3 size={14}/> Consulta segura por ID exacto en SophIA</div>{error&&<div className="api-error"><AlertTriangle size={14}/>{error}</div>}</form>
    </section>
    {loading?<section className="loading-state"><div className="spinner"/><h2>Reconstruyendo la llamada…</h2><p>Estamos ordenando cada evento de la traza.</p></section>:
    <section className="workspace">
      <div className="result-heading"><div><div className="result-id"><span className="live-dot"/> {searchedId} <button onClick={()=>{navigator.clipboard?.writeText(searchedId);notify('ID copiado')}} aria-label="Copiar ID"><Copy size={14}/></button></div><h2>Traza de la llamada</h2></div><button className="export-button" onClick={exportReport}><Download size={16}/> Exportar reporte</button></div>
      <div className="metrics-grid">
        <article><span className="metric-icon green"><Check size={17}/></span><div><label>ESTADO</label><strong>{text(pick(call,'status','endedReason','ended_reason'))||'Sin consultar'}</strong></div></article>
        <article><span className="metric-icon orange"><Clock3 size={17}/></span><div><label>DURACIÓN</label><strong>{durationSeconds?formatDuration(durationSeconds):'00:00:00'}</strong></div></article>
        <article><span className="metric-icon blue"><Headphones size={17}/></span><div><label>AGENTE</label><strong>{text(pick(call,'assistant_name','agent_name','assistantId','assistant_id'))||'—'}</strong></div></article>
        <article><span className="metric-icon violet"><Sparkles size={17}/></span><div><label>EVENTOS</label><strong>{traceEvents.length}</strong></div></article>
        <article><span className="metric-icon gold"><DollarSign size={17}/></span><div><label>COSTO</label><strong>{call.cost!==undefined?`$${Number(call.cost).toFixed(4)}`:'—'}</strong></div></article>
        <article><span className="metric-icon teal"><Globe2 size={17}/></span><div><label>PAÍS DESTINO</label><strong>{destinationCountry?`${destinationCountry.flag} ${destinationCountry.name}`:'No identificado'}</strong>{destinationCountry&&<small>{destinationCountry.code}</small>}</div></article>
      </div>
      <div className="content-grid">
        <section className="timeline-card"><div className="card-header"><div><h3>Línea de tiempo</h3><p>{filtered.length} eventos visibles de {traceEvents.length}</p></div><div className="filters"><div className="mini-search"><Search size={15}/><input aria-label="Buscar eventos" placeholder="Buscar evento…" value={query} onChange={e=>setQuery(e.target.value)}/></div><button className={onlyWarnings?'filter-active':''} onClick={()=>setOnlyWarnings(!onlyWarnings)}><AlertTriangle size={15}/> Alertas</button></div></div>
          <div className="timeline">{filtered.map((item,index)=><article className={`event ${item.kind}`} key={item.time}><time>{item.time}</time><div className="event-line"><span className="event-dot">{item.kind==='warn'?'!':<Check size={11}/>}</span>{index<filtered.length-1&&<span className="connector"/>}</div><div className="event-body"><div className="event-title"><strong>{item.title}</strong><span>{item.tag}</span><em>{item.duration}</em></div><p>{item.detail}</p></div></article>)}{filtered.length===0&&<div className="empty">No hay eventos que coincidan con este filtro.</div>}</div>
        </section>
        <aside className="details-column">
          <section className="detail-card"><div className="detail-title"><Phone size={17}/><h3>Detalles de llamada</h3></div><dl><div><dt>Inicio</dt><dd>{formatDate(pick(call,'call_started_time','created_at','started_at','start_time'))}</dd></div><div><dt>Fin</dt><dd>{formatDate(pick(call,'call_ended_time','ended_at','end_time','updated_at'))}</dd></div><div><dt>Zona horaria</dt><dd>America/Bogota · UTC-5</dd></div><div><dt>Agente</dt><dd>{text(pick(call,'assistant_name','agent_name','assistant_id'))||'—'}</dd></div><div><dt>Dirección</dt><dd><span className="inbound">{text(pick(call,'direction','call_direction'))||'—'}</span></dd></div><div><dt>Canal</dt><dd>{text(pick(call,'type','channel','provider'))||'—'}</dd></div><div><dt>Modelo</dt><dd>{text(call.llm_model)||'—'}</dd></div></dl></section>
          <section className="detail-card contact-card"><div className="detail-title"><UserRound size={17}/><h3>Contacto y CRM</h3></div><div className="contact"><div className="contact-avatar">ID</div><div><strong>{text(pick(customVars,'nombre_clientify','first_name','full_name')||pick(crmLead,'name','full_name','first_name')||pick(crmContact,'name','full_name','first_name'))||'Sin nombre'}</strong><span>{text(call.direction)==='outbound'?text(call.to):text(call.from)||'—'}</span></div></div><dl className="contact-meta"><div><dt>Correo</dt><dd>{text(pick(customVars,'correo_clientify','email')||pick(crmLead,'email')||pick(crmContact,'email'))||'—'}</dd></div><div><dt>Lead CRM</dt><dd>{Array.isArray(call.crm_lead_ids)&&call.crm_lead_ids.length?`Sí · ${call.crm_lead_ids.join(', ')}`:'No vinculado'}</dd></div><div><dt>Contacto CRM</dt><dd>{Array.isArray(call.crm_contact_ids)&&call.crm_contact_ids.length?call.crm_contact_ids.join(', '):'—'}</dd></div><div><dt>Cuenta CRM</dt><dd>{Array.isArray(call.crm_account_ids)&&call.crm_account_ids.length?call.crm_account_ids.join(', '):text(pick(crmAccount,'name'))||'—'}</dd></div><div><dt>Etapa actual</dt><dd>{text(pick(call,'lifecycle_stage')||pick(crmLead,'lifecycle_stage','stage'))||'—'}</dd></div><div><dt>Etapa anterior</dt><dd>{text(call.previous_lifecycle_stage)||'—'}</dd></div><div><dt>ID Clientify</dt><dd>{text(customVars.id_clientify)||'—'}</dd></div></dl></section>
          <section className="insight-card"><div className="insight-label"><Sparkles size={15}/> ANÁLISIS SOPHIA</div><p>{text(pick(call,'analysisResult','summary','call_summary'))||'La llamada no contiene análisis.'}</p><div><span>Evaluación</span><strong>{text(pick(call,'successEvalResult','endedReason','answer_status'))||'—'}</strong></div></section>
        </aside>
      </div>
    </section>}
    {toast&&<div className="toast"><Check size={15}/>{toast}</div>}
  </main>
}
