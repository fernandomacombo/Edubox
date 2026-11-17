// @vitest-environment jsdom
import {afterEach,beforeEach,expect,test,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SchoolDashboard from './SchoolDashboard'
import ActivityTools from './ActivityTools'
import SchoolBulletin from './SchoolBulletin'
import Library from './Library'
import {api} from './portalApi'
vi.mock('./portalApi',()=>({api:vi.fn()}))
const mocked=vi.mocked(api)
const teacher={name:'Ana',username:'ana'},student={name:'João',username:'joao'}
beforeEach(()=>{
 mocked.mockImplementation(async(path)=>{
  if(path==='/api/school/overview/')return {classes:[{id:1,name:'8A',grade:8,teacher,student_count:1,students:[student]},{id:2,name:'8B',grade:8,teacher,student_count:0,students:[]}],teachers:[teacher,{username:'rui',name:'Rui'}],transfers:[]}
  if(path==='/api/school/library/')return {results:[],subjects:[]}
  if(path==='/api/school/notices/'||path==='/api/school/bulletin/')return {results:[]}
  return {ok:true}
 })
})
afterEach(()=>{cleanup();vi.clearAllMocks()})
test('school save visibly waits for acknowledgement and blocks duplicate submits',async()=>{
 const user=userEvent.setup();render(<SchoolDashboard username="school"/> )
 await user.click(screen.getByRole('button',{name:'Informes'}))
 await user.click(await screen.findByRole('button',{name:'Novo informe'}))
 await user.type(screen.getByLabelText('Título do informe'),'Reunião')
 await user.type(screen.getByLabelText('Texto do informe (opcional com PDF)'),'Dia 20 na escola')
 let finish!:(value:unknown)=>void
 mocked.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 const button=screen.getByRole('button',{name:'Guardar informe'}),form=button.closest('form')!
 fireEvent.submit(form);fireEvent.submit(form)
 await screen.findByText('A guardar… Aguarda a confirmação.')
 expect(button.closest('fieldset')?.disabled).toBe(true)
 expect(mocked.mock.calls.filter(([p,b])=>p==='/api/school/notices/'&&b)).toHaveLength(1)
 finish({ok:true})
 await screen.findByText('Rascunho do informe guardado.')
})
test('school transfer reviews destination before saving',async()=>{
 const user=userEvent.setup();render(<SchoolDashboard username="school"/> )
 await screen.findByRole('button',{name:'Transferências'})
 await user.click(screen.getByRole('button',{name:'Transferências'}))
 await user.selectOptions(screen.getByLabelText('Operação'),'student')
 await user.selectOptions(screen.getByLabelText('Turma de origem'),'1')
 await user.selectOptions(screen.getByLabelText('Aluno a transferir'),'joao')
 await user.selectOptions(screen.getByLabelText('Turma de destino'),'2')
 await user.type(screen.getByLabelText('Motivo / referência'),'Pedido da família')
 await user.click(screen.getByRole('button',{name:'Rever transferência'}))
 expect(mocked.mock.calls.filter(([p])=>p==='/api/school/transfer/')).toHaveLength(0)
 expect(screen.getByText('Destino: 8B · 8.ª classe')).toBeTruthy()
 await user.click(screen.getByRole('button',{name:'Confirmar transferência'}))
 await screen.findByText('Transferência concluída. O histórico foi preservado.')
 expect(mocked.mock.calls.find(([p])=>p==='/api/school/transfer/')?.[1]).toMatchObject({source_id:1,target_id:2,student:'joao',kind:'student'})
})
test('teacher closes deliveries before publishing correction',async()=>{
 const user=userEvent.setup()
 render(<ActivityTools username="ana" activity={{id:7,kind:'assessment',accepting_submissions:true}} students={[]} onSaved={async()=>{}}/> )
 await user.click(screen.getByText('Gerir actividade, grupos e correcção'))
 const publish=screen.getByLabelText('Publicar a correcção para esta turma') as HTMLInputElement
 expect(publish.disabled).toBe(true)
 await user.type(screen.getByLabelText('Resolução para a turma'),'Resposta explicada')
 await user.click(screen.getByLabelText('Aceitar entregas'));await user.click(publish)
 await user.click(screen.getByRole('button',{name:'Guardar actividade'}))
 await screen.findByText('Alterações da actividade guardadas.')
 expect(mocked).toHaveBeenCalledWith('/api/portal/assignments/7/settings/',{kind:'assessment',correction:'Resposta explicada',correction_published:true,accepting_submissions:false},'ana','teacher')
})
test('teacher creates group with selected classmates',async()=>{
 const user=userEvent.setup()
 render(<ActivityTools username="ana" activity={{id:8,kind:'group',groups:[]}} students={[student,{name:'Maria',username:'maria'}]} onSaved={async()=>{}}/> )
 await user.click(screen.getByText('Gerir actividade, grupos e correcção'))
 await user.type(screen.getByLabelText('Nome do grupo'),'Grupo 1')
 await user.click(screen.getByLabelText('João (@joao)'));await user.click(screen.getByLabelText('Maria (@maria)'))
 await user.click(screen.getByRole('button',{name:'Criar grupo'}))
 await screen.findByText('Grupo criado. Uma entrega contará para todos os membros.')
 expect(mocked).toHaveBeenCalledWith('/api/portal/assignments/8/groups/',{name:'Grupo 1',members:['joao','maria']},'ana','teacher')
})
test('library supports literature and ebooks without grade or audio category',async()=>{
 const user=userEvent.setup()
 render(<Library resources={[{id:1,title:'Contos',category:'Literatura',kind:'ebook',subject:'Leitura geral',grade:null,description:'Ler',rights_note:''},{id:2,title:'Ciências 9',category:'Ciências',kind:'book',subject:'Ciências',grade:9,description:'Estudar',rights_note:''}]} search=""/> )
 expect(screen.queryByRole('button',{name:/Áudios|Audiolivros/})).toBeNull()
 await user.selectOptions(screen.getByLabelText('Tema'),'Literatura')
 expect(screen.getByRole('heading',{name:'Contos'})).toBeTruthy()
 expect(screen.queryByRole('heading',{name:'Ciências 9'})).toBeNull()
 expect(screen.getAllByText('Leitura geral').length).toBeGreaterThan(0)
})
test('school bulletin shows published notices',async()=>{
 mocked.mockResolvedValueOnce({results:[{id:1,title:'Inscrições abertas',body:'Na secretaria.',published:true,created_at:'2026-11-17T10:00:00Z'}]})
 render(<SchoolBulletin/> )
 await screen.findByRole('heading',{name:'Inscrições abertas'})
 expect(screen.getByText('Na secretaria.')).toBeTruthy()
})
