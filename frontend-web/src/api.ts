// Cliente da API Django. Usa sessão (cookie) + token CSRF nos POSTs.

function lerCookie(nome: string): string | null {
  const item = document.cookie.split('; ').find((c) => c.startsWith(nome + '='))
  return item ? decodeURIComponent(item.split('=')[1]) : null
}

export class ApiError extends Error {
  status: number
  constructor(mensagem: string, status: number) {
    super(mensagem)
    this.status = status
  }
}

async function requisicao<T>(metodo: 'GET' | 'POST', url: string, corpo?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (metodo === 'POST') {
    headers['Content-Type'] = 'application/json'
    headers['X-CSRFToken'] = lerCookie('csrftoken') ?? ''
  }
  const resp = await fetch(`/api${url}`, {
    method: metodo,
    headers,
    credentials: 'same-origin',
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  })
  const dados = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    throw new ApiError(dados.erro ?? dados.detail ?? `Erro ${resp.status}`, resp.status)
  }
  return dados as T
}

export const api = {
  get: <T>(url: string) => requisicao<T>('GET', url),
  post: <T>(url: string, corpo: unknown = {}) => requisicao<T>('POST', url, corpo),
}
