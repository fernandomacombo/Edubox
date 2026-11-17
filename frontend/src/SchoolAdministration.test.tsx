// @vitest-environment jsdom
import {afterEach,beforeEach,expect,test,vi} from 'vitest'
import {cleanup,render,screen,waitFor,fireEvent} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SchoolAdministration,{SchoolOverview} from './SchoolAdministration'
import SchoolDashboard from './SchoolDashboard'
import SchoolBulletin from './SchoolBulletin'
import {api} from './portalApi'
vi.mock('./portalApi',()=>({api:vi.fn()}))
const mocked=vi.mocked(api)
const teacher={username:'ana',name:'Ana',first_name:'Ana',last_name:'',role:'teacher',email:'',active:true,classes:['A']}
const student={username:'joao',name:'João',first_name:'João',last_name:'',role:'student',email:'',active:true,classes:['A']}
const classroom={id:1,name:'A',grade:8,teacher,students:[student],student_count:1}
beforeEach(()=>{
 mocked.mockImplementation(async(path,body)=>{
  if(body)return {ok:true}
  if(path==='/api/school/profile/')return {school:null}
  if(path==='/api/school/people/')return {results:[teacher,student]}
  if(path==='/api/school/classes/')return {results:[classroom]}
  if(path==='/api/school/calendar/')return {results:[]}
  if(path.startsWith('/api/school/attendance/'))return {results:[{...student,state:''}],historical:[]}
  if(path==='/api/school/summary/')return {school:null,today:'2026-11-17',counts:{students:12,teachers:3,classes:2,library:8},attendance:{present:10,absent:2},events:[]}
  if(path==='/api/school/overview/')return {classes:[classroom],teachers:[teacher],transfers:[]}
  if(path==='/api/school/library/')return {results:[],subjects:[]}
  if(path==='/api/school/notices/')return {results:[]}
  return {results:[]}
 })
})
afterEach(()=>{cleanup();vi.clearAllMocks()})
test('school registration has one local profile and reports confirmed save',async()=>{
 const user=userEvent.setup();render(<SchoolAdministration section="profile" username="school" onChanged={async()=>{}}/> )
 await user.type(await screen.findByLabelText('Nome oficial da escola'),'Escola Comunitária')
 await user.type(screen.getByLabelText('Distrito / cidade'),'Vilankulo')
 await user.click(screen.getByRole('button',{name:'Registar escola'}))
 await screen.findByText('Cadastro da escola guardado.')
 expect(mocked.mock.calls.find(([p,b])=>p==='/api/school/profile/'&&b)?.[1]).toMatchObject({name:'Escola Comunitária',district:'Vilankulo'})
})
test('people form creates student with explicit role and clears secret after save',async()=>{
 const user=userEvent.setup();render(<SchoolAdministration section="people" username="school" onChanged={async()=>{}}/> )
 await user.click(await screen.findByRole('button',{name:'Nova pessoa'}))
 await user.type(screen.getByLabelText('Nome'),'Maria')
 await user.type(screen.getByLabelText('Utilizador'),'maria')
 await user.type(screen.getByLabelText('Palavra-passe inicial'),'Educacao!2837')
 await user.click(screen.getByRole('button',{name:'Guardar pessoa'}))
 await screen.findByText('Conta criada. Entrega os dados de acesso à pessoa.')
 expect(mocked.mock.calls.find(([p,b])=>p==='/api/school/people/'&&b)?.[1]).toMatchObject({username:'maria',role:'student',first_name:'Maria'})
 expect(screen.queryByLabelText('Palavra-passe inicial')).toBeNull()
})
test('attendance saves explicit marks and prevents duplicate save while pending',async()=>{
 const user=userEvent.setup();render(<SchoolAdministration section="attendance" username="school" onChanged={async()=>{}}/> )
 await user.selectOptions(await screen.findByLabelText('Turma'),'1')
 await user.selectOptions(await screen.findByLabelText('Presença de João'),'present')
 let finish!:(value:unknown)=>void
 const original=mocked.getMockImplementation()!
 mocked.mockImplementation((path,body,...rest)=>path==='/api/school/attendance/'&&body?new Promise(resolve=>{finish=resolve}):original(path,body,...rest))
 const button=screen.getByRole('button',{name:'Guardar presenças'}),form=button.closest('form')!
 fireEvent.submit(form);fireEvent.submit(form)
 await screen.findByText('A guardar… Aguarda a confirmação.')
 expect(button.closest('fieldset')?.disabled).toBe(true)
 expect(mocked.mock.calls.filter(([p,b])=>p==='/api/school/attendance/'&&b)).toHaveLength(1)
 finish({ok:true});await screen.findByText('Presenças guardadas.')
 expect(mocked.mock.calls.find(([p,b])=>p==='/api/school/attendance/'&&b)?.[1]).toMatchObject({class_id:1,marks:[{username:'joao',state:'present'}]})
})
test('calendar publishes event with date and location',async()=>{
 const user=userEvent.setup();render(<SchoolAdministration section="calendar" username="school" onChanged={async()=>{}}/> )
 await user.click(await screen.findByRole('button',{name:'Novo evento'}))
 await user.type(screen.getByLabelText('Título do evento'),'Reunião de pais')
 fireEvent.change(screen.getByLabelText('Data do evento'),{target:{value:'2026-12-10'}})
 await user.type(screen.getByLabelText('Local'),'Sala principal')
 await user.click(screen.getByLabelText('Publicar no calendário'))
 await user.click(screen.getByRole('button',{name:'Guardar evento'}))
 await screen.findByText('Evento publicado no calendário da escola.')
 expect(mocked.mock.calls.find(([p,b])=>p==='/api/school/calendar/'&&b)?.[1]).toMatchObject({title:'Reunião de pais',date:'2026-12-10',location:'Sala principal',published:true})
})
test('overview shows server counts and routes registration action',async()=>{
 const navigate=vi.fn(),user=userEvent.setup();render(<SchoolOverview version={0} onNavigate={navigate}/> )
 await screen.findByText('12')
 expect(screen.getByText('3')).toBeTruthy()
 await user.click(screen.getByRole('button',{name:'Registar a escola'}))
 expect(navigate).toHaveBeenCalledWith('profile')
})
test('official notice supports PDF without body and submits file as multipart',async()=>{
 const user=userEvent.setup();render(<SchoolDashboard username="school"/> )
 await user.click(screen.getByRole('button',{name:'Informes'}))
 await user.click(await screen.findByRole('button',{name:'Novo informe'}))
 await user.type(screen.getByLabelText('Título do informe'),'Regulamento escolar')
 await user.upload(screen.getByLabelText('Documento do informe (PDF, até 15 MB)'),new File(['%PDF-1.7'],'regulamento.pdf',{type:'application/pdf'}))
 fireEvent.submit(screen.getByRole('button',{name:'Guardar informe'}).closest('form')!)
 await screen.findByText('Rascunho do informe guardado.')
 const payload=mocked.mock.calls.find(([p,b])=>p==='/api/school/notices/'&&b)?.[1] as FormData
 expect((payload.get('file') as File).name).toBe('regulamento.pdf')
 expect(payload.get('body')).toBe('')
})
test('public school bulletin opens document through protected reader',async()=>{
 mocked.mockImplementation(async(path)=>path==='/api/school/bulletin/'?{school:{name:'Escola de Vilankulo',motto:'Aprender juntos',district:'Vilankulo',province:'Inhambane',academic_year:2026,phone:'',email:''},events:[],results:[{id:9,title:'Regulamento',body:'',published:true,created_at:'2026-11-17T10:00:00Z',has_document:true}]}:{title:'Regulamento',viewer:{mode:'pdf',page_count:1,page_url:'/api/school/notices/9/pages/',viewer_label:'Informe público'}})
 const user=userEvent.setup();render(<SchoolBulletin/> )
 await screen.findByRole('heading',{name:'Escola de Vilankulo'})
 await user.click(screen.getByRole('button',{name:'Ler documento do informe'}))
 await waitFor(()=>expect(mocked).toHaveBeenCalledWith('/api/school/notices/9/reader/'))
 expect((await screen.findByAltText('Regulamento — página 1')).getAttribute('src')).toBe('/api/school/notices/9/pages/?page=1')
})
