// @vitest-environment jsdom
import {afterEach,beforeEach,expect,test,vi} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
let signedIn=false
beforeEach(()=>{
 signedIn=false
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>{
  let data:object={}
  if(path.includes('/login/'))signedIn=true
  if(path.includes('/logout/'))signedIn=false
  if(path.includes('/session/')||path.includes('/login/'))data={user:signedIn?{username:'ana',name:'Ana',role:'student'}:null}
  if(path.includes('/subjects/'))data={results:[]}
  if(path.includes('/resources/'))data={results:[{id:1,title:'Livro da nona',subject:'Ciências',grade:9,kind:'book',has_text:true,description:'Consulta',rights_note:''}]}
  if(path.includes('/quizzes/'))data={login_required:!signedIn,grades:signedIn?[8]:[],results:signedIn?[{id:1,title:'Exercício da minha turma',subject:'Ciências',grade:8,question_count:1}]:[]}
  if(path.includes('/classes/'))data={results:[{id:1,name:'8A',grade:8,student_count:1}]}
  if(path.includes('/assignments/'))data={results:[]}
  if(path.includes('/announcements/'))data={results:[],unread_count:0}
  return {ok:true,json:async()=>data}
 }))
})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
test('catalogue stays cross-grade while exercises require login and show only authorised grades after login',async()=>{
 const user=userEvent.setup();render(<App/>)
 await screen.findByRole('heading',{name:'Livro da nona'})
 expect(screen.getByRole('button',{name:'9.ª classe'})).toBeTruthy()
 await user.click(screen.getByRole('button',{name:'Exercícios'}))
 await user.click(await screen.findByRole('button',{name:'Entrar no meu espaço'}))
 await user.type(await screen.findByLabelText('Utilizador'),'ana')
 await user.type(screen.getByLabelText('Palavra-passe'),'demo')
 await user.click(screen.getByRole('button',{name:'Entrar'}))
 await screen.findByRole('heading',{name:'Olá, Ana'})
 await user.click(screen.getByRole('button',{name:'Exercícios'}))
 await screen.findByRole('heading',{name:'Exercício da minha turma'})
 expect(screen.queryByRole('button',{name:'9.ª classe'})).toBeNull()
 expect(screen.getByRole('button',{name:'8.ª classe'})).toBeTruthy()
 await user.click(screen.getByRole('button',{name:'Exercícios'}))
 await screen.findByRole('heading',{name:'Exercício da minha turma'})
 await user.click(screen.getByRole('button',{name:'Biblioteca'}))
 await screen.findByRole('heading',{name:'Livro da nona'})
})
