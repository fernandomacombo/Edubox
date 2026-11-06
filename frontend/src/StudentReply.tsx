import { useRef, useState } from 'react'

const prefix = 'edubox:draft:'
const accountPrefix = (username: string) => `${prefix}${encodeURIComponent(username)}:`
export function clearStudentDrafts() {
  // Shared computers: logout removes only EduBox drafts, never unrelated storage.
  try {
    Object.keys(sessionStorage).filter(key => key.startsWith(prefix)).forEach(key => sessionStorage.removeItem(key))
  } catch { /* Storage can be disabled by the browser. */ }
}

export default function StudentReply({username, assignmentId, title, submit}: {
  username: string; assignmentId: number; title: string; submit: (answer: string) => Promise<void>
}) {
  const key = `${accountPrefix(username)}${assignmentId}`
  const [draft, setDraft] = useState(() => {
    try { return sessionStorage.getItem(key)?.slice(0, 8000) || '' } catch { return '' }
  })
  const [saved, setSaved] = useState(() => {
    try { return sessionStorage.getItem(key) !== null } catch { return false }
  })
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  function edit(value: string) {
    setDraft(value)
    try { sessionStorage.setItem(key, value); setSaved(true) } catch { setSaved(false) }
  }
  async function deliver() {
    if (lock.current || !draft.trim()) return
    lock.current = true; setBusy(true); setError('')
    try {
      await submit(draft)
      try { sessionStorage.removeItem(key) } catch { /* No stored draft. */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível entregar. A tua resposta continua aqui. Tenta novamente.')
    } finally { lock.current = false; setBusy(false) }
  }
  return <div className="portal-reply student-reply">
    {review ? <>
      <h3 tabIndex={-1} ref={heading}>Revê antes de entregar</h3>
      <p>{title}</p><p className="portal-text answer-preview">{draft}</p>
      <p>Depois de confirmares, esta resposta será enviada ao professor e já não poderá ser editada aqui.</p>
      <div className="reply-actions"><button className="portal-light" disabled={busy} onClick={() => {setReview(false); setTimeout(() => input.current?.focus(), 0)}}>Continuar a escrever</button>
      <button className="btn btn-primary" disabled={busy} onClick={() => void deliver()}>{busy ? 'A entregar…' : 'Confirmar entrega'}</button></div>
    </> : <>
      <label>Responder ao professor<textarea ref={input} rows={5} maxLength={8000} value={draft} aria-describedby={`draft-${assignmentId}`} onChange={e => edit(e.target.value)}/></label>
      <p id={`draft-${assignmentId}`} className="portal-hint">{draft ? saved ? 'Rascunho guardado neste separador. Ainda não foi entregue.' : 'Não foi possível guardar o rascunho. Mantém esta página aberta até entregares.' : 'Podes escrever com calma e rever antes de entregar.'} <span>{draft.length}/8000 caracteres</span></p>
      <button className="btn btn-primary" disabled={!draft.trim()} onClick={() => {setReview(true); setTimeout(() => heading.current?.focus(), 0)}}>Rever resposta</button>
    </>}
    {error && <p role="alert" className="portal-alert portal-danger">{error} A tua resposta continua aqui. Confirma a ligação ao Wi-Fi da EduBox e tenta novamente.</p>}
    <small>O rascunho fica apenas neste separador. Não fica guardado na tua conta. Usa «Sair» para o apagar. Não uses um computador partilhado sem terminar a sessão.</small>
  </div>
}
