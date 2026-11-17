import {useEffect,useState} from 'react'
import {Megaphone,RefreshCw} from 'lucide-react'
import {api} from './portalApi'
export type SchoolNotice={id:number;title:string;body:string;published:boolean;created_at:string}
export default function SchoolBulletin(){
 const [items,setItems]=useState<SchoolNotice[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[version,setVersion]=useState(0)
 useEffect(()=>{let alive=true;setLoading(true);void api<{results:SchoolNotice[]}>('/api/school/bulletin/').then(r=>{if(alive){setItems(r.results);setError('')}}).catch(()=>{if(alive)setError('Não foi possível carregar os informes da escola.')}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[version])
 return <section className="container school-bulletin"><div className="learning-banner"><div><span className="section-kicker">A NOSSA COMUNIDADE</span><h1>A escola informa.</h1><p>Comunicados oficiais, novidades e datas importantes, num só lugar.</p></div><Megaphone size={64}/></div>
  <div className="panel-heading"><h2>Mural da escola</h2><button className="portal-light" disabled={loading} onClick={()=>setVersion(v=>v+1)}><RefreshCw size={16}/> Actualizar informes</button></div>
  {error&&<p role="alert">{error}</p>}{loading?<p role="status">A carregar informes…</p>:items.length?<div className="bulletin-grid">{items.map(n=><article className="portal-panel" key={n.id}><small>Direcção da escola · {new Date(n.created_at).toLocaleDateString('pt-PT')}</small><h2>{n.title}</h2><p className="portal-text">{n.body}</p></article>)}</div>:!error&&<div className="empty"><Megaphone size={32}/><p>A escola ainda não publicou informes.</p></div>}
 </section>
}
