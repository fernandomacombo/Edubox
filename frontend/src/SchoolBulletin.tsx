import {useEffect,useState} from 'react'
import {Megaphone,RefreshCw,CalendarDays,School} from 'lucide-react'
import AssignmentMaterial from './AssignmentMaterial'
import type {SchoolProfile,SchoolEvent} from './SchoolAdministration'
import {api} from './portalApi'
export type SchoolNotice={id:number;title:string;body:string;published:boolean;created_at:string;has_document?:boolean;document_name?:string}
export default function SchoolBulletin(){
 const [school,setSchool]=useState<SchoolProfile|null>(null),[events,setEvents]=useState<SchoolEvent[]>([])
 const [items,setItems]=useState<SchoolNotice[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[version,setVersion]=useState(0)
 useEffect(()=>{let alive=true;setLoading(true);void api<{results:SchoolNotice[];school?:SchoolProfile|null;events?:SchoolEvent[]}>('/api/school/bulletin/').then(r=>{if(alive){setItems(r.results);setSchool(r.school||null);setEvents(r.events||[]);setError('')}}).catch(()=>{if(alive)setError('Não foi possível carregar os informes da escola.')}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[version])
 return <section className="container school-bulletin"><div className="learning-banner"><div><span className="section-kicker">A NOSSA COMUNIDADE</span><h1>{school?.name||'A escola informa.'}</h1><p>{school?.motto||'Comunicados oficiais, novidades e datas importantes, num só lugar.'}</p>{school&&<small className="school-location"><School size={15}/>{[school.district,school.province].filter(Boolean).join(' · ')} · Ano lectivo {school.academic_year}</small>}</div><Megaphone size={64}/></div>
  <div className="panel-heading"><h2>Mural da escola</h2><button className="portal-light" disabled={loading} onClick={()=>setVersion(v=>v+1)}><RefreshCw size={16}/> Actualizar informes</button></div>
  {error&&<p role="alert">{error}</p>}{loading?<p role="status">A carregar informes…</p>:items.length?<div className="bulletin-grid">{items.map(n=><article className="portal-panel" key={n.id}><small>Direcção da escola · {new Date(n.created_at).toLocaleDateString('pt-PT')}</small><h2>{n.title}</h2><p className="portal-text">{n.body}</p>{n.has_document&&<AssignmentMaterial endpoint={`/api/school/notices/${n.id}/reader/`} label="Ler documento do informe"/>}</article>)}</div>:!error&&<div className="empty"><Megaphone size={32}/><p>A escola ainda não publicou informes.</p></div>}
 {events.length>0&&<section className="public-calendar"><h2><CalendarDays size={22}/> Agenda da escola</h2><div className="bulletin-grid">{events.map(e=><article className="portal-panel" key={e.id}><small>{new Date(e.date+'T12:00:00').toLocaleDateString('pt-PT')}</small><h3>{e.title}</h3>{e.location&&<b>{e.location}</b>}<p className="portal-text">{e.description}</p></article>)}</div></section>}
  {school&&(school.phone||school.email)&&<p className="school-contact">Contactos da escola: {[school.phone,school.email].filter(Boolean).join(' · ')}</p>}
 </section>
}
