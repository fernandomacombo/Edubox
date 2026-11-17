import {useState} from 'react'
import {api} from './portalApi'
type Record={id:number;title:string;class_name:string;answer:string;score:number|null;feedback:string}
export default function StudentHistory(){
 const [items,setItems]=useState<Record[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 async function load(){if(busy)return;if(open){setOpen(false);return}setBusy(true);setError('');try{const r=await api<{results:Record[]}>('/api/portal/history/');setItems(r.results);setOpen(true)}catch{setError('Não foi possível abrir o histórico. Tenta novamente.')}finally{setBusy(false)}}
 return <section className="student-history"><button className="portal-light" disabled={busy} onClick={()=>void load()}>{busy?'A consultar…':open?'Fechar histórico':'Histórico de turmas anteriores'}</button>{error&&<p role="alert">{error}</p>}{open&&<div className="portal-panel"><h2>As minhas entregas anteriores</h2><p>O teu registo permanece guardado após uma transferência. As atividades da turma anterior deixam de estar disponíveis.</p>{items.length?items.map(r=><article key={r.id}><h3>{r.title}</h3><small>{r.class_name} · {r.score===null?'Por avaliar':`${r.score}/20`}</small><p className="portal-text">{r.answer}</p>{r.feedback&&<p>{r.feedback}</p>}</article>):<p>Sem entregas de turmas anteriores.</p>}</div>}</section>
}
