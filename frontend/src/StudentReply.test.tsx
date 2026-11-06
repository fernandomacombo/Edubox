// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StudentReply, { clearStudentDrafts } from './StudentReply'
import Portal from './Portal'

beforeEach(() => sessionStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const props = {username:'ana', assignmentId:1, title:'Ficha de Biologia'}
function write(value = 'A minha resposta') {
  fireEvent.change(screen.getByRole('textbox'), {target:{value}})
}
test('draft survives remount, but stays separate for each account and assignment', () => {
  const submit = vi.fn()
  const view = render(<StudentReply {...props} submit={submit}/>); write()
  view.unmount()
  const restored = render(<StudentReply {...props} submit={submit}/>)
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('A minha resposta')
  restored.unmount()
  const other = render(<StudentReply {...props} username="rui" submit={submit}/>)
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('')
  other.unmount()
  render(<StudentReply {...props} assignmentId={2} submit={submit}/>)
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('')
})
test('review requires explicit confirmation and permits editing with keyboard focus', async () => {
  const user = userEvent.setup(), submit = vi.fn().mockResolvedValue(undefined)
  render(<StudentReply {...props} submit={submit}/>); write()
  await user.click(screen.getByRole('button',{name:'Rever resposta'}))
  expect(submit).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button',{name:'Continuar a escrever'}))
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox')))
  write('Resposta revista')
  await user.click(screen.getByRole('button',{name:'Rever resposta'}))
  await user.click(screen.getByRole('button',{name:'Confirmar entrega'}))
  expect(submit).toHaveBeenCalledWith('Resposta revista')
  expect(sessionStorage.getItem('edubox:draft:ana:1')).toBeNull()
})
test('network failure keeps the draft and allows retry without duplicate clicks', async () => {
  const user = userEvent.setup()
  let reject!: (reason: Error) => void
  const submit = vi.fn().mockImplementationOnce(() => new Promise((_, r) => { reject = r })).mockResolvedValue(undefined)
  render(<StudentReply {...props} submit={submit}/>); write()
  await user.click(screen.getByRole('button',{name:'Rever resposta'}))
  await user.dblClick(screen.getByRole('button',{name:'Confirmar entrega'}))
  expect(submit).toHaveBeenCalledTimes(1)
  reject(new Error('Ligação interrompida.'))
  await screen.findByRole('alert')
  expect(sessionStorage.getItem('edubox:draft:ana:1')).toBe('A minha resposta')
  await user.click(screen.getByRole('button',{name:'Confirmar entrega'}))
  expect(submit).toHaveBeenCalledTimes(2)
})
test('blocked storage shows a truthful warning and still allows delivery', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {throw new Error('quota')})
  const user = userEvent.setup(), submit = vi.fn().mockResolvedValue(undefined)
  render(<StudentReply {...props} submit={submit}/>); write()
  expect(screen.getByText(/Não foi possível guardar o rascunho/)).toBeTruthy()
  await user.click(screen.getByRole('button',{name:'Rever resposta'}))
  await user.click(screen.getByRole('button',{name:'Confirmar entrega'}))
  expect(submit).toHaveBeenCalledTimes(1)
})
test('whitespace cannot be submitted and logout cleanup preserves unrelated storage', () => {
  sessionStorage.setItem('other-app','keep')
  render(<StudentReply {...props} submit={vi.fn()}/>); write('   ')
  expect((screen.getByRole('button',{name:'Rever resposta'}) as HTMLButtonElement).disabled).toBe(true)
  clearStudentDrafts()
  expect(sessionStorage.getItem('edubox:draft:ana:1')).toBeNull()
  expect(sessionStorage.getItem('other-app')).toBe('keep')
})
function studentApi() {
  const assignment = {title:'Biologia',created_at:'2026-11-06',class_name:'B2',grade:12,instructions:'Responde',resource:null,attachment_url:null}
  const mock = vi.fn(async (path: string) => {
    const result = path.endsWith('/session/') ? {user:{username:'ana',name:'Ana',role:'student'}} : path.endsWith('/assignments/') ? {results:[{...assignment,id:1,my_answer:null},{...assignment,id:2,title:'Entregue',my_answer:{answer:'Feito',score:null,feedback:''}},{...assignment,id:3,title:'Corrigida',my_answer:{answer:'Completo',score:0,feedback:'Vamos rever juntos'}}]} : {results:[]}
    return {ok:true,json:async()=>result}
  })
  vi.stubGlobal('fetch', mock)
  return mock
}
test('student filters separate pending, awaiting and graded including a zero grade', async () => {
  studentApi(); const user = userEvent.setup(); render(<Portal/>)
  await screen.findByText('Biologia')
  await user.click(screen.getByRole('button',{name:'A aguardar avaliação'}))
  expect(screen.queryByText('Biologia')).toBeNull(); expect(screen.queryByText('Corrigida')).toBeNull()
  await user.click(screen.getByRole('button',{name:'Avaliadas'}))
  expect(screen.getByText('Nota: 0/20')).toBeTruthy()
  await user.click(screen.getByRole('button',{name:'Por fazer'}))
  expect(screen.getByRole('textbox')).toBeTruthy()
  expect(screen.queryByText('Corrigida')).toBeNull()
})
test('portal delivery shows the accepted answer and logout clears saved drafts', async () => {
  const fetchMock = studentApi(), user = userEvent.setup(); render(<Portal/>)
  await screen.findByText('Biologia'); write()
  await user.click(screen.getByRole('button',{name:'Rever resposta'}))
  await user.click(screen.getByRole('button',{name:'Confirmar entrega'}))
  await screen.findByText(/Resposta entregue ao professor/)
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(fetchMock.mock.calls.filter(([path]) => path.endsWith('/submit/'))).toHaveLength(1)
  sessionStorage.setItem('edubox:draft:ana:99','Rascunho')
  await user.click(screen.getByRole('button',{name:'Sair'}))
  await screen.findByRole('heading',{name:'Entrar na EduBox'})
  expect(sessionStorage.getItem('edubox:draft:ana:99')).toBeNull()
})

test('a changed session cannot send the previous pupil draft as another pupil', async () => {
  const mock = studentApi(), user = userEvent.setup(); render(<Portal/>)
  await screen.findByText('Biologia'); write()
  await user.click(screen.getByRole('button',{name:'Rever resposta'}))
  mock.mockImplementation(async () => ({ok:true,json:async()=>({user:{username:'rui',name:'Rui',role:'student'}})}))
  await user.click(screen.getByRole('button',{name:'Confirmar entrega'}))
  expect((await screen.findByRole('alert')).textContent).toContain('A sessão mudou')
  expect(mock.mock.calls.filter(([path]) => path.endsWith('/submit/'))).toHaveLength(0)
  expect(sessionStorage.getItem('edubox:draft:ana:1')).toBe('A minha resposta')
})
