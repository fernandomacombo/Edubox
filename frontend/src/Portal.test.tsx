// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Portal from './Portal'

let published: FormData[]
beforeEach(() => {
  published = []
  vi.stubGlobal('fetch', vi.fn(async (path: string, options?: RequestInit) => {
    let result: object = {}
    if (path.endsWith('/session/')) result = { user: {username:'prof',name:'Professor',role:'teacher'} }
    if (path.endsWith('/classes/')) result = {results:[{id:1,name:'B2',grade:12,teacher:{username:'prof',name:'Professor'},student_count:0},{id:2,name:'A',grade:10,teacher:{username:'prof',name:'Professor'},student_count:0}]}
    if (path === '/api/resources/') result = {results:[{id:5,title:'Microssoma',grade:12,subject:'Biologia'}]}
    if (path.endsWith('/assignments/')) {
      if (options?.method === 'POST') published.push(options.body as FormData)
      result = {results:[]}
    }
    return {ok:true,json:async()=>result}
  }))
})
afterEach(() => {cleanup();vi.unstubAllGlobals()})
async function form() {
  const user = userEvent.setup()
  render(<Portal />)
  await screen.findByText('Olá, Professor')
  await user.click(screen.getByRole('button',{name:'Nova ficha'}))
  await user.selectOptions(screen.getByLabelText('Turma'), '1')
  await user.type(screen.getByLabelText('Título'), 'Ficha')
  await user.type(screen.getByLabelText('Instruções'), 'Responder às perguntas')
  return user
}
test('three document modes publish only their selected source and clear previous choice', async()=>{
  const user = await form()
  const mode = screen.getByLabelText('Como queres disponibilizar o documento?')
  await user.selectOptions(mode,'existing')
  await user.selectOptions(screen.getByLabelText('Escolher documento existente'),'5')
  await user.selectOptions(mode,'upload')
  await user.upload(screen.getByLabelText('Carregar novo PDF (até 15 MB)'),new File(['%PDF-1.7'],'ficha.pdf',{type:'application/pdf'}))
  await user.selectOptions(mode,'none')
  await user.click(screen.getByRole('button',{name:'Publicar'}))
  await waitFor(()=>expect(published).toHaveLength(1))
  expect(published[0].get('document_mode')).toBe('none')
  expect(published[0].has('file')).toBe(false)
  expect(published[0].has('resource_id')).toBe(false)
})
test('existing document sends resource ID without upload',async()=>{
  const user = await form()
  await user.selectOptions(screen.getByLabelText('Como queres disponibilizar o documento?'),'existing')
  await user.selectOptions(screen.getByLabelText('Escolher documento existente'),'5')
  await user.click(screen.getByRole('button',{name:'Publicar'}))
  await waitFor(()=>expect(published).toHaveLength(1))
  expect(published[0].get('resource_id')).toBe('5')
  expect(published[0].has('file')).toBe(false)
})
test('PDF upload sends file and resets form after success',async()=>{
  const user = await form()
  await user.selectOptions(screen.getByLabelText('Como queres disponibilizar o documento?'),'upload')
  await user.upload(screen.getByLabelText('Carregar novo PDF (até 15 MB)'),new File(['%PDF-1.7'],'ficha.pdf',{type:'application/pdf'}))
  // jsdom does not update native required-file validity for userEvent's FileList.
  expect((screen.getByLabelText('Carregar novo PDF (até 15 MB)') as HTMLInputElement).files?.length).toBe(1)
  fireEvent.submit(screen.getByRole('button',{name:'Publicar'}).closest('form')!)
  await screen.findByText('Ficha atribuída à turma.')
  expect((published[0].get('file') as File).name).toBe('ficha.pdf')
  expect(published[0].has('resource_id')).toBe(false)
  await user.click(screen.getByRole('button',{name:'Nova ficha'}))
  expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('')
  expect((screen.getByLabelText('Como queres disponibilizar o documento?') as HTMLSelectElement).value).toBe('none')
})
test('changing classroom clears previous document selection',async()=>{
  const user = await form()
  await user.selectOptions(screen.getByLabelText('Como queres disponibilizar o documento?'),'existing')
  await user.selectOptions(screen.getByLabelText('Escolher documento existente'),'5')
  await user.selectOptions(screen.getByLabelText('Turma'),'2')
  expect((screen.getByLabelText('Como queres disponibilizar o documento?') as HTMLSelectElement).value).toBe('none')
  await user.selectOptions(screen.getByLabelText('Como queres disponibilizar o documento?'),'existing')
  expect(screen.queryByRole('option',{name:'Biologia — Microssoma'})).toBeNull()
  await user.click(screen.getByRole('button',{name:'Publicar'}))
  expect(published).toHaveLength(0)
})

test('teacher sees a quiet workspace before opening a form',async()=>{
  const user=userEvent.setup()
  render(<Portal />)
  await screen.findByText('Olá, Professor')
  expect(screen.queryByLabelText('Título')).toBeNull()
  expect(screen.queryByLabelText('Nome da turma')).toBeNull()
  await user.click(screen.getByRole('button',{name:/Turmas/}))
  await user.click(screen.getByRole('button',{name:'Nova turma'}))
  expect(screen.getByLabelText('Nome da turma')).toBeTruthy()
  await user.click(screen.getByRole('button',{name:'Cancelar'}))
  expect(screen.queryByLabelText('Nome da turma')).toBeNull()
  await user.click(screen.getByRole('button',{name:'Nova ficha'}))
  expect(screen.getByLabelText('Título')).toBeTruthy()
  await user.click(screen.getByRole('button',{name:'Voltar às fichas'}))
  expect(screen.queryByLabelText('Título')).toBeNull()
})
