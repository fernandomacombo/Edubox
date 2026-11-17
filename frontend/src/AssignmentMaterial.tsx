import {useEffect,useRef,useState} from 'react'
import {BookOpen,X} from 'lucide-react'
import {api} from './portalApi'
import MaterialViewer from './MaterialViewer'
import type {Viewer} from './MaterialViewer'

export default function AssignmentMaterial({endpoint,label}:{endpoint:string;label:string}) {
 const [data,setData]=useState<{title:string;viewer:Viewer|null;body?:string;external_only?:boolean}|null>(null)
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const request=useRef(0)
 useEffect(()=>()=>{request.current+=1},[endpoint])
 async function open(){
  if(busy)return
  const seq=++request.current
  setBusy(true);setError('')
  try{const value=await api<{title:string;viewer:Viewer|null;body?:string;external_only?:boolean}>(endpoint);if(seq===request.current)setData(value)}
  catch(e){if(seq===request.current)setError(e instanceof Error?e.message:'Não foi possível abrir o material.')}
  finally{if(seq===request.current)setBusy(false)}
 }
 return <div className="assignment-material">
  {!data&&<button className="portal-light" disabled={busy} onClick={()=>void open()}><BookOpen size={16}/>{busy?'A abrir…':label}</button>}
  {error&&<p role="alert">{error}</p>}
  {data&&<div className="inline-reader"><div className="panel-heading"><strong>{data.title}</strong><button className="portal-light" onClick={()=>setData(null)}><X size={16}/> Fechar material</button></div>
   {data.viewer&&<MaterialViewer viewer={data.viewer} title={data.title}/>}
   {data.body&&<div className="lesson-content">{data.body}</div>}
   {data.external_only&&<p>Este material tem apenas uma ligação externa. Pede à escola uma versão para consulta no EduBox.</p>}
  </div>}
 </div>
}
