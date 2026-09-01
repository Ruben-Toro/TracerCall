'use client';

import { Activity, AlertTriangle, ArrowRight, Check, ChevronDown, Clock3, Copy, Download, Headphones, Phone, Search, Sparkles, UserRound, X } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';

type TraceEvent = { time: string; title: string; detail: string; kind: 'ok' | 'info' | 'warn'; tag: string; duration?: string };
const events: TraceEvent[] = [
  { time:'14:32:04.120', title:'Llamada recibida', detail:'Canal de voz entrante aceptado desde +57 300 *** 4821.', kind:'ok', tag:'TELEPHONY', duration:'42 ms' },
  { time:'14:32:04.421', title:'Sesión inicializada', detail:'Se creó el contexto de conversación y se cargó el perfil del contacto.', kind:'ok', tag:'ORCHESTRATOR', duration:'301 ms' },
  { time:'14:32:05.038', title:'Agente asignado', detail:'Sophia SDR · Campaña: Renovaciones Q3 · Estrategia v2.4', kind:'info', tag:'ROUTING', duration:'617 ms' },
  { time:'14:32:05.884', title:'Audio conectado', detail:'Stream bidireccional establecido. Codec PCMU · 8 kHz.', kind:'ok', tag:'MEDIA', duration:'846 ms' },
  { time:'14:32:08.210', title:'Primera respuesta generada', detail:'“Hola, soy Sophia. ¿Hablo con Andrés?” · Modelo: voice-agent-prod', kind:'info', tag:'LLM', duration:'1.28 s' },
  { time:'14:32:18.672', title:'Latencia elevada detectada', detail:'El tiempo de respuesta superó el umbral objetivo de 900 ms.', kind:'warn', tag:'LATENCY', duration:'1.74 s' },
  { time:'14:33:27.904', title:'Intención identificada', detail:'El contacto desea conocer las condiciones de renovación.', kind:'ok', tag:'NLU', duration:'224 ms' },
  { time:'14:35:16.330', title:'Llamada finalizada', detail:'Cierre normal iniciado por el contacto. Resultado: seguimiento.', kind:'ok', tag:'TELEPHONY', duration:'2m 12s' },
];
function Logo(){return <div className="brand-mark" aria-hidden="true"><span/><span/><span/></div>}

export default function Home() {
  const [callId,setCallId]=useState('call_01JZ8XK4TQ9P6W3M7A2B');
  const [searchedId,setSearchedId]=useState(callId);
  const [loading,setLoading]=useState(false);
  const [query,setQuery]=useState('');
  const [onlyWarnings,setOnlyWarnings]=useState(false);
  const [toast,setToast]=useState('');
  const filtered=useMemo(()=>events.filter(e=>`${e.title} ${e.detail} ${e.tag}`.toLowerCase().includes(query.toLowerCase())&&(!onlyWarnings||e.kind==='warn')),[query,onlyWarnings]);
  function notify(message:string){setToast(message);window.setTimeout(()=>setToast(''),1800)}
  function scan(e:FormEvent){e.preventDefault();if(!callId.trim())return;setLoading(true);window.setTimeout(()=>{setSearchedId(callId.trim());setLoading(false)},850)}
  return <main>
    <header className="topbar">
      <a className="brand" href="#"><Logo/><span>traza<b>.</b></span></a>
      <nav><a className="active" href="#explorer">Explorador</a><a href="#history">Historial</a><a href="#docs">Documentación</a></nav>
      <div className="header-actions"><button className="icon-button" aria-label="Actividad"><Activity size={18}/></button><div className="avatar">RT</div><button className="user-menu">Rubén Toro <ChevronDown size={15}/></button></div>
    </header>
    <section className="search-shell" id="explorer">
      <div className="search-copy"><div className="eyebrow"><span/> EXPLORADOR DE LLAMADAS</div><h1>Sigue el rastro de una llamada.</h1><p>Pega el ID y reconstruye cada paso, desde que entra hasta que termina.</p></div>
      <form className="call-search" onSubmit={scan}><label htmlFor="call-id">ID DE LLAMADA</label><div className="input-row"><Search size={19}/><input id="call-id" value={callId} onChange={e=>setCallId(e.target.value)} placeholder="Ej. call_01JZ8XK4..." spellCheck={false}/>{callId&&<button type="button" className="clear" onClick={()=>setCallId('')} aria-label="Limpiar"><X size={17}/></button>}<button className="scan-button" disabled={loading}>{loading?'Barriendo…':'Barrer traza'} <ArrowRight size={17}/></button></div><div className="search-hint"><Clock3 size={14}/> Última consulta hace 3 minutos</div></form>
    </section>
    {loading?<section className="loading-state"><div className="spinner"/><h2>Reconstruyendo la llamada…</h2><p>Estamos ordenando cada evento de la traza.</p></section>:
    <section className="workspace">
      <div className="result-heading"><div><div className="result-id"><span className="live-dot"/> {searchedId} <button onClick={()=>{navigator.clipboard?.writeText(searchedId);notify('ID copiado')}} aria-label="Copiar ID"><Copy size={14}/></button></div><h2>Traza de la llamada</h2></div><button className="export-button" onClick={()=>notify('Reporte preparado')}><Download size={16}/> Exportar reporte</button></div>
      <div className="metrics-grid">
        <article><span className="metric-icon green"><Check size={17}/></span><div><label>ESTADO</label><strong>Completada</strong></div></article>
        <article><span className="metric-icon orange"><Clock3 size={17}/></span><div><label>DURACIÓN</label><strong>2m 12s</strong></div></article>
        <article><span className="metric-icon blue"><Headphones size={17}/></span><div><label>AGENTE</label><strong>Sophia SDR</strong></div></article>
        <article><span className="metric-icon violet"><Sparkles size={17}/></span><div><label>EVENTOS</label><strong>24</strong></div></article>
      </div>
      <div className="content-grid">
        <section className="timeline-card"><div className="card-header"><div><h3>Línea de tiempo</h3><p>{filtered.length} eventos visibles de 24</p></div><div className="filters"><div className="mini-search"><Search size={15}/><input aria-label="Buscar eventos" placeholder="Buscar evento…" value={query} onChange={e=>setQuery(e.target.value)}/></div><button className={onlyWarnings?'filter-active':''} onClick={()=>setOnlyWarnings(!onlyWarnings)}><AlertTriangle size={15}/> Alertas</button></div></div>
          <div className="timeline">{filtered.map((item,index)=><article className={`event ${item.kind}`} key={item.time}><time>{item.time}</time><div className="event-line"><span className="event-dot">{item.kind==='warn'?'!':<Check size={11}/>}</span>{index<filtered.length-1&&<span className="connector"/>}</div><div className="event-body"><div className="event-title"><strong>{item.title}</strong><span>{item.tag}</span><em>{item.duration}</em></div><p>{item.detail}</p></div></article>)}{filtered.length===0&&<div className="empty">No hay eventos que coincidan con este filtro.</div>}</div>
        </section>
        <aside className="details-column">
          <section className="detail-card"><div className="detail-title"><Phone size={17}/><h3>Detalles de llamada</h3></div><dl><div><dt>Inicio</dt><dd>12 ago 2026, 14:32</dd></div><div><dt>Fin</dt><dd>12 ago 2026, 14:35</dd></div><div><dt>Dirección</dt><dd><span className="inbound">↘ Entrante</span></dd></div><div><dt>Canal</dt><dd>Voz · Twilio</dd></div><div><dt>Campaña</dt><dd>Renovaciones Q3</dd></div></dl></section>
          <section className="detail-card contact-card"><div className="detail-title"><UserRound size={17}/><h3>Contacto</h3></div><div className="contact"><div className="contact-avatar">AM</div><div><strong>Andrés Martínez</strong><span>+57 300 *** 4821</span></div></div><button>Ver perfil del contacto <ArrowRight size={14}/></button></section>
          <section className="insight-card"><div className="insight-label"><Sparkles size={15}/> RESUMEN IA</div><p>El contacto mostró interés en renovar, pero solicitó recibir las condiciones por correo antes de decidir.</p><div><span>Resultado</span><strong>Seguimiento requerido</strong></div></section>
        </aside>
      </div>
    </section>}
    {toast&&<div className="toast"><Check size={15}/>{toast}</div>}
  </main>
}
