'use client';

import { AlertTriangle, ArrowLeft, Check, ChevronDown, Save } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type RecordValue = Record<string, unknown>;
type Field = { key:string; label:string; group:string; type:'text'|'textarea'|'number'|'boolean'|'json'; hint?:string };

const FIELDS:Field[] = [
  {key:'name',label:'Nombre del agente',group:'Identidad',type:'text'},
  {key:'initialMessage',label:'Mensaje inicial',group:'Identidad',type:'textarea'},
  {key:'systemPrompt',label:'System prompt',group:'Identidad',type:'textarea'},
  {key:'language',label:'Idioma',group:'Voz y modelos',type:'text',hint:'Ej. es-419'},
  {key:'voice',label:'ID de voz',group:'Voz y modelos',type:'number'},
  {key:'ttsProvider',label:'Proveedor TTS',group:'Voz y modelos',type:'number'},
  {key:'ttsModel',label:'Modelo TTS',group:'Voz y modelos',type:'text'},
  {key:'transcriptionModel',label:'Modelo de transcripción',group:'Voz y modelos',type:'text'},
  {key:'llmProvider',label:'Proveedor LLM',group:'Voz y modelos',type:'number'},
  {key:'llmModel',label:'Modelo LLM',group:'Voz y modelos',type:'number'},
  {key:'llmTemperature',label:'Temperatura',group:'Voz y modelos',type:'number',hint:'Entre 0 y 2'},
  {key:'maxTokens',label:'Máximo de tokens',group:'Voz y modelos',type:'number'},
  {key:'backchannel',label:'Confirmaciones breves',group:'Conversación',type:'boolean'},
  {key:'backchannelWords',label:'Palabras de confirmación',group:'Conversación',type:'json',hint:'Arreglo JSON'},
  {key:'idleTimeout',label:'Tiempo antes del mensaje',group:'Conversación',type:'number'},
  {key:'idleMessages',label:'Mensajes de inactividad',group:'Conversación',type:'json',hint:'Arreglo JSON'},
  {key:'maxIdleMessages',label:'Máximo de mensajes',group:'Conversación',type:'number'},
  {key:'silenceTimeout',label:'Tiempo máximo de silencio',group:'Conversación',type:'number'},
  {key:'voicemail',label:'Buzón habilitado',group:'Buzón',type:'boolean'},
  {key:'voicemailMode',label:'Modo de buzón',group:'Buzón',type:'text'},
  {key:'voicemailMessage',label:'Mensaje de buzón',group:'Buzón',type:'textarea'},
  {key:'analysisPrompt',label:'Instrucciones de análisis',group:'Postproceso',type:'textarea'},
  {key:'successEvaluationPrompt',label:'Evaluación de éxito',group:'Postproceso',type:'textarea'},
  {key:'successEvaluationRubric',label:'Rúbrica',group:'Postproceso',type:'textarea'},
  {key:'structuredDataPrompt',label:'Extracción estructurada',group:'Postproceso',type:'textarea'},
  {key:'dataSchema',label:'Esquema de datos',group:'Postproceso',type:'json',hint:'Arreglo JSON'},
  {key:'serverURL',label:'URL del webhook',group:'Webhook',type:'text'},
  {key:'serverMessages',label:'Eventos enviados',group:'Webhook',type:'json',hint:'Arreglo JSON'},
  {key:'enabled_channels',label:'Canales habilitados',group:'Webhook',type:'json',hint:'Arreglo JSON'},
];

function display(value:unknown,type:Field['type']){if(value===undefined||value===null)return '';if(type==='json')return JSON.stringify(value,null,2);return typeof value==='string'||typeof value==='number'||typeof value==='boolean'?String(value):JSON.stringify(value)}
function parse(value:string,type:Field['type']){if(type==='boolean')return value==='true';if(type==='number')return value===''?null:Number(value);if(type==='json')return value.trim()?JSON.parse(value):[];return value}

export default function AgentEditor({id,onBack}:{id:string;onBack:()=>void}){
  const [original,setOriginal]=useState<RecordValue|null>(null);const [values,setValues]=useState<Record<string,string>>({});const [loading,setLoading]=useState(true);const [publishing,setPublishing]=useState(false);const [error,setError]=useState('');const [success,setSuccess]=useState('');const [openGroups,setOpenGroups]=useState<Record<string,boolean>>({Identidad:true,'Voz y modelos':true,Conversación:true,Buzón:true,Postproceso:true,Webhook:true});
  async function load(){setLoading(true);setError('');try{const response=await fetch(`/api/agents/${encodeURIComponent(id)}`,{cache:'no-store'});const payload=await response.json() as {error?:string;agent?:RecordValue};if(!response.ok||!payload.agent)throw new Error(payload.error||'No fue posible cargar el agente.');const agent=payload.agent;setOriginal(agent);setValues(Object.fromEntries(FIELDS.map(field=>[field.key,display(agent[field.key],field.type)])))}catch(err){setError(err instanceof Error?err.message:'No fue posible cargar el agente.')}finally{setLoading(false)}}
  useEffect(()=>{load()},[id]);
  const result=useMemo(()=>{const changes:RecordValue={};const invalid:string[]=[];if(!original)return {changes,invalid};for(const field of FIELDS){try{const next=parse(values[field.key]??'',field.type);const before=original[field.key]??(field.type==='json'?[]:field.type==='boolean'?false:field.type==='number'?null:'');if(JSON.stringify(next)!==JSON.stringify(before))changes[field.key]=next}catch{invalid.push(field.label)}}return {changes,invalid}},[original,values]);
  const changedKeys=Object.keys(result.changes);
  async function publish(e:FormEvent){e.preventDefault();setError('');setSuccess('');if(result.invalid.length){setError(`Corrige el formato JSON de: ${result.invalid.join(', ')}.`);return}if(!changedKeys.length)return;if(!window.confirm(`Se publicarán ${changedKeys.length} cambios en SophIA para este agente. ¿Deseas continuar?`))return;setPublishing(true);try{const response=await fetch(`/api/agents/${encodeURIComponent(id)}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({changes:result.changes})});const payload=await response.json() as {error?:string;publishedFields?:string[];agent?:RecordValue};if(!response.ok||!payload.agent)throw new Error(payload.error||'No fue posible publicar.');setSuccess(`Actualización verificada: ${payload.publishedFields?.length||0} campos publicados.`);const agent=payload.agent;setOriginal(agent);setValues(Object.fromEntries(FIELDS.map(field=>[field.key,display(agent[field.key],field.type)])))}catch(err){setError(err instanceof Error?err.message:'No fue posible publicar.')}finally{setPublishing(false)}}
  if(loading)return <section className="editor-loading"><div className="spinner"/><p>Cargando configuración completa…</p></section>;
  return <section className="agent-editor"><button className="back-button" onClick={onBack}><ArrowLeft size={15}/> Volver a agentes</button><div className="editor-heading"><div><div className="eyebrow"><span/> EDICIÓN CONTROLADA</div><h1>{typeof original?.name==='string'?original.name:'Agente'}</h1><p>{id}</p></div><div className="change-counter"><strong>{changedKeys.length}</strong><span>cambios</span></div></div>{error&&<div className="api-error"><AlertTriangle size={14}/>{error}</div>}{success&&<div className="publish-success"><Check size={15}/>{success}</div>}
    <form onSubmit={publish}><div className="editor-layout"><div className="editor-fields">{Object.keys(openGroups).map(group=><section className="field-group" key={group}><button type="button" className="group-heading" onClick={()=>setOpenGroups(current=>({...current,[group]:!current[group]}))}><span>{group}</span><em>{FIELDS.filter(field=>field.group===group).length} parámetros</em><ChevronDown size={16}/></button>{openGroups[group]&&<div className="fields-grid">{FIELDS.filter(field=>field.group===group).map(field=><label className={field.type==='textarea'||field.type==='json'?'wide':''} key={field.key}><span>{field.label}<code>{field.key}</code></span>{field.type==='textarea'||field.type==='json'?<textarea rows={field.key==='systemPrompt'?12:field.type==='json'?5:3} value={values[field.key]??''} onChange={e=>setValues(current=>({...current,[field.key]:e.target.value}))}/>:field.type==='boolean'?<select value={values[field.key]??'false'} onChange={e=>setValues(current=>({...current,[field.key]:e.target.value}))}><option value="true">Sí</option><option value="false">No</option></select>:<input type={field.type==='number'?'number':'text'} step="any" value={values[field.key]??''} onChange={e=>setValues(current=>({...current,[field.key]:e.target.value}))}/>} {field.hint&&<small>{field.hint}</small>}</label>)}</div>}</section>)}</div>
      <aside className="changes-panel"><h2>Comparación</h2><p>Solo se enviarán los campos modificados.</p>{result.invalid.length>0&&<div className="invalid-note"><AlertTriangle size={14}/> JSON pendiente de corregir</div>}<div className="changes-list">{changedKeys.length?changedKeys.map(key=><div key={key}><strong>{FIELDS.find(field=>field.key===key)?.label||key}</strong><span>{key}</span></div>):<div className="no-changes"><Check size={18}/>Sin cambios pendientes</div>}</div><button className="publish-button" disabled={publishing||!changedKeys.length||result.invalid.length>0}><Save size={15}/>{publishing?'Publicando y verificando…':'Publicar cambios'}</button><small>Se guarda un respaldo temporal antes de escribir y luego se relee el agente.</small></aside></div></form>
  </section>
}
