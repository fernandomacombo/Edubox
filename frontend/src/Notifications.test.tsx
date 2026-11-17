// @vitest-environment jsdom
import {afterEach,beforeEach,expect,test,vi} from 'vitest'
import {cleanup,render,screen,waitFor,act} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Notifications from './Notifications'
let role='student', unread=1
let sent:Record<string,unknown>[]
let fail=false
beforeEach(()=>{
 role='student';unread=1;sent=[];fail=false
 vi.stubGlobal('fetch',vi.fn(async(path:string,options?:RequestInit)=>{
  let result:object={}
  if(path.endsWith('/session/'))result={user:{username:role==='teacher'?'prof':'ana',name:'Utilizador',role}}
  if(path.endsWith('/classes/'))result={results:[{id:1,name:'8A',grade:8}]}
  if(path.endsWith('/announcements/')){
   if(options?.method==='POST'){
    if(fail)return {ok:false,status:503,json:async()=>({error:'Ligação indisponível.'})}
    sent.push(JSON.parse(options.body as string));result={ok:true,id:1}
   }else result={unread_count:role==='student'?unread:0,results:[{id:1,title:'Trazer o caderno',body:'Aula prática amanhã.',author:{name:'Professor'},class_names:['8A'],created_at:'2026-11-16',read:unread===0||role==='teacher'}]}
  }
  if(path.endsWith('/read/')){unread=0;result={ok:true}}
  return {ok:true,json:async()=>result}
 }))
})
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers()})
test('student sees unread badge, marks notice read and cannot compose',async()=>{
 const user=userEvent.setup();render(<Notifications/> )
 await user.click(await screen.findByRole('button',{name:'Notificações, 1 não lidas'}))
 expect(screen.getByText('Trazer o caderno')).toBeTruthy()
 expect(screen.queryByRole('button',{name:'Novo anúncio'})).toBeNull()
 await user.click(screen.getByRole('button',{name:'Marcar como lido'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'Notificações'})).toBeTruthy())
})
test('teacher chooses a classroom or all own classrooms; failed publish preserves text',async()=>{
 role='teacher';const user=userEvent.setup();render(<Notifications/>)
 await user.click(await screen.findByRole('button',{name:'Notificações'}))
 await user.click(screen.getByRole('button',{name:'Novo anúncio'}))
 await user.selectOptions(screen.getByLabelText('Destinatários'),'1')
 await user.type(screen.getByLabelText('Título do anúncio'),'Aviso de aula')
 await user.type(screen.getByLabelText('Mensagem'),'Trazer o livro.')
 fail=true
 await user.click(screen.getByRole('button',{name:'Publicar anúncio'}))
 await screen.findByRole('alert')
 expect((screen.getByLabelText('Mensagem') as HTMLTextAreaElement).value).toBe('Trazer o livro.')
 fail=false
 await user.click(screen.getByRole('button',{name:'Publicar anúncio'}))
 await waitFor(()=>expect(sent).toHaveLength(1))
 expect(sent[0]).toMatchObject({audience:'class',class_id:1})
 await user.click(screen.getByRole('button',{name:'Novo anúncio'}))
 await user.selectOptions(screen.getByLabelText('Destinatários'),'all')
 await user.type(screen.getByLabelText('Título do anúncio'),'Todas as turmas')
 await user.type(screen.getByLabelText('Mensagem'),'Aviso geral.')
 await user.click(screen.getByRole('button',{name:'Publicar anúncio'}))
 await waitFor(()=>expect(sent).toHaveLength(2))
 expect(sent[1]).toMatchObject({audience:'all'})
 expect(sent[1]).not.toHaveProperty('class_id')
})
test('polling updates unread badge while the app remains open',async()=>{
 vi.useFakeTimers();render(<Notifications/>)
 await act(async()=>{await vi.advanceTimersByTimeAsync(0)})
 expect(screen.getByRole('button',{name:'Notificações, 1 não lidas'})).toBeTruthy()
 unread=2
 await act(async()=>{await vi.advanceTimersByTimeAsync(30000)})
 expect(screen.getByRole('button',{name:'Notificações, 2 não lidas'})).toBeTruthy()
})
