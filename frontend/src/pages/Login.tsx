import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api'
import { MensagemErro } from '../components/ui'

export function Login({ onEntrar }: { onEntrar: () => void }) {
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErro('')
    try {
      await api.post('/auth/entrar/', { usuario, senha })
      onEntrar()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div className="text-center">
        <h1 className="font-display text-4xl font-normal text-ouro-texto">Estudo Gamificado</h1>
        <p className="mt-1 text-sub">Resolva questões, ganhe XP e suba de liga.</p>
      </div>
      <form onSubmit={enviar} className="flex flex-col gap-4 rounded-3xl border border-trilho bg-card p-6 shadow-sm">
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Usuário
          <input
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            required
            className="h-12 rounded-xl border-2 border-trilho px-3 text-base font-semibold outline-none focus:border-xp"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
            className="h-12 rounded-xl border-2 border-trilho px-3 text-base font-semibold outline-none focus:border-xp"
          />
        </label>
        {erro && <MensagemErro mensagem={erro} />}
        <button
          type="submit"
          disabled={enviando}
          className="btn-jogo mt-2 h-14 rounded-2xl bg-ouro font-display text-xl text-[#241800] shadow-[0_5px_0_var(--color-ouro-sombra)] disabled:opacity-60"
        >
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
