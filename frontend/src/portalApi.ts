export type Person = { username: string; name: string }
export type Profile = Person & { role: 'admin' | 'teacher' | 'student' }

export async function api<T>(path: string, body?: object | FormData, expectedUsername?: string, expectedRole: 'student' | 'teacher' = 'student'): Promise<T> {
  if (body !== undefined) {
    const verify = await fetch('/api/portal/session/', { credentials: 'same-origin' })
    if (!verify.ok) throw new Error('Não foi possível confirmar a sessão.')
    if (expectedUsername) {
      const session = await verify.json() as {user: Profile | null}
      if (session.user?.username !== expectedUsername || session.user.role !== expectedRole) {
        throw new Error('A sessão mudou. Volta a entrar na tua conta antes de continuar.')
      }
    }
  }
  const token = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/)?.[1] || ''
  const multipart = body instanceof FormData
  const res = await fetch(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: body === undefined ? {} : multipart ? { 'X-CSRFToken': decodeURIComponent(token) } : { 'Content-Type': 'application/json', 'X-CSRFToken': decodeURIComponent(token) },
    body: body === undefined ? undefined : multipart ? body : JSON.stringify(body) })
  const result = await res.json().catch(() => ({})) as { error?: string }
  if (!res.ok) throw new Error(result.error || `Erro ${res.status}. Verifica o servidor Django.`)
  return result as T
}
