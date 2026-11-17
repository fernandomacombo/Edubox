import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import ActivityTools, {activityKinds} from './ActivityTools'
import type {Activity,WorkGroup} from './ActivityTools'
import SchoolDashboard from './SchoolDashboard'
import StudentHistory from './StudentHistory'
import SaveFeedback from './SaveFeedback'
import AssignmentMaterial from './AssignmentMaterial'
import StudentReply, { clearStudentDrafts } from './StudentReply'
import { BookOpen, CheckCircle2, GraduationCap, LockKeyhole, LogOut, Plus, Send, Users, ArrowLeft, FileText, Clock3, Search, ArrowRight, RefreshCw } from 'lucide-react'

import {api} from './portalApi'
import type {Person,Profile} from './portalApi'
type ClassRoom = { id: number; name: string; grade: number; teacher: Person; student_count: number; students?: Person[] }
type Material = { id: number; title: string; grade: number | null; subject: string }
type Assignment = Activity & {my_group?:WorkGroup|null; response_count?: number; pending_count?: number; id: number; title: string; created_at: string; attachment_url: string | null; instructions: string; class_id: number; class_name: string; grade: number; resource: { id: number; title: string; file_url: string | null; body: string; external_url: string } | null; my_answer: { answer: string; score: number | null; feedback: string } | null }
type Answer = {group_name?:string|null; id: number; student: Person; answer: string; score: number | null; feedback: string }

export default function Portal({onSessionChange}: {onSessionChange?: () => void}) {
  const actionLock = useRef(false)
  const responseRequest = useRef(0)
  const [selectedTask, setSelectedTask] = useState<number | null>(null)
  const [workspace, setWorkspace] = useState<'assignments' | 'classes' | 'students'>('assignments')
  const [selectedClass, setSelectedClass] = useState<number | null>(null)
  const [teacherPending, setTeacherPending] = useState(false)
  const [query, setQuery] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [responseLoading, setResponseLoading] = useState(false)
  const [composing, setComposing] = useState(false)
  const [showClassForm, setShowClassForm] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending' | 'done' | 'graded'>('all')
  const [showPassword, setShowPassword] = useState(false)
  const [user, setUser] = useState<Profile | null>(null)
  const [ready, setReady] = useState(false)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [classes, setClasses] = useState<ClassRoom[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const [className, setClassName] = useState('')
  const [classGrade, setClassGrade] = useState('10')
  const [enrollClass, setEnrollClass] = useState(0)
  const [enrollUsername, setEnrollUsername] = useState('')
  const [assignClass, setAssignClass] = useState('')
  const [assignKind,setAssignKind]=useState('exercise')
  const [kindFilter,setKindFilter]=useState('all')
  const [assignTitle, setAssignTitle] = useState('')
  const [assignInstructions, setAssignInstructions] = useState('')
  const [assignMaterial, setAssignMaterial] = useState('')
  const [documentMode, setDocumentMode] = useState<'none' | 'existing' | 'upload'>('none')
  const [assignPdf, setAssignPdf] = useState<File | null>(null)
  const [fileReset, setFileReset] = useState(0)
  const [opened, setOpened] = useState<number | null>(null)
  const [responses, setResponses] = useState<Answer[]>([])
  const [scores, setScores] = useState<Record<number, string>>({})
  const [feedback, setFeedback] = useState<Record<number, string>>({})

  async function refresh() {
    const [c, a, m] = await Promise.all([
      api<{ results: ClassRoom[] }>('/api/portal/classes/'),
      api<{ results: Assignment[] }>('/api/portal/assignments/'),
      api<{ results: Material[] }>('/api/resources/'),
    ])
    setClasses(c.results); setAssignments(a.results); setMaterials(m.results)
  }
  useEffect(() => {
    let mounted = true
    void api<{user: Profile | null}>('/api/portal/session/').then(async ({user: u}) => {
      if (!mounted) return
      setUser(u)
      if (u) await refresh()
    }).catch(e => { if (mounted) setError(String(e)) }).finally(() => { if (mounted) setReady(true) })
    return () => { mounted = false }
  }, [])

  async function syncAfterSave() { try {await refresh()} catch {setError('A operação foi concluída, mas a lista não actualizou. Carrega em Actualizar dados.')} }
  async function act(fn: () => Promise<void>, message: string) {
    if (actionLock.current) return
    actionLock.current = true
    setBusy(true); setError(''); setSuccess('')
    try { await fn(); setSuccess(message) }
    catch (e) { setError(e instanceof Error ? e.message : 'Erro desconhecido.') }
    finally { actionLock.current = false; setBusy(false) }
  }
  async function signIn(e: FormEvent) {
    e.preventDefault()
    await act(async () => {
      const result = await api<{user: Profile}>('/api/portal/login/', { username: login, password })
      setUser(result.user); setPassword(''); onSessionChange?.(); await syncAfterSave()
    }, 'Sessão iniciada.')
  }
  async function signOut() {
    await act(async () => {
      await api('/api/portal/logout/', {})
      onSessionChange?.()
      responseRequest.current += 1
      setUser(null); setClasses([]); setAssignments([]); setMaterials([])
      setSelectedTask(null); setSelectedClass(null); setTeacherPending(false); setQuery(''); setClassFilter(''); clearStudentDrafts(); setResponses([]); setScores({}); setFeedback({}); setOpened(null)
      setAssignClass(''); setAssignTitle(''); setAssignInstructions(''); setAssignMaterial('')
      setDocumentMode('none'); setAssignPdf(null); setFileReset(old => old + 1)
      setEnrollClass(0); setEnrollUsername(''); setClassName('')
      setWorkspace('assignments'); setComposing(false); setShowClassForm(false); setFilter('all'); setShowPassword(false)
    }, 'Sessão terminada.')
  }
  async function addClass(e: FormEvent) {
    e.preventDefault()
    await act(async () => {
      await api('/api/portal/classes/', { name: className, grade: Number(classGrade) }, user?.username, 'teacher')
      setClassName(''); setShowClassForm(false); await syncAfterSave()
    }, 'Turma criada.')
  }
  async function addStudent(e: FormEvent) {
    e.preventDefault()
    await act(async () => {
      await api(`/api/portal/classes/${enrollClass}/enroll/`, { username: enrollUsername }, user?.username, 'teacher')
      setEnrollClass(0); setEnrollUsername(''); await syncAfterSave()
    }, 'Aluno inscrito.')
  }
  async function addAssignment(e: FormEvent) {
    e.preventDefault()
    await act(async () => {
      if (documentMode === 'existing' && !assignMaterial) {
        throw new Error('Selecciona um material existente ou muda a modalidade de documento.')
      }
      if (documentMode === 'upload' && !assignPdf) {
        throw new Error('Selecciona um PDF para anexar à ficha.')
      }
      if (documentMode === 'upload' && assignPdf && (assignPdf.size > 15 * 1024 * 1024 || !assignPdf.name.toLowerCase().endsWith('.pdf'))) {
        throw new Error('Selecciona um PDF válido até 15 MB.')
      }
      const form = new FormData()
      form.append('document_mode', documentMode)
      form.append('class_id', assignClass)
      form.append('title', assignTitle)
      form.append('kind', assignKind)
      form.append('instructions', assignInstructions)
      if (documentMode === 'existing') form.append('resource_id', assignMaterial)
      if (documentMode === 'upload' && assignPdf) form.append('file', assignPdf)
      await api('/api/portal/assignments/', form, user?.username, 'teacher')
      setSelectedClass(Number(assignClass))
      setAssignTitle(''); setAssignInstructions(''); setDocumentMode('none'); setAssignMaterial(''); setAssignPdf(null); setFileReset(old => old + 1); setComposing(false); setWorkspace('assignments'); await syncAfterSave()
    }, 'Ficha atribuída à turma.')
  }
  async function sendAnswer(id: number, answer: string) {
    if (actionLock.current) throw new Error('Aguarda que a operação anterior termine.')
    actionLock.current = true; setBusy(true)
    try {
      await api(`/api/portal/assignments/${id}/submit/`, { answer }, user?.username)
      // A successful POST is authoritative, even if subsequent reads are unavailable.
      setAssignments(old => old.map(a => a.id === id ? {...a, my_answer: {answer, score: null, feedback: ''}} : a))
      setError(''); setSuccess('Resposta entregue ao professor. Podes consultar a avaliação aqui quando estiver disponível.')
    } finally { actionLock.current = false; setBusy(false) }
  }

  async function toggleResponses(id: number) {
    const requestId = ++responseRequest.current
    if (opened === id) { setOpened(null); return }
    setError(''); setResponseLoading(true); setOpened(id); setResponses([])
    try {
      const result = await api<{results: Answer[]}>(`/api/portal/assignments/${id}/responses/`)
      if (requestId !== responseRequest.current) return
      setResponses(result.results)
      setScores(Object.fromEntries(result.results.map(r => [r.id, r.score?.toString() ?? ''])))
      setFeedback(Object.fromEntries(result.results.map(r => [r.id, r.feedback])))
      setOpened(id)
    } catch (e) { if (requestId === responseRequest.current) { setOpened(null); setError(e instanceof Error ? e.message : 'Erro a consultar respostas.') } }
    finally { if (requestId === responseRequest.current) setResponseLoading(false) }
  }
  async function gradeAnswer(id: number, assignmentId: number) {
    const requestId = responseRequest.current
    await act(async () => {
      await api(`/api/portal/responses/${id}/grade/`, { score: Number(scores[id]), feedback: feedback[id] || '' }, user?.username, 'teacher')
      setResponses(old=>old.map(r=>r.id===id?{...r,score:Number(scores[id]),feedback:feedback[id]||''}:r))
      try {
      const result = await api<{results: Answer[]}>(`/api/portal/assignments/${assignmentId}/responses/`)
      if (requestId === responseRequest.current) {setResponses(result.results);setScores(Object.fromEntries(result.results.map(r=>[r.id,r.score?.toString()??''])));setFeedback(Object.fromEntries(result.results.map(r=>[r.id,r.feedback])))}
      setAssignments(old => old.map(a => a.id === assignmentId ? {...a, response_count: result.results.length, pending_count: result.results.filter(r => r.score === null).length} : a))
    } catch {setError('A nota foi guardada. Actualiza as respostas para consultar os dados mais recentes.')}
    }, 'Avaliação guardada.')
  }
  const currentClass = classes.find(c => String(c.id) === assignClass)
  const availableMaterials = materials.filter(m => m.grade == null || m.grade === currentClass?.grade)

  const classroom = classes.find(c => c.id === selectedClass)
  const scopedAssignments = assignments.filter(a => selectedClass === null || a.class_id === selectedClass)
  const pendingCount = scopedAssignments.reduce((total, a) => total + (a.pending_count ?? 0), 0)
  const enrolledCount = classroom?.student_count ?? classes.reduce((total, c) => total + c.student_count, 0)
  const visibleAssignments = (user?.role === 'teacher' ? scopedAssignments : assignments).filter(a => {
    if(kindFilter!=='all' && (a.kind||'exercise')!==kindFilter)return false
    const matchesText = `${a.title} ${a.instructions} ${a.class_name}`.toLocaleLowerCase('pt').includes(query.trim().toLocaleLowerCase('pt'))
    const matchesClass = !classFilter || String(a.class_id) === classFilter
    if (user?.role === 'teacher') return matchesText && matchesClass && (!teacherPending || (a.pending_count ?? 0) > 0)
    return matchesText && matchesClass && (filter === 'all' || (filter === 'pending' ? !a.my_answer : filter === 'done' ? a.my_answer?.score === null : a.my_answer != null && a.my_answer.score !== null))
  })
  function navigate(view: 'assignments' | 'classes' | 'students', pending = false) {
    responseRequest.current += 1
    setWorkspace(view); setTeacherPending(pending); setSelectedTask(null); setOpened(null)
    setResponseLoading(false); setResponses([]); setQuery(''); setClassFilter(''); setComposing(false); setShowClassForm(false)
    setEnrollClass(0); setEnrollUsername(''); setKindFilter('all'); setError(''); setSuccess('')
  }
  function openClass(id: number | null) {
    setSelectedClass(id); navigate(id === null ? 'classes' : 'assignments')
  }
  function compose() {
    setAssignKind('exercise'); setAssignClass(selectedClass === null ? '' : String(selectedClass))
    setDocumentMode('none'); setAssignMaterial(''); setAssignPdf(null); setFileReset(old => old + 1)
    navigate('assignments'); setComposing(true)
  }

  return <section className={`portal container ${user?.role === 'student' ? 'student-space' : user?.role === 'teacher' ? 'teacher-space' : user?.role==='admin'?'school-space':''}`}>
    {user?.role!=='admin'&&<div className="portal-heading"><span className="section-kicker">O TEU ESPAÇO DE APRENDIZAGEM</span><h1>{user ? `Olá, ${user.name}` : 'Bom ter-te aqui.'}</h1><p>{!user ? 'Entra para acompanhar as tuas turmas, fichas e resultados.' : user.role === 'teacher' ? 'Organiza as turmas e acompanha cada aprendizagem.' : user.role === 'student' ? 'As tuas fichas, respostas e notas, num só lugar.' : 'Tudo pronto para cuidar da tua escola.'}</p></div>}
    <SaveFeedback busy={busy} error={error} success={success}/>
    {!ready ? <div className="portal-panel">A verificar a ligação...</div> : !user ?
      <form className="portal-panel portal-login" onSubmit={e => void signIn(e)}>
        <LockKeyhole size={28}/><h2>Entrar na EduBox</h2>
        <p>Usa os dados de acesso que a escola te entregou.</p>
        <label>Utilizador<input autoComplete="username" required value={login} onChange={e => setLogin(e.target.value)}/></label>
        <label>Palavra-passe<input type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}/></label>
        <button type="button" className="text-button" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}</button>
        <button disabled={busy} className="btn btn-primary">{busy ? 'A entrar…' : 'Entrar'}</button>
        <small>Ainda não tens conta? Pede ajuda ao responsável da escola.</small>
      </form> : <>
        <div className="portal-user"><div className="identity"><span className="avatar" aria-hidden="true">{user.name.slice(0,1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role === 'teacher' ? 'Professor' : user.role === 'student' ? 'Aluno' : 'Administrador'} · @{user.username}</small></div></div><button onClick={() => void signOut()} disabled={busy} className="portal-light"><LogOut size={16}/> Sair</button></div>
        {user.role === 'student' && selectedTask === null && <details className="portal-panel student-help"><summary>Como funciona o meu espaço?</summary>
          <ol><li><b>Por fazer:</b> lê a ficha e escreve ao teu ritmo. Podes rever a resposta antes de continuar.</li><li><b>A aguardar avaliação:</b> a resposta já chegou ao professor. Não precisas de a enviar outra vez.</li><li><b>Avaliadas:</b> consulta a nota e o comentário para perceberes o que podes melhorar.</li></ol>
          <p>As tuas respostas e notas podem ser consultadas por ti, pelo professor responsável e pelo administrador da escola. Os colegas não têm acesso a elas.</p>
          <p>Tens dúvidas sobre a ficha ou precisas de ajuda? Fala com o teu professor. Se esta área estiver vazia, pede-lhe que confirme a tua inscrição na turma.</p>
          <p>Não precisas de Internet para responder, mas mantém a ligação ao Wi-Fi da EduBox para entregar.</p>
        </details>}
        {user.role === 'admin' && <SchoolDashboard username={user.username}/>}
        {user.role === 'student' && <StudentHistory/>}
        {user.role === 'teacher' && <>
          {!composing && <>
            {classroom && <button className="back" onClick={() => openClass(null)}><ArrowLeft size={16}/> Todas as turmas</button>}
            <div className="learning-banner teacher-banner">
              <div><span className="section-kicker">{classroom ? `${classroom.grade}.ª CLASSE · ESPAÇO DA TURMA` : 'ENSINAR. ACOMPANHAR. INSPIRAR.'}</span>
                <h2>{classroom ? classroom.name : 'Cada turma, um mundo para descobrir.'}</h2>
                <p>{classroom ? 'Fichas, alunos e avaliações desta turma, sempre à mão.' : 'Prepara a próxima aula e acompanha o progresso das tuas turmas.'}</p>
                <button className="btn" onClick={() => navigate('assignments', true)}><CheckCircle2 size={18}/> {pendingCount ? 'Avaliar respostas' : 'Consultar avaliações'} <ArrowRight size={18}/></button>
              </div>
              <div className="learning-orbit"><GraduationCap size={42}/><strong>{classroom ? classroom.student_count : classes.length}</strong><small>{classroom ? 'alunos nesta turma' : 'turmas para acompanhar'}</small></div>
            </div>
            <div className="workspace-stats" aria-label="Resumo do professor">
              <div><Users size={21}/><strong>{enrolledCount}</strong><span>{classroom ? 'Alunos inscritos' : 'Inscrições nas turmas'}</span></div>
              <div><FileText size={21}/><strong>{scopedAssignments.length}</strong><span>Fichas criadas</span></div>
              <div><Send size={21}/><strong>{scopedAssignments.reduce((total, a) => total + (a.response_count ?? 0), 0)}</strong><span>Respostas entregues</span></div>
              <div className="stat-attention"><Clock3 size={21}/><strong>{pendingCount}</strong><span>Por avaliar</span></div>
            </div>
          </>}
          <div className="workspace-bar">
            <div className="workspace-tabs" aria-label="Área de trabalho">
              {!classroom && <button className={workspace === 'classes' ? 'active' : ''} aria-pressed={workspace === 'classes'} onClick={() => navigate('classes')}><Users size={18}/> Turmas <span>{classes.length}</span></button>}
              <button className={workspace === 'assignments' && !teacherPending ? 'active' : ''} aria-pressed={workspace === 'assignments' && !teacherPending} onClick={() => navigate('assignments')}><FileText size={18}/> Fichas <span>{scopedAssignments.length}</span></button>
              {classroom && <button className={workspace === 'students' ? 'active' : ''} aria-pressed={workspace === 'students'} onClick={() => navigate('students')}><Users size={18}/> Alunos <span>{classroom.student_count}</span></button>}
              <button className={teacherPending ? 'active' : ''} aria-pressed={teacherPending} onClick={() => navigate('assignments', true)}><CheckCircle2 size={18}/> Avaliações <span>{pendingCount}</span></button>
            </div>
            <div className="workspace-actions"><button className="portal-light" disabled={busy} aria-label="Actualizar dados" onClick={() => {navigate(workspace, teacherPending); void act(refresh, 'Dados actualizados.')}}><RefreshCw size={16}/></button><button className="btn btn-primary" disabled={busy} onClick={compose}><Plus size={18}/> Nova ficha</button></div>
          </div>
        </>}
        {user.role === 'teacher' && <>
          <div className="portal-grid">
            {workspace === 'classes' && showClassForm && <form className="portal-panel compose-panel" onSubmit={e => void addClass(e)}>
              <h2><Users size={21}/> Nova turma</h2>
              <label>Nome da turma<input value={className} required maxLength={100} onChange={e => setClassName(e.target.value)} placeholder="Ex.: Turma A"/></label>
              <label>Classe<select value={classGrade} onChange={e => setClassGrade(e.target.value)}>{Array.from({length:12},(_,i)=>i+1).map(g => <option key={g} value={g}>{g}.ª classe</option>)}</select></label>
              <button className="btn btn-primary" disabled={busy}><Plus size={16}/> Criar turma</button> <button type="button" className="portal-light" onClick={() => setShowClassForm(false)}>Cancelar</button>
            </form>}
            {composing && <form className="portal-panel compose-panel" onSubmit={e => void addAssignment(e)}>
              <button type="button" className="back" onClick={() => setComposing(false)}><ArrowLeft size={16}/> Voltar às fichas</button>
              <h2>Uma nova oportunidade de aprender</h2><p>Escolhe a turma, explica a tarefa e adiciona um documento se precisares.</p>
              <label>Turma<select required value={assignClass} onChange={e => { setAssignClass(e.target.value); setDocumentMode('none'); setAssignMaterial(''); setAssignPdf(null); setFileReset(old => old + 1) }}><option value="">Seleccionar...</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name} · {c.grade}.ª classe</option>)}</select></label>
              <label>Tipo de actividade<select value={assignKind} onChange={e=>setAssignKind(e.target.value)}>{activityKinds.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
              <label>Título<input required maxLength={180} value={assignTitle} onChange={e => setAssignTitle(e.target.value)}/></label>
              <label>Como queres disponibilizar o documento?
                <select value={documentMode} onChange={e => { setDocumentMode(e.target.value as 'none' | 'existing' | 'upload'); setAssignMaterial(''); setAssignPdf(null); setFileReset(old => old + 1) }}>
                  <option value="none">Apenas instruções — sem documento</option>
                  <option value="existing">Escolher documento da biblioteca</option>
                  <option value="upload">Carregar um novo PDF</option>
                </select>
              </label>
              {documentMode === 'existing' && <label>Escolher documento existente
                <select required value={assignMaterial} onChange={e => setAssignMaterial(e.target.value)}>
                  <option value="">Seleccionar documento...</option>
                  {availableMaterials.map(m => <option key={m.id} value={m.id}>{m.subject} — {m.title}</option>)}
                </select>
                {availableMaterials.length === 0 && <small className="portal-hint">Não há materiais publicados para esta classe. Escolhe «Carregar um novo PDF» ou pede à escola um material para a biblioteca.</small>}
              </label>}
              {documentMode === 'upload' && <>
                <label>Carregar novo PDF (até 15 MB)
                  <input key={fileReset} required type="file" accept=".pdf,application/pdf" onChange={e => setAssignPdf(e.target.files?.[0] || null)}/>
                </label>
                <p className="portal-hint">PDF privado: apenas esta turma, o professor responsável e o administrador podem abrir.</p>
              </>}
              {documentMode === 'none' && <p className="portal-hint">A ficha será publicada apenas com o título e as instruções, sem ficheiro anexo.</p>}
              <label>Instruções<textarea required maxLength={4000} rows={4} value={assignInstructions} onChange={e => setAssignInstructions(e.target.value)} placeholder="O que o aluno deve fazer?"/></label>
              <button className="btn btn-primary" disabled={busy || !assignClass}><Send size={16}/> {busy ? 'A publicar…' : 'Publicar'}</button>
            </form>}
          </div>
          {workspace === 'classes' && <div className="class-directory"><div className="panel-heading"><h2><GraduationCap size={21}/> As minhas turmas</h2><button className="portal-light" onClick={() => setShowClassForm(!showClassForm)}><Plus size={16}/> Nova turma</button></div>
            {classes.length === 0 ? <div className="empty"><Users size={32}/><p>A tua primeira turma começa aqui.</p><small>Selecciona «Nova turma» para começar.</small></div> : <div className="task-gallery">{classes.map((c, index) => {
              const tasks = assignments.filter(a => a.class_id === c.id)
              const pending = tasks.reduce((total, a) => total + (a.pending_count ?? 0), 0)
              return <button className={`task-tile class-tile tone-${index % 3}`} key={c.id} aria-label={`Abrir turma ${c.name}`} onClick={() => openClass(c.id)}>
                <div className="task-art"><Users size={34}/><span>{c.grade}.ª</span><i aria-hidden="true"/></div>
                <div className="task-tile-body"><small>{c.grade}.ª classe</small><h3>{c.name}</h3><p>{c.student_count} aluno(s) · {tasks.length} ficha(s)</p><div><span>{pending ? `${pending} resposta(s) por avaliar` : 'Abrir turma'}</span><ArrowRight size={18}/></div></div>
              </button>
            })}</div>}
          </div>}
          {workspace === 'students' && classroom && <div className="portal-panel"><div className="panel-heading"><h2><Users size={21}/> Alunos de {classroom.name}</h2><button className="portal-light" onClick={() => {setEnrollClass(enrollClass ? 0 : classroom.id);setEnrollUsername('')}}><Plus size={16}/> Inscrever aluno</button></div>
            {enrollClass === classroom.id && <form className="portal-inline" onSubmit={e => void addStudent(e)}><label>Utilizador do aluno<input required value={enrollUsername} onChange={e => setEnrollUsername(e.target.value)}/></label><button className="btn btn-primary" disabled={busy}>Inscrever</button></form>}
            <p className="portal-hint">Usa o nome de utilizador da conta de aluno criada pela escola.</p>
            <label className="workspace-search"><Search size={17}/><span className="sr-only">Pesquisar alunos</span><input type="search" placeholder="Pesquisar por nome ou utilizador…" value={query} onChange={e => setQuery(e.target.value)}/></label>
            {classroom.students?.filter(s => `${s.name} ${s.username}`.toLocaleLowerCase('pt').includes(query.trim().toLocaleLowerCase('pt'))).map(s => <div className="roster-row" key={s.username}><span className="avatar" aria-hidden="true">{s.name.slice(0,1).toUpperCase()}</span><div><strong>{s.name}</strong><small>@{s.username}</small></div><span className="portal-status">Inscrito</span></div>)}
            {!classroom.student_count && <div className="empty"><Users size={30}/><p>Esta turma ainda não tem alunos.</p><small>Selecciona «Inscrever aluno» para adicionar a primeira conta.</small></div>}
            {!!classroom.student_count && !classroom.students?.some(s => `${s.name} ${s.username}`.toLocaleLowerCase('pt').includes(query.trim().toLocaleLowerCase('pt'))) && <p>Nenhum aluno corresponde à pesquisa.</p>}
          </div>}
        </>}
        {user.role === 'student' && selectedTask === null && <div className="learning-banner">
          <div><span className="section-kicker">UM PASSO DE CADA VEZ</span><h2>O teu próximo<br/>descobrimento começa aqui.</h2><p>Escolhe uma ficha. Lê, experimenta e aprende ao teu ritmo.</p>
          {assignments.some(a => !a.my_answer) && <button className="btn" onClick={() => setSelectedTask(assignments.find(a => !a.my_answer)!.id)}>Começar uma ficha <ArrowLeft className="forward-arrow" size={18}/></button>}</div>
          <div className="learning-orbit" aria-label={`${assignments.filter(a => a.my_answer).length} de ${assignments.length} fichas entregues`}><BookOpen size={42}/><strong>{assignments.filter(a => a.my_answer).length}<span> / {assignments.length}</span></strong><small>fichas entregues</small></div>
        </div>}
        {(user.role === 'teacher' || user.role === 'student') && workspace === 'assignments' && !composing && <div className="portal-panel assignment-list">
          {selectedTask !== null && <button className="back" onClick={() => {setSelectedTask(null);setOpened(null);responseRequest.current += 1}}><ArrowLeft size={16}/> {user.role === 'student' ? 'Voltar ao meu espaço' : 'Voltar às fichas'}</button>}
          <h2><BookOpen size={21}/>{user.role === 'teacher' ? selectedTask !== null ? 'Ficha e respostas' : teacherPending ? 'Respostas por avaliar' : classroom ? `Fichas de ${classroom.name}` : 'Fichas atribuídas' : selectedTask === null ? 'Explora as tuas fichas' : 'O teu momento de aprender'}</h2>
          {selectedTask === null && <div className="workspace-tools">
            <label className="workspace-search"><Search size={17}/><span className="sr-only">Pesquisar fichas</span><input type="search" placeholder="Pesquisar fichas…" value={query} onChange={e => setQuery(e.target.value)}/></label>
            {user.role === 'student' && <button className="portal-light" disabled={busy} onClick={() => void act(refresh, 'Fichas e notas actualizadas.')}><RefreshCw size={16}/> Actualizar</button>}
            {selectedClass === null && classes.length > 1 && <label className="class-filter"><span className="sr-only">Filtrar por turma</span><select value={classFilter} onChange={e => setClassFilter(e.target.value)}><option value="">Todas as turmas</option>{classes.map(c => <option value={c.id} key={c.id}>{c.name} · {c.grade}.ª</option>)}</select></label>}
          </div>}
          {selectedTask===null&&<label className="activity-filter">Mostrar actividades<select value={kindFilter} onChange={e=>setKindFilter(e.target.value)}><option value="all">Todos os tipos</option>{activityKinds.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}
          {user.role === 'student' && selectedTask === null && <div className="student-filters" aria-label="Filtrar fichas">{(['all','pending','done','graded'] as const).map(f => <button key={f} aria-pressed={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>{f === 'all' ? 'Todas' : f === 'pending' ? 'Por fazer' : f === 'done' ? 'A aguardar avaliação' : 'Avaliadas'}</button>)}</div>}
          {selectedTask === null && visibleAssignments.length > 0 ? <div className="task-gallery">{visibleAssignments.map((a, index) => <button className={`task-tile tone-${index % 3}`} key={a.id} onClick={() => {setSelectedTask(a.id); if (user.role === 'teacher' && teacherPending) void toggleResponses(a.id)}}>
            <div className="task-art"><FileText size={34}/><span>{a.grade}.ª</span><i aria-hidden="true"/></div>
            <div className="task-tile-body"><small>{a.kind_label||'Exercício'} · {a.class_name} · {a.attachment_url || a.resource ? 'Com material de apoio' : 'Actividade escrita'}</small><h3>{a.title}</h3><p>{a.instructions}</p><div><span>{user.role === 'teacher' ? `${a.response_count ?? 0} entregue(s) · ${a.pending_count ?? 0} por avaliar` : !a.my_answer ? 'Por fazer' : a.my_answer.score === null ? 'A aguardar avaliação' : `Avaliada · ${a.my_answer.score}/20`}</span><ArrowLeft className="forward-arrow" size={18}/></div></div>
          </button>)}</div> : visibleAssignments.length === 0 && selectedTask === null ? <div className="empty"><FileText size={32}/><p>{query || classFilter ? 'Nenhuma ficha encontrada.' : user.role === 'teacher' ? teacherPending ? 'Não há respostas por avaliar.' : 'Vamos criar a primeira ficha?' : filter === 'pending' ? 'Tudo em dia!' : 'Ainda não há fichas aqui.'}</p><small>{query || classFilter ? 'Experimenta outra pesquisa ou turma.' : user.role === 'teacher' ? teacherPending ? 'As novas respostas dos alunos aparecerão aqui.' : 'Usa o botão «Nova ficha» para começar.' : 'As fichas publicadas pelo professor aparecem neste espaço.'}</small></div> : assignments.filter(a => a.id === selectedTask).map(a => <div className="portal-entry" key={a.id}>
            <div className="portal-title"><div><b>{a.title}</b><small>{a.kind_label||'Exercício'} · {a.class_name} · {a.grade}.ª classe · {new Date(a.created_at).toLocaleDateString('pt-PT')}</small></div>{a.my_answer && <span className="portal-status"><CheckCircle2 size={15}/> {a.my_answer.score === null ? 'Entregue' : `Avaliada · ${a.my_answer.score}/20`}</span>}{user.role === 'student' && !a.my_answer && <span className="portal-status pending"><Clock3 size={15}/> Por fazer</span>}</div>
            <p className="portal-text">{a.instructions}</p>
            {a.attachment_url && <AssignmentMaterial key={`pdf:${a.id}`} endpoint={`/api/portal/assignments/${a.id}/reader/`} label="Ler PDF desta ficha"/>}
            {a.my_group&&<p className="group-summary"><b>{a.my_group.name}</b> · {a.my_group.members.map(m=>m.name).join(', ')}. Uma entrega pelo grupo.</p>}
            {a.correction_published&&<section className="published-correction"><h3>Correcção publicada pelo professor</h3><p className="portal-text">{a.correction}</p></section>}
            {user.role==='teacher'&&<ActivityTools key={a.id} activity={a} students={classes.find(c=>c.id===a.class_id)?.students||[]} username={user.username} onSaved={refresh}/>}
            {a.resource && <AssignmentMaterial key={`resource:${a.resource.id}`} endpoint={`/api/resources/${a.resource.id}/`} label={`Consultar ${a.resource.title}`}/>}
            {user.role === 'student' ? (a.my_answer ? <div className="portal-reply"><b>{a.kind==='group'?'Resposta do teu grupo':'A tua resposta'}</b><p className="portal-text">{a.my_answer.answer}</p><small>{a.my_answer.score === null ? 'A aguardar correcção' : `Nota: ${a.my_answer.score}/20`}</small>{a.my_answer.feedback && <p>Comentário: {a.my_answer.feedback}</p>}</div> : a.accepting_submissions===false?<p className="portal-status">Entregas encerradas pelo professor.</p>:a.kind==='group'&&!a.my_group?<p className="portal-hint">Aguarda que o professor te atribua a um grupo.</p>:<StudentReply key={`${user.username}:${a.id}`} username={user.username} assignmentId={a.id} title={a.title} submit={answer => sendAnswer(a.id, answer)}/>) : <><button className="portal-light" onClick={() => void toggleResponses(a.id)}>{opened === a.id ? 'Fechar respostas' : 'Ver respostas'}</button>{opened === a.id && <div className="portal-responses">{!responseLoading && <p className="portal-hint">{responses.length} resposta(s) · {responses.filter(r => r.score === null).length} por avaliar</p>}{!responseLoading && <details className="missing-students"><summary>Quem ainda não entregou?</summary><p>{classes.find(c => c.id === a.class_id)?.students?.filter(s => !responses.some(r => r.student.username === s.username)).map(s => s.name).join(', ') || (classes.find(c => c.id === a.class_id)?.student_count ? 'Todos os alunos inscritos já entregaram.' : 'Esta turma ainda não tem alunos.')}</p></details>}{responseLoading ? <p role="status">A carregar respostas…</p> : responses.length === 0 ? <p>Os alunos ainda não entregaram.</p> : responses.map(r => <div className="portal-reply" key={r.id}><b>{r.student.name} (@{r.student.username})</b>{r.group_name&&<small>Grupo: {r.group_name} · a nota aplica-se a todos os membros</small>}<span className="review-status">{r.score === null ? 'Por avaliar' : `Avaliada · ${r.score}/20`}</span><p className="portal-text">{r.answer}</p><div className="portal-review"><label>Nota (0–20)<input type="number" step="1" min="0" max="20" value={scores[r.id] ?? ''} onChange={e => setScores(old => ({...old,[r.id]:e.target.value}))}/></label><label>Comentário<input maxLength={2000} value={feedback[r.id] ?? ''} onChange={e => setFeedback(old => ({...old,[r.id]:e.target.value}))}/></label><button className="btn btn-primary" disabled={busy || !/^\d+$/.test(scores[r.id] ?? '') || Number(scores[r.id])>20} onClick={() => void gradeAnswer(r.id,a.id)}>{busy?'A guardar…':'Guardar nota'}</button></div></div>)}</div>}</>}
          </div>)}
        </div>}
      </>}

  </section>
}
