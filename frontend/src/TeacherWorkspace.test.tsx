// @vitest-environment jsdom
import {afterEach, beforeEach, expect, test, vi} from 'vitest'
import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Portal from './Portal'

let role = 'teacher'
let grade: number | null
let rejectGrade: boolean
let enrollment: string
const person = {username:'ana', name:'Ana'}
const classes = [
  {id:1, name:'B2', grade:12, teacher:{username:'prof', name:'Professor'}, student_count:1, students:[person]},
  {id:2, name:'A', grade:10, teacher:{username:'prof', name:'Professor'}, student_count:0, students:[]},
]
function tasks() {
  return [
    {id:1, title:'Microssoma', instructions:'Explica o que aprendeste.', class_id:1, class_name:'B2', grade:12, created_at:'2026-11-16', resource:null, attachment_url:null, my_answer:null, response_count:1, pending_count:grade === null ? 1 : 0},
    {id:2, title:'Equações', instructions:'Resolve.', class_id:2, class_name:'A', grade:10, created_at:'2026-11-16', resource:null, attachment_url:null, my_answer:null, response_count:0, pending_count:0},
  ]
}
beforeEach(() => {
  role='teacher'; grade=null; rejectGrade=false; enrollment=''
  vi.stubGlobal('fetch', vi.fn(async (path: string, options?: RequestInit) => {
    let result: object = {}
    if (path.endsWith('/session/')) result={user:{username:role === 'teacher' ? 'prof' : 'ana',name:role === 'teacher' ? 'Professor' : 'Ana',role}}
    if (path.endsWith('/classes/')) result={results:classes}
    if (path === '/api/resources/') result={results:[]}
    if (path.endsWith('/assignments/')) result={results:tasks()}
    if (path.endsWith('/responses/')) result={results:[{id:10, student:person, answer:'Uma resposta.', score:grade, feedback:''}]}
    if (path.endsWith('/grade/')) {
      if (rejectGrade) return {ok:false,status:503,json:async()=>({error:'Falha de ligação. Tenta novamente.'})}
      grade=JSON.parse(options?.body as string).score
    }
    if (path.endsWith('/enroll/')) enrollment=JSON.parse(options?.body as string).username
    return {ok:true,json:async()=>result}
  }))
})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
async function openClass() {
  const user=userEvent.setup()
  render(<Portal />)
  await screen.findByText('Olá, Professor')
  await user.click(screen.getByRole('button',{name:/^Turmas/}))
  await user.click(screen.getByRole('button',{name:'Abrir turma B2'}))
  return user
}
test('class cards open only that class, expose roster, and preselect the class for a new task',async()=>{
  const user=await openClass()
  expect(screen.getByRole('heading',{name:'Fichas de B2'})).toBeTruthy()
  expect(screen.getByRole('heading',{name:'Microssoma'})).toBeTruthy()
  expect(screen.queryByRole('heading',{name:'Equações'})).toBeNull()
  await user.click(screen.getByRole('button',{name:/^Alunos/}))
  expect(screen.getByText('@ana')).toBeTruthy()
  await user.type(screen.getByLabelText('Pesquisar alunos'),'ninguém')
  expect(screen.queryByText('@ana')).toBeNull()
  await user.clear(screen.getByLabelText('Pesquisar alunos'))
  await user.click(screen.getByRole('button',{name:'Inscrever aluno'}))
  await user.type(screen.getByLabelText('Utilizador do aluno'),'joao')
  await user.click(screen.getByRole('button',{name:'Inscrever'}))
  await waitFor(()=>expect(enrollment).toBe('joao'))
  await user.click(screen.getByRole('button',{name:'Nova ficha'}))
  expect((screen.getByLabelText('Turma') as HTMLSelectElement).value).toBe('1')
  await user.click(screen.getByRole('button',{name:'Voltar às fichas'}))
  await user.click(screen.getByRole('button',{name:'Todas as turmas'}))
  expect(screen.getByRole('button',{name:'Abrir turma A'})).toBeTruthy()
})
test('pending evaluations open answers and saving zero removes task from pending queue',async()=>{
  const user=await openClass()
  await user.click(screen.getByRole('button',{name:/^Avaliações/}))
  await user.click(screen.getByRole('button',{name:/Microssoma/}))
  const score=await screen.findByLabelText('Nota (0–20)')
  await user.type(score,'0')
  await user.click(screen.getByRole('button',{name:'Guardar nota'}))
  await screen.findByText('Avaliação guardada.')
  expect(screen.getByText('Avaliada · 0/20')).toBeTruthy()
  expect(screen.getByRole('button',{name:'Avaliações 0'})).toBeTruthy()
  await user.click(screen.getByRole('button',{name:'Voltar às fichas'}))
  expect(screen.getByText('Não há respostas por avaliar.')).toBeTruthy()
})
test('failed grading keeps the pending count and teacher input for retry',async()=>{
  rejectGrade=true
  const user=await openClass()
  await user.click(screen.getByRole('button',{name:/^Avaliações/}))
  await user.click(screen.getByRole('button',{name:/Microssoma/}))
  const score=await screen.findByLabelText('Nota (0–20)')
  await user.type(score,'14')
  await user.click(screen.getByRole('button',{name:'Guardar nota'}))
  await screen.findByRole('alert')
  expect((score as HTMLInputElement).value).toBe('14')
  expect(screen.getByRole('button',{name:'Avaliações 1'})).toBeTruthy()
  expect(grade).toBeNull()
})
test('student combines search and classroom filters without losing a draft',async()=>{
  role='student'
  const user=userEvent.setup()
  render(<Portal />)
  await screen.findByText('Olá, Ana')
  await user.selectOptions(screen.getByLabelText('Filtrar por turma'),'1')
  await user.type(screen.getByLabelText('Pesquisar fichas'),'micro')
  expect(screen.queryByRole('heading',{name:'Equações'})).toBeNull()
  await user.click(screen.getByRole('button',{name:/Microssoma/}))
  const textarea=screen.getByRole('textbox')
  await user.type(textarea,'O meu rascunho')
  await user.click(screen.getByRole('button',{name:'Voltar ao meu espaço'}))
  expect((screen.getByLabelText('Pesquisar fichas') as HTMLInputElement).value).toBe('micro')
  await user.click(screen.getByRole('button',{name:/Microssoma/}))
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('O meu rascunho')
})
