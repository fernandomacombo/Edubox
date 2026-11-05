import { useEffect, useMemo, useState } from 'react'
import Portal from './Portal'
import {
  ArrowLeft, ArrowRight, BookOpen, ChevronRight, ClipboardCheck,
  Download, ExternalLink, FileText, LockKeyhole,
  RadioTower, RefreshCw, Search, X
} from 'lucide-react'

type Subject = { id: number; name: string; grade: number; description: string; material_count: number; quiz_count: number }
type Resource = { id: number; title: string; description: string; subject: string; grade: number; file_url: string | null; external_url: string | null; body: string; rights_note: string }
type Quiz = { id: number; title: string; subject: string; grade: number; question_count: number }
type QuizDetail = { id: number; title: string; questions: { id: number; prompt: string; choices: { id: number; text: string }[] }[] }
type Result = { score: number; total: number; corrections: { question_id: number; correct: boolean; correct_choice_id: number | null; correct_text: string }[] }
type Tab = 'biblioteca' | 'testes' | 'portal'

async function getJSON<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin' })
  if (!response.ok) throw new Error('Não foi possível comunicar com a EduBox local.')
  return response.json() as Promise<T>
}

function App() {
  const [grade, setGrade] = useState<number | 'all'>('all')
  const [tab, setTab] = useState<Tab>('biblioteca')
  const [search, setSearch] = useState('')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading')
  const [loading, setLoading] = useState(true)
  const [lesson, setLesson] = useState<Resource | null>(null)
  const [activeQuiz, setActiveQuiz] = useState<QuizDetail | null>(null)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<Result | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const gradeParam = grade === 'all' ? '' : `?grade=${grade}`

  async function refresh() {
    setLoading(true)
    try {
      await getJSON('/api/health/')
      const [s, r, q] = await Promise.all([
        getJSON<{results: Subject[]}>(`/api/subjects/${gradeParam}`),
        getJSON<{results: Resource[]}>(`/api/resources/${gradeParam}`),
        getJSON<{results: Quiz[]}>(`/api/quizzes/${gradeParam}`),
      ])
      setSubjects(s.results)
      setResources(r.results)
      setQuizzes(q.results)
      setStatus('connected')
      setError('')
    } catch (e) {
      setStatus('disconnected')
      setError(e instanceof Error ? e.message : 'Erro ao contactar servidor.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [grade])

  const visibleResources = useMemo(() => resources.filter(r => `${r.title} ${r.subject} ${r.description}`.toLowerCase().includes(search.toLowerCase())), [resources, search])
  const visibleQuizzes = useMemo(() => quizzes.filter(q => `${q.title} ${q.subject}`.toLowerCase().includes(search.toLowerCase())), [quizzes, search])

  async function openQuiz(id: number) {
    setError('')
    try {
      const quiz = await getJSON<QuizDetail>(`/api/quizzes/${id}/`)
      setActiveQuiz(quiz)
      setAnswers({})
      setResult(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao carregar teste.') }
  }

  async function submit() {
    if (!activeQuiz || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await getJSON('/api/csrf/')
      const token = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/)?.[1] ?? ''
      const response = await fetch(`/api/quizzes/${activeQuiz.id}/submit/`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': decodeURIComponent(token) },
        body: JSON.stringify({ answers }),
      })
      if (!response.ok) throw new Error('Não foi possível corrigir o teste. Tenta novamente.')
      setResult(await response.json() as Result)
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao corrigir teste.') }
    finally { setSubmitting(false) }
  }

  function chooseTab(next: Tab) { setTab(next); setActiveQuiz(null); setResult(null); setError('') }

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">Saltar para o conteúdo</a>
      <header className="header">
        <div className="container nav">
          <a href="/" className="brand" aria-label="EduBox início" onClick={e => { e.preventDefault(); chooseTab('biblioteca') }}>
            <span className="brand-icon"><BookOpen size={25} strokeWidth={2.5} /></span>
            <span>Edu<span className="brand-accent">Box</span><small>A tua escola, mais perto.</small></span>
          </a>
          <nav className="links" aria-label="Navegação principal">
            <button aria-current={tab === 'biblioteca' ? 'page' : undefined} className={tab === 'biblioteca' ? 'nav-link selected' : 'nav-link'} onClick={() => chooseTab('biblioteca')}><BookOpen size={18}/> Biblioteca</button>
            <button aria-current={tab === 'testes' ? 'page' : undefined} className={tab === 'testes' ? 'nav-link selected' : 'nav-link'} onClick={() => chooseTab('testes')}><ClipboardCheck size={18}/> Exercícios</button>
            <button aria-current={tab === 'portal' ? 'page' : undefined} className={tab === 'portal' ? 'nav-link selected' : 'nav-link'} onClick={() => chooseTab('portal')}><LockKeyhole size={16}/> Meu espaço</button>
          </nav>
        </div>
      </header>

      <main id="main-content">
        {activeQuiz ? (
          <div className="container quiz-page">
            <button className="back" onClick={() => { setActiveQuiz(null); setResult(null) }}><ArrowLeft size={17}/> Voltar aos exercícios</button>
            <div className="quiz-sheet">
              <div className="tag small-tag"><ClipboardCheck size={14}/> EXERCÍCIO INTERACTIVO</div>
              <h1>{activeQuiz.title}</h1>
              <p>Escolhe uma resposta por pergunta. A correcção acontece dentro da EduBox, sem precisar da Internet.</p>
              {activeQuiz.questions.map((question, index) => {
                const correction = result?.corrections.find(c => c.question_id === question.id)
                return <div className="question" key={question.id}>
                  <div className="question-head"><span className="question-no">{String(index+1).padStart(2, '0')}</span><h3>{question.prompt}</h3></div>
                  <div className="choices">{question.choices.map(choice => (
                    <label key={choice.id} className={`choice ${answers[String(question.id)] === choice.id ? 'checked' : ''}`}>
                      <input type="radio" name={`question-${question.id}`} checked={answers[String(question.id)] === choice.id} disabled={Boolean(result)}
                        onChange={() => setAnswers(previous => ({ ...previous, [question.id]: choice.id }))}/>
                      <span>{choice.text}</span>
                    </label>
                  ))}</div>
                  {correction && <div className={correction.correct ? 'answer-feedback success' : 'answer-feedback incorrect'}>
                    {correction.correct ? 'Resposta correcta!' : `Resposta correcta: ${correction.correct_text}`}
                  </div>}
                </div>
              })}
              {result ? <div className="result"><div><span>O teu resultado</span><strong>{result.score} / {result.total}</strong></div><button className="btn btn-primary" onClick={() => { setAnswers({}); setResult(null) }}>Tentar novamente <RefreshCw size={16}/></button></div>
                : <button className="btn btn-primary" disabled={submitting || activeQuiz.questions.length === 0 || Object.keys(answers).length !== activeQuiz.questions.length} onClick={() => void submit()}>{submitting ? 'A corrigir…' : 'Corrigir as respostas'} <ArrowRight size={17}/></button>}
            </div>
          </div>
        ) : tab === 'portal' ? <Portal/> : <>
          <section className="catalog container" id="catalogo">
            <div className="section-top">
              <div><span className="section-kicker">UM POUCO TODOS OS DIAS</span><h2>{tab === 'biblioteca' ? 'O que vamos aprender hoje?' : 'Aprende com a prática'}</h2><p>{tab === 'biblioteca' ? 'Escolhe a tua classe e encontra o próximo material para estudar.' : 'Escolhe um exercício. Responde ao teu ritmo e vê o resultado.'}</p></div>
              <div className={status === 'connected' ? 'connection connected' : 'connection disconnected'}><RadioTower size={17}/>{status === 'connected' ? 'EduBox local ligada' : status === 'loading' ? 'A verificar ligação…' : 'Servidor indisponível'}</div>
            </div>
            <div className="toolbar">
              <div className="grade-list"><button aria-pressed={grade === 'all'} className={grade === 'all' ? 'grade active' : 'grade'} onClick={() => setGrade('all')}>Todas</button>{[8,9,10,11,12].map(g => <button key={g} aria-pressed={grade === g} className={grade === g ? 'grade active' : 'grade'} onClick={() => setGrade(g)}>{g}.ª classe</button>)}</div>
              <label className="search"><Search size={18}/><span className="sr-only">Procurar materiais e exercícios</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="O que procuras?" /></label>
            </div>
            {error && <div className="error-box">{error} <button onClick={() => void refresh()}><RefreshCw size={16}/> Tentar novamente</button></div>}
            <div className="list-title"><h3>{tab === 'biblioteca' ? 'Materiais disponíveis' : 'Testes disponíveis'}</h3><span>{tab === 'biblioteca' ? visibleResources.length : visibleQuizzes.length} resultados</span></div>
            {loading ? <div className="empty"><RefreshCw size={34} className="spin"/><p>A carregar conteúdos...</p></div>
              : tab === 'biblioteca' ? (visibleResources.length > 0 ? <div className="cards">{visibleResources.map(item => <article className="subject-card" key={item.id}>
                  <div className="card-top"><div className="card-icon"><FileText/></div><span className="grade-badge">{item.grade}.ª classe</span></div>
                  <div className="card-subject">{item.subject}</div><h4>{item.title}</h4><p>{item.description || 'Material educativo disponível para consulta.'}</p>
                  <div className="card-footer"><button onClick={() => setLesson(item)}>Abrir material <ChevronRight size={17}/></button>{item.file_url && <a href={item.file_url} download title="Descarregar material"><Download size={17}/></a>}</div>
                </article>)}</div> : <EmptyState message="Ainda não existem materiais publicados para esta selecção."/> )
              : (visibleQuizzes.length > 0 ? <div className="cards">{visibleQuizzes.map(item => <article className="subject-card" key={item.id}>
                <div className="card-top"><div className="card-icon quiz-icon"><ClipboardCheck/></div><span className="grade-badge">{item.grade}.ª classe</span></div>
                <div className="card-subject">{item.subject}</div><h4>{item.title}</h4><p>{item.question_count} {item.question_count === 1 ? 'pergunta' : 'perguntas'} · correcção automática</p>
                <div className="card-footer"><button onClick={() => void openQuiz(item.id)}>Começar teste <ChevronRight size={17}/></button></div>
              </article>)}</div> : <EmptyState message="Ainda não existem testes publicados para esta selecção." />)}
            {subjects.length > 0 && <div className="catalog-note"><BookOpen size={19}/><span>Os materiais guardados na EduBox abrem sem Internet. Mantém a ligação ao Wi-Fi da escola.</span></div>}
          </section>
        </>}
      </main>

      <footer><div className="container footer-content"><div className="footer-brand"><BookOpen size={23}/> EduBox</div><span>Aprender é possível em qualquer lugar.</span><span>Feito para aprender. Mesmo sem Internet.</span></div></footer>

      {lesson && <div className="modal-overlay" role="presentation" onClick={() => setLesson(null)}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="lesson-title" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><span className="grade-badge">{lesson.grade}.ª classe · {lesson.subject}</span><button aria-label="Fechar" className="close" onClick={() => setLesson(null)}><X/></button></div>
          <h2 id="lesson-title">{lesson.title}</h2><p>{lesson.description}</p>
          {lesson.body && <div className="lesson-content">{lesson.body}</div>}
          <div className="modal-actions">
            {lesson.file_url && <a className="btn btn-primary" target="_blank" rel="noreferrer" href={lesson.file_url}><FileText size={18}/> Abrir ficheiro</a>}
            {lesson.external_url && <a className="btn btn-outline-dark" target="_blank" rel="noreferrer" href={lesson.external_url}><ExternalLink size={18}/> Abrir ligação online</a>}
          </div>
          {lesson.rights_note && <small className="rights-note">Origem/licença: {lesson.rights_note}</small>}
        </div>
      </div>}
    </div>
  )
}

function EmptyState({ message }: { message: string }) { return <div className="empty"><BookOpen size={34}/><p>{message}</p><small>O professor pode adicionar conteúdos no painel de administração.</small></div> }

export default App
