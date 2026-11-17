import {useEffect, useMemo, useRef, useState} from 'react'
import {BookOpen, FileSearch, Video, Headphones, Music, FileText, Image, Layers, X, ArrowRight} from 'lucide-react'

import {api} from './portalApi'
import MaterialViewer from './MaterialViewer'
import type {Viewer} from './MaterialViewer'

export type LibraryResource = {id:number; title:string; description:string; subject:string; grade:number; has_file?:boolean;has_text?:boolean;has_external?:boolean;body?:string; rights_note:string; kind?:string; author?:string; language?:string; file_format?:string|null; created_at?:string;viewer?:Viewer|null;external_only?:boolean;viewer_label?:string}
const kinds=[
  {id:'book',label:'Livros',Icon:BookOpen}, {id:'research',label:'Pesquisas',Icon:FileSearch},
  {id:'video',label:'Vídeos',Icon:Video}, {id:'audiobook',label:'Audiolivros',Icon:Headphones},
  {id:'audio',label:'Áudios',Icon:Music}, {id:'document',label:'Documentos',Icon:FileText},
  {id:'image',label:'Imagens',Icon:Image}, {id:'other',label:'Outros materiais',Icon:Layers},
]
export default function Library({resources,search,onLogin}:{resources:LibraryResource[];search:string;onLogin?:()=>void}) {
  const [kind,setKind]=useState('all')
  const [subject,setSubject]=useState('all')
  const [availability,setAvailability]=useState('all')
  const [sort,setSort]=useState('recent')
  const [lesson,setLesson]=useState<LibraryResource|null>(null)
  const [error,setError]=useState('')
  const [loadingId,setLoadingId]=useState<number|null>(null)
  const loadRequest=useRef(0)
  useEffect(()=>()=>{loadRequest.current+=1},[])
  async function openMaterial(item:LibraryResource){
    const seq=++loadRequest.current
    setLoadingId(item.id);setError('')
    try{const detail=await api<Partial<LibraryResource>>(`/api/resources/${item.id}/`);if(seq===loadRequest.current)setLesson({...item,...detail})}
    catch(e){if(seq===loadRequest.current)setError(e instanceof Error?e.message:'Não foi possível abrir o material.')}
    finally{if(seq===loadRequest.current)setLoadingId(null)}
  }
  const dialog=useRef<HTMLDialogElement>(null)
  const opener=useRef<HTMLElement|null>(null)
  useEffect(()=>{
    if(lesson){opener.current=document.activeElement as HTMLElement;dialog.current?.showModal()}
    return()=>{dialog.current?.close();opener.current?.focus()}
  },[lesson])
  const subjects=useMemo(()=>Array.from(new Set(resources.map(r=>r.subject))).sort((a,b)=>a.localeCompare(b,'pt')),[resources])
  const visible=useMemo(()=>resources.filter(r=>
    (kind==='all'||(r.kind||'other')===kind)&&
    (subject==='all'||r.subject===subject)&&
    (availability==='all'||(availability==='local'?!!(r.has_file||r.has_text):!r.has_file&&!r.has_text))&&
    `${r.title} ${r.subject} ${r.description} ${r.author||''}`.toLocaleLowerCase('pt').includes(search.trim().toLocaleLowerCase('pt'))
  ).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'pt'):(b.created_at||'').localeCompare(a.created_at||'')||b.id-a.id),[resources,kind,subject,availability,search,sort])
  return <div className="library">
    <div className="library-intro"><BookOpen size={22}/><p><strong>Uma biblioteca para todas as classes.</strong> Explora materiais de consulta. As fichas e respostas das turmas ficam no espaço privado.</p></div>
    <div className="library-categories" aria-label="Tipos de material">{kinds.map(({id,label,Icon})=><button key={id} aria-pressed={kind===id} className={kind===id?'selected':''} onClick={()=>setKind(kind===id?'all':id)}><Icon size={23}/><strong>{label}</strong><span>{resources.filter(r=>(r.kind||'other')===id).length}</span></button>)}</div>
    <div className="library-filters">
      <button className="portal-light" aria-pressed={kind==='all'} onClick={()=>{setKind('all');setSubject('all');setAvailability('all')}}>Todos os materiais</button>
      <label><span>Disciplina</span><select value={subject} onChange={e=>setSubject(e.target.value)}><option value="all">Todas as disciplinas</option>{subjects.map(s=><option key={s}>{s}</option>)}</select></label>
      <label><span>Disponibilidade</span><select value={availability} onChange={e=>setAvailability(e.target.value)}><option value="all">Todos</option><option value="local">Sem Internet</option><option value="online">Só online</option></select></label>
      <label><span>Ordenar</span><select value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Mais recentes</option><option value="title">Título A–Z</option></select></label>
    </div>
    <div className="library-access-note">A leitura exige uma conta da escola. Os materiais são consultados dentro do EduBox.</div>
    {error&&<div className="portal-alert portal-danger" role="alert">{error}{onLogin&&<button className="portal-light" onClick={onLogin}>Ir ao meu espaço</button>}</div>}
    <div className="list-title"><h3>{kind==='all'?'Explora o acervo':kinds.find(k=>k.id===kind)?.label}</h3><span role="status">{visible.length} material(is)</span></div>
    {visible.length?<div className="cards">{visible.map(item=>{
      const {Icon,label}=kinds.find(k=>k.id===(item.kind||'other'))||kinds[7]
      return <article className={`subject-card library-card library-${item.kind||'other'}`} key={item.id}>
        <div className="card-top"><div className="card-icon"><Icon size={25}/></div><span className="grade-badge">{item.grade}.ª classe</span></div>
        <div className="card-subject">{label} · {item.subject}</div><h4>{item.title}</h4>{item.author&&<small className="library-author">{item.author}</small>}<p>{item.description||'Material educativo disponível para consulta.'}</p>
        <span className={`availability ${item.has_file||item.has_text?'local':'online'}`}>{item.has_file||item.has_text?'Disponível sem Internet':'Requer Internet'}</span>
        <div className="card-footer"><button disabled={loadingId===item.id} aria-label={`Abrir ${item.title}`} onClick={()=>void openMaterial(item)}>{loadingId===item.id?'A abrir…':'Explorar material'} <ArrowRight size={17}/></button></div>
      </article>
    })}</div>:<div className="empty"><BookOpen size={34}/><p>Nenhum material nesta selecção.</p><small>Experimenta outro tipo, disciplina ou pesquisa. Os novos conteúdos publicados pela escola aparecem aqui.</small></div>}
    {lesson&&<dialog ref={dialog} className="library-dialog" aria-labelledby="lesson-title" onCancel={()=>setLesson(null)} onClick={e=>{if(e.target===e.currentTarget)setLesson(null)}}>
      <div className="library-dialog-inner">
        <div className="modal-header"><span className="grade-badge">{lesson.grade}.ª classe · {lesson.subject}</span><button autoFocus aria-label="Fechar material" className="close" onClick={()=>setLesson(null)}><X/></button></div>
        <h2 id="lesson-title">{lesson.title}</h2>
        <p className="library-metadata">{[kinds.find(k=>k.id===(lesson.kind||'other'))?.label,lesson.author,lesson.language].filter(Boolean).join(' · ')}</p>
        <p>{lesson.description}</p>
        {lesson.viewer&&<MaterialViewer viewer={lesson.viewer} title={lesson.title}/>}
        {lesson.body&&<div className="lesson-content protected-text" onContextMenu={e=>e.preventDefault()}>{lesson.body}</div>}
        {lesson.external_only&&<p>Este material tem apenas uma ligação externa. Pede à escola uma versão para consulta no EduBox.</p>}
        <p className="reader-notice">Consulta educativa no EduBox. Não partilhes cópias sem autorização.</p>
        {lesson.rights_note&&<small className="rights-note">Origem / licença: {lesson.rights_note}</small>}
      </div>
    </dialog>}
  </div>
}
