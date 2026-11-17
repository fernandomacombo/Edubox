import {useEffect,useRef,useState} from 'react'
import type {FormEvent} from 'react'
import {BookOpen,Megaphone,Users,ArrowRightLeft,School,LayoutDashboard,CalendarDays,ClipboardCheck,GraduationCap,Plus,ExternalLink} from 'lucide-react'
import {api} from './portalApi'
import type {Person} from './portalApi'
import type {SchoolNotice} from './SchoolBulletin'
import SchoolAdministration, {SchoolOverview} from './SchoolAdministration'
import type {ManagementSection,SchoolProfile} from './SchoolAdministration'
import AssignmentMaterial from './AssignmentMaterial'
import SaveFeedback from './SaveFeedback'

type Classroom={id:number;name:string;grade:number;teacher:Person;students:Person[];student_count:number}
type Transfer={id:number;kind:string;reason:string;details:Record<string,string|string[]>;actor:Person;created_at:string}
type Material={id?:number;title:string;kind:string;category:string;author:string;language:string;description:string;body:string;subject_id:number|null;rights_note:string;published:boolean;file_name?:string}
const emptyMaterial:Material={title:'',kind:'ebook',category:'Geral',author:'',language:'Português',description:'',body:'',subject_id:null,rights_note:'',published:false}
const kinds=[['ebook','Ebook (PDF)'],['book','Livro'],['research','Trabalho de pesquisa'],['video','Vídeo'],['document','Documento'],['image','Imagem'],['other','Outros materiais']]
export default function SchoolDashboard({username}:{username:string}){
 const [tab,setTab]=useState<'overview'|'notices'|'library'|'transfers'|ManagementSection>('overview')
 const [schoolProfile,setSchoolProfile]=useState<SchoolProfile|null>(null),[version,setVersion]=useState(0)
 const [noticeFile,setNoticeFile]=useState<File|null>(null),[removeDocument,setRemoveDocument]=useState(false)
 const [classes,setClasses]=useState<Classroom[]>([]),[teachers,setTeachers]=useState<Person[]>([]),[transfers,setTransfers]=useState<Transfer[]>([])
 const [notices,setNotices]=useState<SchoolNotice[]>([]),[materials,setMaterials]=useState<Material[]>([]),[subjects,setSubjects]=useState<{id:number;name:string}[]>([])
 const [notice,setNotice]=useState<Partial<SchoolNotice>|null>(null),[material,setMaterial]=useState<Material|null>(null),[file,setFile]=useState<File|null>(null)
 const [query,setQuery]=useState(''),[transferKind,setTransferKind]=useState('teacher'),[source,setSource]=useState(''),[destination,setDestination]=useState(''),[person,setPerson]=useState(''),[reason,setReason]=useState(''),[review,setReview]=useState(false)
 const [busy,setBusy]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
 const lock=useRef(false),alive=useRef(true)
 async function load(){
  const [o,n,l,p]=await Promise.all([api<{classes:Classroom[];teachers:Person[];transfers:Transfer[]}>('/api/school/overview/'),api<{results:SchoolNotice[]}>('/api/school/notices/'),api<{results:Material[];subjects:{id:number;name:string}[]}>('/api/school/library/'),api<{school:SchoolProfile|null}>('/api/school/profile/')])
  if(!alive.current)return;setClasses(o.classes);setTeachers(o.teachers);setTransfers(o.transfers);setNotices(n.results);setMaterials(l.results);setSubjects(l.subjects);setSchoolProfile(p.school||null);setVersion(v=>v+1)
 }
 useEffect(()=>{alive.current=true;void load().catch(()=>{if(alive.current)setError('Não foi possível carregar a gestão da escola. Actualiza a página.')}).finally(()=>{if(alive.current)setReady(true)});return()=>{alive.current=false}},[])
 async function save(path:string,payload:object|FormData,message:string,done:()=>void){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setSuccess('')
  try{await api(path,payload,username,'admin');if(!alive.current)return;done();setSuccess(message);try{await load()}catch{setError('A operação foi concluída, mas a lista não actualizou. Actualiza a página.')}}
  catch(e){if(alive.current)setError(e instanceof Error?e.message:'Não foi possível guardar.')}
  finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 function saveNotice(e:FormEvent){
  e.preventDefault();if(!notice)return
  const payload=new FormData();Object.entries(notice).forEach(([key,value])=>{if(value!==undefined)payload.append(key,String(value))})
  if(noticeFile)payload.append('file',noticeFile)
  payload.append('remove_document',String(removeDocument))
  void save('/api/school/notices/',payload,notice.published?'Informe publicado no mural da escola.':'Rascunho do informe guardado.',()=>{setNotice(null);setNoticeFile(null);setRemoveDocument(false)})
 }
 function editNotice(value:Partial<SchoolNotice>){setNotice(value);setNoticeFile(null);setRemoveDocument(false)}
 function saveMaterial(e:FormEvent){
  e.preventDefault();if(!material)return;const form=new FormData()
  Object.entries(material).forEach(([key,value])=>{if(value!==null&&value!==undefined)form.append(key,String(value))})
  if(file)form.append('file',file)
  void save('/api/school/library/',form,material.published?'Material publicado na biblioteca.':'Material guardado em rascunho.',()=>{setMaterial(null);setFile(null)})
 }
 const sourceClass=classes.find(c=>String(c.id)===source)
 function transfer(e:FormEvent){e.preventDefault();if(!review){setReview(true);return}void save('/api/school/transfer/',{kind:transferKind,source_id:Number(source),target_id:destination?Number(destination):null,student:person,target_teacher:person,previous_teacher:sourceClass?.teacher.username,reason},'Transferência concluída. O histórico foi preservado.',()=>{setReview(false);setSource('');setDestination('');setPerson('');setReason('')})}
 function changeTab(next:typeof tab){setTab(next);setError('');setSuccess('');setReview(false)}
 return <section className="school-dashboard">
  <SaveFeedback busy={busy&&!(['profile','people','classrooms','attendance','calendar'] as string[]).includes(tab)} error={error} success={success}/>
  <div className="school-shell">
   <aside className="school-sidebar"><div className="school-sidebar-brand"><span><School size={26}/></span><div><strong>{schoolProfile?.name||'A minha escola'}</strong><small>Direcção escolar · EduBox</small></div></div>
    <nav aria-label="Gestão da escola">{([
     ['overview','Visão geral',LayoutDashboard],['profile','Cadastro da escola',School],['people','Pessoas',Users],['classrooms','Turmas e inscrições',GraduationCap],['attendance','Presenças',ClipboardCheck],['calendar','Calendário',CalendarDays],['notices','Informes',Megaphone],['library','Gerir biblioteca',BookOpen],['transfers','Transferências',ArrowRightLeft],
    ] as const).map(([id,label,Icon])=><button key={id} disabled={busy} aria-current={tab===id?'page':undefined} className={tab===id?'active':''} onClick={()=>changeTab(id)}><Icon size={19}/>{label}</button>)}</nav>
    <div className="school-local-note"><i/> A funcionar na rede da escola<small>Uma escola. Uma comunidade.</small></div>
   </aside><div className="school-main"><div className="school-topbar"><span>GESTÃO ESCOLAR</span><span>{schoolProfile?.academic_year||new Date().getFullYear()} · Ano lectivo</span></div>
   {tab==='overview'&&<SchoolOverview version={version} onNavigate={next=>changeTab(next as typeof tab)}/>}
   {(['profile','people','classrooms','attendance','calendar'] as string[]).includes(tab)&&<SchoolAdministration key={tab} section={tab as ManagementSection} username={username} onChanged={load} onBusyChange={setBusy}/>}
  {!ready?<p role="status">A carregar a gestão escolar…</p>:<>
   {tab==='notices'&&<div className="portal-panel"><div className="panel-heading"><h2>Informes oficiais</h2><button disabled={busy} className="btn btn-primary" onClick={()=>editNotice({title:'',body:'',published:false})}><Plus size={16}/> Novo informe</button></div><p>Os informes publicados aparecem no mural para toda a comunidade e nos avisos de alunos e professores.</p>
    {notice&&<form className="school-form" onSubmit={saveNotice}><fieldset disabled={busy}><label>Título do informe<input required maxLength={180} value={notice.title} onChange={e=>setNotice({...notice,title:e.target.value})}/></label><label>Texto do informe (opcional com PDF)<textarea rows={5} maxLength={2000} value={notice.body} onChange={e=>setNotice({...notice,body:e.target.value})}/></label><label>Documento do informe (PDF, até 15 MB)<input key={notice.id||'new'} type="file" accept=".pdf,application/pdf" onChange={e=>{setNoticeFile(e.target.files?.[0]||null);setRemoveDocument(false)}}/></label>{notice.has_document&&<><small>Documento guardado: {notice.document_name}</small><label className="check-label"><input type="checkbox" checked={removeDocument} onChange={e=>{setRemoveDocument(e.target.checked);setNoticeFile(null)}}/> Remover o documento guardado</label></>}<p className="portal-hint">Podes publicar apenas o PDF, ou acompanhá-lo com uma mensagem. O documento abre no leitor do EduBox.</p><label className="check-label"><input type="checkbox" checked={notice.published} onChange={e=>setNotice({...notice,published:e.target.checked})}/> Publicar no mural da escola</label><p className="portal-hint">O mural é público na rede local. Publica apenas informação destinada à comunidade escolar.</p><div className="reply-actions"><button className="btn btn-primary">{busy?'A guardar…':'Guardar informe'}</button><button type="button" className="portal-light" onClick={()=>setNotice(null)}>Cancelar</button></div></fieldset></form>}
    {notices.map(n=><article className="school-row" key={n.id}><div><b>{n.title}</b>{n.has_document&&<span className="document-badge">PDF</span>}<small>{n.published?'Publicado':'Rascunho'} · {new Date(n.created_at).toLocaleDateString('pt-PT')}</small>{n.has_document&&<AssignmentMaterial endpoint={`/api/school/notices/${n.id}/reader/`} label="Consultar documento"/>}</div><button className="portal-light" disabled={busy} onClick={()=>editNotice({...n})}>Editar informe</button></article>)}{!notices.length&&<p>Ainda não há informes. Começa com uma mensagem de boas-vindas.</p>}
   </div>}
   {tab==='library'&&<div className="portal-panel"><div className="panel-heading"><h2>Biblioteca da escola</h2><button disabled={busy} className="btn btn-primary" onClick={()=>{setMaterial({...emptyMaterial});setFile(null)}}><Plus size={16}/> Novo material</button></div><p>Organiza por temas, autores e tipos de material. A disciplina é opcional: a biblioteca também acolhe literatura e cultura geral. Ebooks são lidos em PDF.</p>
    {material&&<form className="school-form" onSubmit={saveMaterial}><fieldset disabled={busy}><div className="school-fields">
     <label>Título do material<input required maxLength={180} value={material.title} onChange={e=>setMaterial({...material,title:e.target.value})}/></label>
     <label>Tipo de material<select value={material.kind} onChange={e=>setMaterial({...material,kind:e.target.value})}>{!kinds.some(([id])=>id===material.kind)&&<option value={material.kind}>Áudio antigo (fora do catálogo)</option>}{kinds.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
     <label>Tema / categoria<input required maxLength={100} list="library-themes" value={material.category} onChange={e=>setMaterial({...material,category:e.target.value})} placeholder="Literatura, História, Tecnologia…"/><datalist id="library-themes">{['Literatura','História','Ciências','Tecnologia','Cultura moçambicana','Desenvolvimento pessoal','Geral'].map(x=><option key={x} value={x}/>)}</datalist></label>
     <label>Disciplina (opcional)<select value={material.subject_id||''} onChange={e=>setMaterial({...material,subject_id:e.target.value?Number(e.target.value):null})}><option value="">Leitura geral — sem classe</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
     <label>Autor / instituição<input maxLength={180} value={material.author} onChange={e=>setMaterial({...material,author:e.target.value})}/></label><label>Idioma<input maxLength={60} value={material.language} onChange={e=>setMaterial({...material,language:e.target.value})}/></label>
    </div><label>Descrição<textarea maxLength={4000} value={material.description} onChange={e=>setMaterial({...material,description:e.target.value})}/></label><label>Ficheiro local (até 80 MB)<input key={material.id||'new'} type="file" accept=".pdf,.mp4,.png,.jpg,.jpeg,.webp" onChange={e=>setFile(e.target.files?.[0]||null)}/>{material.file_name&&<small>Guardado: {material.file_name}. Selecciona outro ficheiro apenas para substituir.</small>}</label><label>Texto de leitura (opcional)<textarea maxLength={100000} rows={4} value={material.body} onChange={e=>setMaterial({...material,body:e.target.value})}/></label><label>Origem / direitos de utilização<input maxLength={240} value={material.rights_note} onChange={e=>setMaterial({...material,rights_note:e.target.value})}/></label><label className="check-label"><input type="checkbox" checked={material.published} onChange={e=>setMaterial({...material,published:e.target.checked})}/> Publicar na biblioteca</label><div className="reply-actions"><button className="btn btn-primary">{busy?'A guardar…':'Guardar material'}</button><button type="button" className="portal-light" onClick={()=>setMaterial(null)}>Cancelar</button></div></fieldset></form>}
    <label>Procurar no acervo<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Título, autor ou tema"/></label>
    {materials.filter(m=>`${m.title} ${m.author} ${m.category}`.toLocaleLowerCase('pt').includes(query.toLocaleLowerCase('pt'))).map(m=><article className="school-row" key={m.id}><div><b>{m.title}</b><small>{m.category} · {['audio','audiobook'].includes(m.kind)?'Áudio antigo — fora do catálogo':m.published?'Publicado':'Rascunho'}</small></div><button disabled={busy} className="portal-light" onClick={()=>{setMaterial({...m});setFile(null)}}>Editar material</button></article>)}
   </div>}
   {tab==='transfers'&&<div className="portal-panel"><h2>Continuidade das turmas</h2><p>A mudança de professor mantém os trabalhos e as notas da turma. A mudança de aluno preserva as suas entregas no histórico.</p><form className="school-form" onSubmit={transfer}><fieldset disabled={busy}>
    {!review?<><label>Operação<select value={transferKind} onChange={e=>{setTransferKind(e.target.value);setSource('');setDestination('');setPerson('')}}><option value="teacher">Substituir professor da turma</option><option value="student">Transferir aluno para outra turma</option><option value="student_exit">Transferir aluno para outra escola</option></select></label>
     <label>Turma de origem<select required value={source} onChange={e=>{setSource(e.target.value);setPerson('');setDestination('')}}><option value="">Seleccionar…</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name} · {c.grade}.ª · {c.teacher.name}</option>)}</select></label>
     <label>{transferKind==='teacher'?'Novo professor':'Aluno a transferir'}<select required value={person} onChange={e=>setPerson(e.target.value)}><option value="">Seleccionar…</option>{(transferKind==='teacher'?teachers.filter(t=>t.username!==sourceClass?.teacher.username):sourceClass?.students||[]).map(p=><option key={p.username} value={p.username}>{p.name} (@{p.username})</option>)}</select></label>
     {transferKind==='student'&&<label>Turma de destino<select required value={destination} onChange={e=>setDestination(e.target.value)}><option value="">Seleccionar…</option>{classes.filter(c=>c.id!==sourceClass?.id).map(c=><option key={c.id} value={c.id}>{c.name} · {c.grade}.ª · {c.teacher.name}</option>)}</select></label>}
     <label>Motivo / referência<textarea required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="btn btn-primary">Rever transferência</button>
    </>:<div className="transfer-review"><h3>Confirma os dados da transferência</h3><p><b>{sourceClass?.name} · {sourceClass?.grade}.ª classe</b></p><p>{transferKind==='teacher'?`Professor: ${sourceClass?.teacher.name} → ${person}`:`Aluno: ${person}`}</p>{transferKind==='student'&&<p>Destino: {classes.find(c=>String(c.id)===destination)?.name} · {classes.find(c=>String(c.id)===destination)?.grade}.ª classe</p>}<p>{reason}</p><p>{transferKind==='teacher'?'O novo professor assume esta turma e o anterior perde o acesso a ela.':'O aluno perde o acesso às actividades da turma de origem. As entregas e notas permanecem guardadas.'}</p>{transferKind==='student_exit'&&<p><b>A saída para outra escola remove todas as inscrições e desactiva a conta de acesso. Os registos escolares são preservados.</b></p>}<div className="reply-actions"><button className="btn btn-primary">{busy?'A transferir…':'Confirmar transferência'}</button><button type="button" className="portal-light" onClick={()=>setReview(false)}>Voltar a editar</button></div></div>}
   </fieldset></form><h3>Registo de transferências</h3>{transfers.map(t=><article className="school-row" key={t.id}><div><b>{t.details.student||t.details.classroom} · {t.details.from} → {t.details.to}</b><p>{t.reason}</p><small>{t.actor.name} · {new Date(t.created_at).toLocaleString('pt-PT')}</small></div></article>)}{!transfers.length&&<p>Ainda não foram registadas transferências.</p>}</div>}
  </>}
  <p className="school-admin-link">Disciplinas, exercícios interactivos e configuração avançada: <a href="/admin/" target="_blank" rel="noreferrer">Abrir administração <ExternalLink size={14}/></a></p>
 </div></div></section>
}
