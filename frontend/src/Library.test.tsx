// @vitest-environment jsdom
import {afterEach,beforeEach,expect,test,vi} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Library from './Library'
import type {LibraryResource} from './Library'
const base={description:'Material de estudo',subject:'Ciências',grade:9,has_file:false,has_text:false,has_external:false,rights_note:'Biblioteca escolar'}
const items:LibraryResource[]=[
 {...base,id:1,title:'Livro da nona',kind:'book',author:'Maria',has_text:true},
 {...base,id:2,title:'Pesquisa sobre água',kind:'research',subject:'Geografia',has_text:true},
 {...base,id:3,title:'Leitura em voz alta',kind:'audiobook',has_file:true,file_format:'mp3'},
 {...base,id:4,title:'Vídeo sobre células',kind:'video',has_file:true,file_format:'mp4'},
 {...base,id:5,title:'Museu online',kind:'other',has_external:true},
]
beforeEach(()=>{
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>({ok:true,json:async()=>path.includes('/3/')?{viewer:{mode:'audio',stream_url:'/media/livro.mp3?access=test',viewer_label:'EduBox | @ana'}}:{viewer:{mode:'video',stream_url:'/media/celulas.mp4?access=test',viewer_label:'EduBox | @ana'}}})))
 HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.setAttribute('open','')})
 HTMLDialogElement.prototype.close=vi.fn(function(this:HTMLDialogElement){this.removeAttribute('open')})
})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
test('library categories and discipline filters keep published research separate from books',async()=>{
 const user=userEvent.setup();render(<Library resources={items} search=""/>)
 await user.click(screen.getByRole('button',{name:/^Pesquisas/}))
 expect(screen.getByRole('heading',{name:'Pesquisa sobre água'})).toBeTruthy()
 expect(screen.queryByRole('heading',{name:'Livro da nona'})).toBeNull()
 await user.selectOptions(screen.getByLabelText('Disciplina'),'Ciências')
 expect(screen.getByText('Nenhum material nesta selecção.')).toBeTruthy()
 await user.click(screen.getByRole('button',{name:'Todos os materiais'}))
 expect(screen.getByRole('heading',{name:'Livro da nona'})).toBeTruthy()
 await user.selectOptions(screen.getByLabelText('Disponibilidade'),'local')
 expect(screen.queryByRole('heading',{name:'Museu online'})).toBeNull()
})
test('search includes authors and reader supports local audio and video',async()=>{
 const user=userEvent.setup()
 const {rerender}=render(<Library resources={items} search="Maria"/>)
 expect(screen.getByRole('heading',{name:'Livro da nona'})).toBeTruthy()
 expect(screen.queryByRole('heading',{name:'Vídeo sobre células'})).toBeNull()
 rerender(<Library resources={items} search=""/>)
 await user.click(screen.getByRole('button',{name:'Abrir Leitura em voz alta'}))
 expect((await screen.findByLabelText('Áudio: Leitura em voz alta')).getAttribute('src')).toBe('/media/livro.mp3?access=test')
 await user.click(screen.getByRole('button',{name:'Fechar material'}))
 await user.click(screen.getByRole('button',{name:'Abrir Vídeo sobre células'}))
 expect((await screen.findByLabelText('Vídeo: Vídeo sobre células')).getAttribute('src')).toBe('/media/celulas.mp4?access=test')
 expect(screen.getByText('Origem / licença: Biblioteca escolar')).toBeTruthy()
 expect(screen.queryByRole('link',{name:/Descarregar|Abrir ficheiro/})).toBeNull()
 expect(screen.getByLabelText('Vídeo: Vídeo sobre células').getAttribute('controlslist')).toContain('nodownload')
})
