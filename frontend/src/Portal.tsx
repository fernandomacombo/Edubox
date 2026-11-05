import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { BookOpen, CheckCircle2, ExternalLink, GraduationCap, LockKeyhole, LogOut, Plus, Send, Users, ArrowLeft, FileText, Clock3 } from 'lucide-react'

type Person = { username: string; name: string }
type Profile = Person & { role: 'admin' | 'teacher' | 'student' }
type ClassRoom = { id: number; name: string; grade: number; teacher: Person; student_count: number; students?: Person[] }
type Material = { id: number; title: string; grade: number; subject: string }
type Assignment = { id: number; title: string; created_at: string; attachment_url: string | null; instructions: string; class_id: number; class_name: string; grade: number; resource: { title: string; file_url: string | null; body: string; external_url: string } | null; my_answer: { answer: string; score: number | null; feedback: string } | null }
type Answer = { id: number; student: Person; answer: string; score: number | null; feedback: string }

async function api<T>(path: string, body?: object | FormData): Promise<T> {
  if (body !== undefined) {
    const verify = await fetch('/api/portal/session/', { credentials: 'same-origin' })
    if (!verify.ok) throw new Error('Não foi possível confirmar a sessão.')
  }
  const token = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/)?.[1] || ''
  const multipart = body instanceof FormData
  const res = await fetch(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: body === undefined ? {} : multipart ? { 'X-CSRFToken': decodeURIComponent(token) } : { 'Content-Type': 'application/json', 'X-CSRFToken': decodeURIComponent(token) },
    body: body === undefined ? undefined : multipart ? body : JSON.stringify(body) })
  const result = await res.json().catch(() => ({})) as { error?: string }
  if (!res.ok) throw new Error(result.error || `Erro ${res.status}. Verifica o servidor Django.`)
  return result as T
}

export default function Portal() {
  const actionLock = useRef(false)
  const responseRequest = useRef(0)
  const [workspace, setWorkspace] = useState<'assignments' | 'classes'>('assignments')
  const [composing, setComposing] = useState(false)
  const [showClassForm, setShowClassForm] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all')
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
  const [assignTitle, setAssignTitle] = useState('')
  const [assignInstructions, setAssignInstructions] = useState('')
  const [assignMaterial, setAssignMaterial] = useState('')
  const [documentMode, setDocumentMode] = useState<'none' | 'existing' | 'upload'>('none')
  const [assignPdf, setAssignPdf] = useState<File | null>(null)
  const [fileReset, setFileReset] = useState(0)
  const [studentAnswers, setStudentAnswers] = useState<Record<number, string>>({})
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
      setUser(result.user); setPassword(''); await refresh()
    }, 'Sessão iniciada.')
  }
  async function signOut() {
    await act(async () => {
      await api('/api/portal/logout/', {})
      responseRequest.current += 1
      setUser(null); setClasses([]); setAssignments([]); setMaterials([])
      setStudentAnswers({}); setResponses([]); setScores({}); setFeedback({}); setOpened(null)
      setAssignClass(''); setAssignTitle(''); setAssignInstructions(''); setAssignMaterial('')
      setDocumentMode('none'); setAssignPdf(null); setFileReset(old => old + 1)
      setEnrollClass(0); setEnrollUsername(''); setClassName('')
      setWorkspace('assignments'); setComposing(false); setShowClassForm(false); setFilter('all'); setShowPassword(false)
    }, 'Sessão terminada.')
  }
  async function addClass(e: FormEvent) {
    e.preventDefault()
    await act(async () => {
      await api('/api/portal/classes/', { name: className, grade: Number(classGrade) })
      setClassName(''); setShowClassForm(false); await refresh()
    }, 'Turma criada.')
  }
  async function addStudent(e: FormEvent) {
    e.preventDefault()
    await act(async () => {
      await api(`/api/portal/classes/${enrollClass}/enroll/`, { username: enrollUsername })
      setEnrollClass(0); setEnrollUsername(''); await refresh()
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
      form.append('instructions', assignInstructions)
      if (documentMode === 'existing') form.append('resource_id', assignMaterial)
      if (documentMode === 'upload' && assignPdf) form.append('file', assignPdf)
      await api('/api/portal/assignments/', form)
      setAssignTitle(''); setAssignInstructions(''); setDocumentMode('none'); setAssignMaterial(''); setAssignPdf(null); setFileReset(old => old + 1); setComposing(false); setWorkspace('assignments'); await refresh()
    }, 'Ficha atribuída à turma.')
  }
  async function sendAnswer(id: number) {
    await act(async () => {
      await api(`/api/portal/assignments/${id}/submit/`, { answer: studentAnswers[id] || '' })
      await refresh()
    }, 'Resposta entregue ao professor.')
  }
  async function toggleResponses(id: number) {
    const requestId = ++responseRequest.current
    if (opened === id) { setOpened(null); return }
    setError('')
    try {
      const result = await api<{results: Answer[]}>(`/api/portal/assignments/${id}/responses/`)
      if (requestId !== responseRequest.current) return
      setResponses(result.results)
      setScores(Object.fromEntries(result.results.map(r => [r.id, r.score?.toString() ?? ''])))
      setFeedback(Object.fromEntries(result.results.map(r => [r.id, r.feedback])))
      setOpened(id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro a consultar respostas.') }
  }
  async function gradeAnswer(id: number, assignmentId: number) {
    await act(async () => {
      await api(`/api/portal/responses/${id}/grade/`, { score: Number(scores[id]), feedback: feedback[id] || '' })
      const result = await api<{results: Answer[]}>(`/api/portal/assignments/${assignmentId}/responses/`)
      setResponses(result.results)
    }, 'Avaliação guardada.')
  }
  const currentClass = classes.find(c => String(c.id) === assignClass)
  const availableMaterials = materials.filter(m => m.grade === currentClass?.grade)

  const visibleAssignments = assignments.filter(a => filter === 'all' || (filter === 'pending' ? !a.my_answer : Boolean(a.my_answer)))

  return <section className="portal container">
    <div className="portal-heading"><span className="section-kicker">O TEU ESPAÇO DE APRENDIZAGEM</span><h1>{user ? `Olá, ${user.name}` : 'Bom ter-te aqui.'}</h1><p>{!user ? 'Entra para acompanhar as tuas turmas, fichas e resultados.' : user.role === 'teacher' ? 'Organiza as turmas e acompanha cada aprendizagem.' : user.role === 'student' ? 'As tuas fichas, respostas e notas, num só lugar.' : 'Tudo pronto para cuidar da tua escola.'}</p></div>
    {error && <div className="portal-alert portal-danger" role="alert">{error}</div>}
    {success && <div className="portal-alert portal-good" role="status">{success}</div>}
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
        {user.role === 'admin' && <div className="portal-panel"><h2>Administração escolar</h2><p>Cria utilizadores e atribui-lhes os grupos <b>Professor</b> ou <b>Aluno</b> na administração. O superutilizador continua reservado à gestão.</p><a className="btn btn-primary" href="/admin/" target="_blank" rel="noreferrer">Abrir administração <ExternalLink size={15}/></a></div>}
        {(user.role === 'teacher' || user.role === 'student') && <div className="workspace-bar">
          <div className="workspace-tabs" aria-label="Área de trabalho">
            <button className={workspace === 'assignments' ? 'active' : ''} aria-pressed={workspace === 'assignments'} onClick={() => {setWorkspace('assignments');setComposing(false)}}><FileText size={18}/> {user.role === 'teacher' ? 'Fichas' : 'As minhas fichas'} <span>{assignments.length}</span></button>
            {user.role === 'teacher' && <button className={workspace === 'classes' ? 'active' : ''} aria-pressed={workspace === 'classes'} onClick={() => {setWorkspace('classes');setComposing(false)}}><Users size={18}/> Turmas <span>{classes.length}</span></button>}
          </div>
          {user.role === 'teacher' && <button className="btn btn-primary" disabled={busy} onClick={() => {setComposing(true);setWorkspace('assignments')}}><Plus size={18}/> Nova ficha</button>}
        </div>}
        {user.role === 'teacher' && <>
          <div className="portal-grid">
            {workspace === 'classes' && showClassForm && <form className="portal-panel compose-panel" onSubmit={e => void addClass(e)}>
              <h2><Users size={21}/> Nova turma</h2>
              <label>Nome da turma<input value={className} required maxLength={100} onChange={e => setClassName(e.target.value)} placeholder="Ex.: Turma A"/></label>
              <label>Classe<select value={classGrade} onChange={e => setClassGrade(e.target.value)}>{[8,9,10,11,12].map(g => <option key={g} value={g}>{g}.ª classe</option>)}</select></label>
              <button className="btn btn-primary" disabled={busy}><Plus size={16}/> Criar turma</button> <button type="button" className="portal-light" onClick={() => setShowClassForm(false)}>Cancelar</button>
            </form>}
            {composing && <form className="portal-panel compose-panel" onSubmit={e => void addAssignment(e)}>
              <button type="button" className="back" onClick={() => setComposing(false)}><ArrowLeft size={16}/> Voltar às fichas</button>
              <h2>Uma nova oportunidade de aprender</h2><p>Escolhe a turma, explica a tarefa e adiciona um documento se precisares.</p>
              <label>Turma<select required value={assignClass} onChange={e => { setAssignClass(e.target.value); setDocumentMode('none'); setAssignMaterial(''); setAssignPdf(null); setFileReset(old => old + 1) }}><option value="">Seleccionar...</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name} · {c.grade}.ª classe</option>)}</select></label>
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
                {availableMaterials.length === 0 && <small className="portal-hint">Não há materiais publicados para esta classe. Escolhe «Carregar um novo PDF» ou publica primeiro um material na biblioteca.</small>}
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
          {workspace === 'classes' && <div className="portal-panel"><div className="panel-heading"><h2><GraduationCap size={21}/> As minhas turmas</h2><button className="portal-light" onClick={() => setShowClassForm(!showClassForm)}><Plus size={16}/> Nova turma</button></div>
            {classes.length === 0 ? <p>A tua primeira turma começa aqui. Selecciona «Nova turma».</p> : classes.map(c => <div className="portal-entry" key={c.id}><div><b>{c.name} · {c.grade}.ª classe</b><small>{c.student_count} aluno(s){c.students?.length ? ' · ' + c.students.map(s => s.name).join(', ') : ''}</small></div><button className="portal-light" onClick={() => setEnrollClass(enrollClass === c.id ? 0 : c.id)}>Inscrever aluno</button>{enrollClass === c.id && <form className="portal-inline" onSubmit={e => void addStudent(e)}><input placeholder="Utilizador do aluno" required value={enrollUsername} onChange={e => setEnrollUsername(e.target.value)}/><button className="btn btn-primary" disabled={busy}>Inscrever</button></form>}</div>)}
            <p className="portal-hint">Para inscrever um aluno, usa o nome de utilizador da conta criada pela escola.</p>
          </div>}
        </>}
        {(user.role === 'teacher' || user.role === 'student') && workspace === 'assignments' && !composing && <div className="portal-panel assignment-list"><h2><BookOpen size={21}/>{user.role === 'teacher' ? 'Fichas atribuídas' : 'As minhas fichas'}</h2>
          {user.role === 'student' && <div className="student-filters" aria-label="Filtrar fichas">{(['all','pending','done'] as const).map(f => <button key={f} aria-pressed={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>{f === 'all' ? 'Todas' : f === 'pending' ? 'Por fazer' : 'Entregues'}</button>)}</div>}
          {visibleAssignments.length === 0 ? <div className="empty"><FileText size={32}/><p>{user.role === 'teacher' ? 'Vamos criar a primeira ficha?' : filter === 'pending' ? 'Tudo em dia!' : 'Ainda não há fichas aqui.'}</p><small>{user.role === 'teacher' ? 'Usa o botão «Nova ficha» para começar.' : 'As fichas publicadas pelo professor aparecem neste espaço.'}</small></div> : visibleAssignments.map(a => <div className="portal-entry" key={a.id}>
            <div className="portal-title"><div><b>{a.title}</b><small>{a.class_name} · {a.grade}.ª classe · {new Date(a.created_at).toLocaleDateString('pt-PT')}</small></div>{a.my_answer && <span className="portal-status"><CheckCircle2 size={15}/> {a.my_answer.score === null ? 'Entregue' : `Avaliada · ${a.my_answer.score}/20`}</span>}{user.role === 'student' && !a.my_answer && <span className="portal-status pending"><Clock3 size={15}/> Por fazer</span>}</div>
            <p className="portal-text">{a.instructions}</p>
            {a.attachment_url && <p className="portal-material"><BookOpen size={16}/><a href={a.attachment_url} target="_blank" rel="noreferrer">Abrir PDF desta ficha <ExternalLink size={13}/></a></p>}
            {a.resource && <p className="portal-material"><BookOpen size={16}/>{a.resource.file_url ? <a href={a.resource.file_url} target="_blank" rel="noreferrer">{a.resource.title} <ExternalLink size={13}/></a> : a.resource.title}</p>}
            {a.resource?.body && <details><summary>Ler material da biblioteca</summary><p className="portal-text">{a.resource.body}</p></details>}
            {a.resource?.external_url && <p><a href={a.resource.external_url} target="_blank" rel="noreferrer">Abrir ligação online (requer Internet)</a></p>}
            {user.role === 'student' ? (a.my_answer ? <div className="portal-reply"><b>A tua resposta</b><p className="portal-text">{a.my_answer.answer}</p><small>{a.my_answer.score === null ? 'A aguardar correcção' : `Nota: ${a.my_answer.score}/20`}</small>{a.my_answer.feedback && <p>Comentário: {a.my_answer.feedback}</p>}</div> : <div className="portal-reply"><label>Responder ao professor<textarea rows={4} maxLength={8000} value={studentAnswers[a.id] || ''} onChange={e => setStudentAnswers(old => ({...old,[a.id]:e.target.value}))}/></label><button className="btn btn-primary" disabled={busy || !(studentAnswers[a.id] || '').trim()} onClick={() => void sendAnswer(a.id)}><Send size={16}/> Entregar resposta</button></div>) : <><button className="portal-light" onClick={() => void toggleResponses(a.id)}>{opened === a.id ? 'Fechar respostas' : 'Ver respostas'}</button>{opened === a.id && <div className="portal-responses">{responses.length === 0 ? <p>Os alunos ainda não entregaram.</p> : responses.map(r => <div className="portal-reply" key={r.id}><b>{r.student.name} (@{r.student.username})</b><p className="portal-text">{r.answer}</p><div className="portal-review"><label>Nota (0–20)<input type="number" step="1" min="0" max="20" value={scores[r.id] ?? ''} onChange={e => setScores(old => ({...old,[r.id]:e.target.value}))}/></label><label>Comentário<input maxLength={2000} value={feedback[r.id] ?? ''} onChange={e => setFeedback(old => ({...old,[r.id]:e.target.value}))}/></label><button className="btn btn-primary" disabled={busy || !/^\d+$/.test(scores[r.id] ?? '') || Number(scores[r.id])>20} onClick={() => void gradeAnswer(r.id,a.id)}>Guardar nota</button></div></div>)}</div>}</>}
          </div>)}
        </div>}
      </>}

  </section>
}
