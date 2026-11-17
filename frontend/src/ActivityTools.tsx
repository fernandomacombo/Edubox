import {useRef,useState} from 'react'
import type {FormEvent} from 'react'
import {api} from './portalApi'
import type {Person} from './portalApi'
import SaveFeedback from './SaveFeedback'
export type WorkGroup={id:number;name:string;members:Person[]}
export type Activity={id:number;kind?:string;kind_label?:string;correction?:string;correction_published?:boolean;accepting_submissions?:boolean;groups?:WorkGroup[]}
export const activityKinds=[['exercise','Exercício'],['group','Trabalho em grupo'],['assessment','Avaliação']]
export default function ActivityTools({activity,students,username,onSaved}:{activity:Activity;students:Person[];username:string;onSaved:()=>Promise<void>}){
 const [kind,setKind]=useState(activity.kind||'exercise')
 const [correction,setCorrection]=useState(activity.correction||'')
 const [published,setPublished]=useState(!!activity.correction_published)
 const [accepting,setAccepting]=useState(activity.accepting_submissions!==false)
 const [name,setName]=useState('')
 const [members,setMembers]=useState<string[]>([])
 const [busy,setBusy]=useState(false),[success,setSuccess]=useState(''),[error,setError]=useState('')
 const lock=useRef(false)
 async function save(e:FormEvent,group=false){
  e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');setSuccess('')
  try{
   await api(`/api/portal/assignments/${activity.id}/${group?'groups':'settings'}/`,group?{name,members}:{kind,correction,correction_published:published,accepting_submissions:accepting},username,'teacher')
   if(group){setName('');setMembers([])}
   setSuccess(group?'Grupo criado. Uma entrega contará para todos os membros.':'Alterações da actividade guardadas.')
   try{await onSaved()}catch{setError('As alterações foram guardadas, mas a lista não actualizou. Actualiza a página.')}
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível guardar.')}
  finally{lock.current=false;setBusy(false)}
 }
 const available=students.filter(s=>!activity.groups?.some(g=>g.members.some(m=>m.username===s.username)))
 return <details className="activity-tools"><summary>Gerir actividade, grupos e correcção</summary>
  <SaveFeedback busy={busy} success={success} error={error}/>
  <form className="school-form" onSubmit={e=>void save(e)}><fieldset disabled={busy}>
   <label>Tipo de actividade<select value={kind} onChange={e=>setKind(e.target.value)}>{activityKinds.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
   <label className="check-label"><input type="checkbox" checked={accepting} onChange={e=>{setAccepting(e.target.checked);if(e.target.checked)setPublished(false)}}/> Aceitar entregas</label>
   <label>Resolução para a turma<textarea rows={5} maxLength={12000} value={correction} onChange={e=>setCorrection(e.target.value)} placeholder="Explica as respostas e os passos para resolver a actividade."/></label>
   <label className="check-label"><input type="checkbox" disabled={accepting} checked={published} onChange={e=>setPublished(e.target.checked)}/> Publicar a correcção para esta turma</label>
   <p className="portal-hint">Guarda a resolução em rascunho. Para a publicar, encerra as entregas e avalia todas as respostas recebidas. A resolução só fica visível nesta turma.</p>
   <button className="btn btn-primary">{busy?'A guardar…':'Guardar actividade'}</button>
  </fieldset></form>
  {activity.kind==='group'&&<section className="work-groups"><h3>Grupos de trabalho</h3><p>Uma pessoa entrega pelo grupo. A resposta e a nota ficam registadas para todos os membros inscritos.</p>
   {(activity.groups||[]).map(g=><p key={g.id}><b>{g.name}</b> · {g.members.map(m=>m.name).join(', ')}</p>)}
   <form onSubmit={e=>void save(e,true)}><fieldset disabled={busy||activity.accepting_submissions===false}>
    <label>Nome do grupo<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>
    <div className="member-picker" role="group" aria-label="Membros do grupo">{available.map(s=><label className="check-label" key={s.username}><input type="checkbox" checked={members.includes(s.username)} onChange={e=>setMembers(old=>e.target.checked?[...old,s.username]:old.filter(x=>x!==s.username))}/>{s.name} (@{s.username})</label>)}</div>
    {available.length<2&&<p>São necessários pelo menos dois alunos ainda sem grupo.</p>}
    <button className="portal-light" disabled={members.length<2}>{busy?'A guardar…':'Criar grupo'}</button>
   </fieldset></form>
  </section>}
 </details>
}
