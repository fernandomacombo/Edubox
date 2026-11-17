// @vitest-environment jsdom
import {afterEach,expect,test} from 'vitest'
import {cleanup,render,screen,fireEvent} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MaterialViewer from './MaterialViewer'
afterEach(cleanup)
test('PDF reader uses protected page images and provides bounded page navigation without original links',async()=>{
 const user=userEvent.setup()
 render(<MaterialViewer title="Livro" viewer={{mode:'pdf',page_count:2,page_url:'/api/resources/1/pages/',viewer_label:'EduBox | @ana'}}/>)
 expect(screen.getByRole('img').getAttribute('src')).toBe('/api/resources/1/pages/?page=1')
 expect((screen.getByRole('button',{name:'Anterior'}) as HTMLButtonElement).disabled).toBe(true)
 fireEvent.load(screen.getByRole('img'))
 await user.click(screen.getByRole('button',{name:'Seguinte'}))
 expect(screen.getByRole('img').getAttribute('src')).toBe('/api/resources/1/pages/?page=2')
 expect((screen.getByRole('button',{name:'Seguinte'}) as HTMLButtonElement).disabled).toBe(true)
 expect(screen.queryByRole('link')).toBeNull()
 fireEvent.error(screen.getByRole('img'))
 expect(screen.getByRole('alert').textContent).toContain('Não foi possível')
 await user.click(screen.getByRole('button',{name:'Anterior'}))
 expect(screen.queryByRole('alert')).toBeNull()
})
