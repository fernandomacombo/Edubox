import {useEffect,useState} from 'react'
import {ArrowLeft,ArrowRight} from 'lucide-react'

export type Viewer = {mode:'pdf'|'image'|'audio'|'video';page_count?:number;page_url?:string;stream_url?:string;viewer_label:string}
export default function MaterialViewer({viewer,title}:{viewer:Viewer;title:string}) {
 const [page,setPage]=useState(1)
 const [failed,setFailed]=useState(false)
 const [loading,setLoading]=useState(true)
 useEffect(()=>{setPage(1);setFailed(false);setLoading(true)},[viewer.page_url,viewer.stream_url])
 function changePage(next:number){setPage(next);setFailed(false);setLoading(true)}
 return <div className="material-viewer" onContextMenu={e=>e.preventDefault()} onDragStart={e=>e.preventDefault()}>
  {viewer.mode==='pdf'&&<div className="reader-controls"><button className="portal-light" disabled={page<=1} onClick={()=>changePage(page-1)}><ArrowLeft size={16}/> Anterior</button><span>Página {page} de {viewer.page_count}</span><button className="portal-light" disabled={page>=(viewer.page_count||1)} onClick={()=>changePage(page+1)}>Seguinte <ArrowRight size={16}/></button></div>}
  {(viewer.mode==='pdf'||viewer.mode==='image')&&<>
   {loading&&!failed&&<p role="status">A preparar a página…</p>}
   {failed?<p role="alert">Não foi possível carregar a página. Fecha e volta a abrir o material para tentar novamente.</p>:<img className="reader-page" key={`${viewer.page_url}:${page}`} draggable={false} src={`${viewer.page_url}?page=${page}`} alt={`${title} — página ${page}`} onLoad={()=>setLoading(false)} onError={()=>{setFailed(true);setLoading(false)}}/>}
  </>}
  {viewer.mode==='video'&&<video controls controlsList="nodownload noremoteplayback" disablePictureInPicture disableRemotePlayback preload="metadata" src={viewer.stream_url} aria-label={`Vídeo: ${title}`} onError={()=>setFailed(true)}/>}
  {viewer.mode==='audio'&&<audio controls controlsList="nodownload noremoteplayback" preload="metadata" src={viewer.stream_url} aria-label={`Áudio: ${title}`} onError={()=>setFailed(true)}/>}
  {failed&&(viewer.mode==='audio'||viewer.mode==='video')&&<p role="alert">A reprodução não está disponível. Volta a abrir o material ou pede à escola que verifique o ficheiro.</p>}
  <small className="reader-label">{viewer.viewer_label}</small>
 </div>
}
