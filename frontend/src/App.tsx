import { useEffect, useMemo, useRef, useState } from 'react'
import Portal from './Portal'
import Library from './Library'
import type {LibraryResource} from './Library'
import Notifications from './Notifications'
import {
  ArrowLeft, ArrowRight, BookOpen, ChevronRight, ClipboardCheck,
  LockKeyhole,
  RadioTower, RefreshCw, Search
} from 'lucide-react'

type Subject = { id: number; name: string; grade: number; description: string; material_count: number; quiz_count?: number }
type Resource = LibraryResource
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
  const catalogRequest=useRef(0)
  const quizRequest=useRef(0)
  const [quizGrades,setQuizGrades]=useState<number[]>([])
  const [grade, setGrade] = useState<number | 'all'>('all')
  const [tab, setTab] = useState<Tab>('biblioteca')
  const [search, setSearch] = useState('')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading')
  const [loading, setLoading] = useState(true)
  const [loginRequired, setLoginRequired] = useState(false)
  const [sessionVersion, setSessionVersion] = useState(0)
  const [activeQuiz, setActiveQuiz] = useState<QuizDetail | null>(null)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<Result | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const gradeParam = grade === 'all' ? '' : `?grade=${grade}`

  async function refresh() {
    const seq=++catalogRequest.current
    setLoading(true)
    try {
      await getJSON('/api/health/')
      const [s, r, q] = await Promise.all([
        getJSON<{results: Subject[]}>(`/api/subjects/${gradeParam}`),
        getJSON<{results: Resource[]}>(`/api/resources/${gradeParam}`),
        getJSON<{results: Quiz[]; login_required?: boolean; grades?:number[]}>(`/api/quizzes/${gradeParam}`),
      ])
      if(seq!==catalogRequest.current)return
      setSubjects(s.results)
      setResources(r.results)
      setQuizzes(q.results)
      setLoginRequired(Boolean(q.login_required))
      setQuizGrades(q.grades||[])
      setStatus('connected')
      setError('')
    } catch (e) {
      if(seq!==catalogRequest.current)return
      setQuizzes([])
      setStatus('disconnected')
      setError(e instanceof Error ? e.message : 'Erro ao contactar servidor.')
    } finally {
      if(seq===catalogRequest.current)setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [grade, tab, sessionVersion])


  const visibleQuizzes = useMemo(() => quizzes.filter(q => `${q.title} ${q.subject}`.toLowerCase().includes(search.toLowerCase())), [quizzes, search])

  async function openQuiz(id: number) {
    const seq=++quizRequest.current
    setError('')
    try {
      const quiz = await getJSON<QuizDetail>(`/api/quizzes/${id}/`)
      if(seq!==quizRequest.current)return
      setActiveQuiz(quiz)
      setAnswers({})
      setResult(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) { if(seq===quizRequest.current)setError(e instanceof Error ? e.message : 'Erro ao carregar teste.') }
  }

  async function submit() {
    if (!activeQuiz || submitting) return
    const seq=quizRequest.current
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
      const graded=await response.json() as Result
      if(seq===quizRequest.current)setResult(graded)
    } catch (e) { if(seq===quizRequest.current)setError(e instanceof Error ? e.message : 'Erro ao corrigir teste.') }
    finally { setSubmitting(false) }
  }

  function chooseTab(next: Tab) { quizRequest.current+=1; if(next===tab){setActiveQuiz(null);setResult(null);setError('');void refresh();return} catalogRequest.current+=1; if(next==='testes')setGrade('all'); setQuizzes([]); setTab(next); setActiveQuiz(null); setResult(null); setError('') }

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
          <Notifications key={sessionVersion}/>
        </div>
      </header>

      <main id="main-content">
        {activeQuiz ? (
          <div className="container quiz-page">
            <button className="back" onClick={() => { setActiveQuiz(null); setResult(null) }}><ArrowLeft size={17}/> Voltar aos exercícios</button>
            <div className="quiz-sheet">
              {error && <div className="error-box" role="alert">{error}</div>}
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
        ) : tab === 'portal' ? <Portal onSessionChange={() => {catalogRequest.current+=1;quizRequest.current+=1;setSessionVersion(v=>v+1);setQuizzes([]);setActiveQuiz(null);setResult(null)}}/> : <>
          <section className="catalog container" id="catalogo">
            <div className="section-top">
              <div><span className="section-kicker">UM POUCO TODOS OS DIAS</span><h2>{tab === 'biblioteca' ? 'Conhecimento para descobrir.' : 'Aprende com a prática'}</h2><p>{tab === 'biblioteca' ? 'Livros, pesquisas, vídeos e muito mais, num só lugar.' : 'Exercícios autorizados para as tuas turmas. As outras turmas mantêm o seu espaço privado.'}</p></div>
              <div className={status === 'connected' ? 'connection connected' : 'connection disconnected'}><RadioTower size={17}/>{status === 'connected' ? 'EduBox local ligada' : status === 'loading' ? 'A verificar ligação…' : 'Servidor indisponível'}</div>
            </div>
            {(tab === 'biblioteca' || !loginRequired) && <div className="toolbar">
              <div className="grade-list"><button aria-pressed={grade === 'all'} className={grade === 'all' ? 'grade active' : 'grade'} onClick={() => setGrade('all')}>Todas</button>{(tab === 'biblioteca' ? [8,9,10,11,12] : quizGrades).map(g => <button key={g} aria-pressed={grade === g} className={grade === g ? 'grade active' : 'grade'} onClick={() => setGrade(g)}>{g}.ª classe</button>)}</div>
              <label className="search"><Search size={18}/><span className="sr-only">Procurar materiais e exercícios</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="O que procuras?" /></label>
            </div>}
            {error && <div className="error-box">{error} <button onClick={() => void refresh()}><RefreshCw size={16}/> Tentar novamente</button></div>}
            {tab === 'testes' && <div className="list-title"><h3>Exercícios das minhas turmas</h3><span>{visibleQuizzes.length} resultados</span></div>}
            {loading ? <div className="empty"><RefreshCw size={34} className="spin"/><p>A carregar conteúdos...</p></div>
              : tab === 'biblioteca' ? <Library resources={resources} search={search} onLogin={()=>chooseTab('portal')}/>
              : loginRequired ? <div className="empty"><LockKeyhole size={32}/><p>Entra para ver os exercícios da tua turma.</p><button className="btn btn-primary" onClick={()=>chooseTab('portal')}>Entrar no meu espaço</button></div>
              : (visibleQuizzes.length > 0 ? <div className="cards">{visibleQuizzes.map(item => <article className="subject-card" key={item.id}>
                <div className="card-top"><div className="card-icon quiz-icon"><ClipboardCheck/></div><span className="grade-badge">{item.grade}.ª classe</span></div>
                <div className="card-subject">{item.subject}</div><h4>{item.title}</h4><p>{item.question_count} {item.question_count === 1 ? 'pergunta' : 'perguntas'} · correcção automática</p>
                <div className="card-footer"><button onClick={() => void openQuiz(item.id)}>Começar teste <ChevronRight size={17}/></button></div>
              </article>)}</div> : <EmptyState message="Não há exercícios atribuídos às tuas turmas nesta selecção." />)}
            {subjects.length > 0 && <div className="catalog-note"><BookOpen size={19}/><span>Os materiais guardados na EduBox abrem sem Internet. Mantém a ligação ao Wi-Fi da escola.</span></div>}
          </section>
        </>}
      </main>

      <footer><div className="container footer-content"><div className="footer-brand"><BookOpen size={23}/> EduBox</div><span>Aprender é possível em qualquer lugar.</span><span>Feito para aprender. Mesmo sem Internet.</span></div></footer>


    </div>
  )
}

function EmptyState({ message }: { message: string }) { return <div className="empty"><BookOpen size={34}/><p>{message}</p><small>Os exercícios aparecem quando forem atribuídos à tua turma.</small></div> }

export default App
