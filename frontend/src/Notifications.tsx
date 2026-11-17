import {useCallback, useEffect, useRef, useState} from 'react'
import type {FormEvent} from 'react'
import {Bell, Check, Megaphone, Plus, Send, X} from 'lucide-react'
import AssignmentMaterial from './AssignmentMaterial'
import {api} from './portalApi'

type User = {username:string; name:string; role:'student'|'teacher'|'admin'}
type Notice = {id:number; title:string; body:string; author:{name:string}; created_at:string; class_names:string[]; read:boolean;school_wide?:boolean;has_document?:boolean}
type ClassRoom = {id:number; name:string; grade:number}

export default function Notifications() {
  const [user,setUser]=useState<User|null>(null)
  const [items,setItems]=useState<Notice[]>([])
  const [classes,setClasses]=useState<ClassRoom[]>([])
  const [unread,setUnread]=useState(0)
  const [open,setOpen]=useState(false)
  const [composing,setComposing]=useState(false)
  const [title,setTitle]=useState('')
  const [body,setBody]=useState('')
  const [audience,setAudience]=useState('')
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [busy,setBusy]=useState(false)
  const lock=useRef(false)
  const alive=useRef(true)
  const request=useRef(0)
  const identity=useRef('')
  const load=useCallback(async()=>{
    const seq=++request.current
    const session=await api<{user:User|null}>('/api/portal/session/')
    if(!alive.current||seq!==request.current)return
    const next=session.user
    if(identity.current!==(next?.username||'')) {
      identity.current=next?.username||'';setItems([]);setUnread(0);setClasses([])
      setOpen(false);setComposing(false);setTitle('');setBody('');setAudience('');setError('');setSuccess('')
    }
    setUser(next)
    if(!next||next.role==='admin')return
    const [notices,groups]=await Promise.all([
      api<{results:Notice[]; unread_count:number}>('/api/portal/announcements/'),
      next.role==='teacher'?api<{results:ClassRoom[]}>('/api/portal/classes/'):Promise.resolve({results:[]}),
    ])
    if(!alive.current||seq!==request.current)return
    setItems(notices.results);setUnread(notices.unread_count);setClasses(groups.results)
  },[])
  useEffect(()=>{
    alive.current=true
    const refresh=()=>{if(lock.current)return;void load().catch(()=>{if(alive.current)setError('Não foi possível actualizar os avisos. Tenta novamente.')})}
    refresh()
    const timer=window.setInterval(refresh,30000)
    return()=>{alive.current=false;request.current+=1;window.clearInterval(timer)}
  },[load])
  useEffect(()=>{
    if(!open)return
    const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)}
    window.addEventListener('keydown',close)
    return()=>window.removeEventListener('keydown',close)
  },[open])
  async function publish(e:FormEvent) {
    e.preventDefault()
    if(lock.current)return
    lock.current=true;request.current+=1;setBusy(true);setError('');setSuccess('')
    try {
      await api('/api/portal/announcements/',{title,body,audience:audience==='all'?'all':'class',class_id:audience==='all'?undefined:Number(audience)},user?.username,'teacher')
      if(!alive.current)return
      setTitle('');setBody('');setComposing(false);setSuccess('Anúncio publicado para as turmas seleccionadas.')
      await load()
    } catch(e) {if(alive.current)setError(e instanceof Error?e.message:'Não foi possível publicar.')}
    finally {lock.current=false;if(alive.current)setBusy(false)}
  }
  async function markRead(id:number) {
    if(lock.current)return
    lock.current=true;request.current+=1;setBusy(true);setError('')
    try {
      await api(`/api/portal/announcements/${id}/read/`,{},user?.username,user?.role==='teacher'?'teacher':'student')
      if(!alive.current)return
      setItems(old=>old.map(n=>n.id===id?{...n,read:true}:n));setUnread(old=>Math.max(0,old-1))
    } catch(e) {if(alive.current)setError(e instanceof Error?e.message:'Não foi possível marcar como lido.')}
    finally {lock.current=false;if(alive.current)setBusy(false)}
  }
  if(!user||user.role==='admin')return null
  return <div className="notifications">
    <button className="notification-trigger" aria-label={`Notificações${unread?`, ${unread} não lidas`:''}`} aria-expanded={open} aria-controls="notification-panel" onClick={()=>setOpen(!open)}><Bell size={20}/><span className="notification-label">Avisos</span>{unread>0&&<span className="notification-count" aria-live="polite">{unread}</span>}</button>
    {open&&<section id="notification-panel" className="notification-panel" aria-label="Notificações da turma">
      <div className="panel-heading"><h2><Bell size={20}/> {user.role==='teacher'?'Avisos às minhas turmas':'Notificações'}</h2><button className="close" aria-label="Fechar notificações" onClick={()=>setOpen(false)}><X size={19}/></button></div>
      <p className="portal-hint">{user.role==='teacher'?'Os alunos das turmas escolhidas recebem uma notificação.':'Informes da escola e avisos dos teus professores.'}</p>
      {error&&<p className="portal-alert portal-danger" role="alert">{error} <button className="text-button" onClick={()=>void load().then(()=>setError('')).catch(()=>{})}>Tentar novamente</button></p>}
      {success&&<p className="portal-alert portal-good" role="status">{success}</p>}
      {user.role==='teacher'&&<button className="btn btn-primary" onClick={()=>setComposing(!composing)}><Plus size={16}/> Novo anúncio</button>}
      {composing&&<form className="portal-panel notice-form" onSubmit={e=>void publish(e)}>
        <label>Destinatários<select required value={audience} onChange={e=>setAudience(e.target.value)}><option value="">Escolher turma…</option><option value="all">Todas as minhas turmas ({classes.length})</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name} · {c.grade}.ª classe</option>)}</select></label>
        <label>Título do anúncio<input required maxLength={180} value={title} onChange={e=>setTitle(e.target.value)}/></label>
        <label>Mensagem<textarea required maxLength={2000} rows={4} value={body} onChange={e=>setBody(e.target.value)}/></label>
        <button className="btn btn-primary" disabled={busy||!classes.length||!audience||!title.trim()||!body.trim()}><Send size={16}/> {busy?'A publicar…':'Publicar anúncio'}</button>
        {!classes.length&&<p>Cria uma turma no teu espaço antes de publicar anúncios.</p>}
      </form>}
      <div className="notice-list">{items.length===0?<div className="empty"><Megaphone size={30}/><p>Ainda não há anúncios.</p></div>:items.map(n=><article className={`notice ${n.read?'':'unread'}`} key={n.id}>
        <small>{n.class_names.join(' · ')}{!n.read&&<b> · Novo</b>}</small><h3>{n.title}</h3><p>{n.body}</p>{n.school_wide&&n.has_document&&<AssignmentMaterial endpoint={`/api/school/notices/${n.id}/reader/`} label="Ler documento do informe"/>}
        <small>{n.author.name} · {new Date(n.created_at).toLocaleString('pt-PT')}</small>
        {!n.read&&<button className="text-button" disabled={busy} onClick={()=>void markRead(n.id)}><Check size={15}/> Marcar como lido</button>}
      </article>)}</div>
      <small className="portal-hint">Actualiza automaticamente a cada 30 segundos enquanto a EduBox estiver aberta e ligada à rede local. Apresenta até 100 avisos, com os não lidos primeiro.</small>
    </section>}
  </div>
}
