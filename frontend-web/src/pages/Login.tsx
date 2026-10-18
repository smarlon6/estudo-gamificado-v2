import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api'
import { Icone } from '../components/Icone'
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

  const campo = 'h-12 rounded-xl border-2 border-linha px-3.5 text-base outline-none focus:border-xp'

  return (
    <div className="flex min-h-screen flex-wrap bg-white">
      <section className="flex flex-[1_1_420px] flex-col justify-center gap-6 bg-liga px-10 py-14 sm:px-16">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ouro text-[#241800]">
          <Icone nome="trofeu" tamanho={30} espessura={2.2} />
        </div>
        <h1 className="titulo m-0 max-w-[14ch] text-[44px] leading-[1.1]">
          Estude resolvendo questões. <span className="text-ouro-texto">Suba de liga.</span>
        </h1>
        <ul className="m-0 flex max-w-md list-none flex-col gap-3 p-0 text-[15px] text-liga-texto">
          <li className="flex items-center gap-3"><Icone nome="raio" tamanho={20} className="text-xp-texto" /> XP e combo a cada acerto</li>
          <li className="flex items-center gap-3"><Icone nome="chama" tamanho={20} className="text-chama" /> Meta diária e ofensiva</li>
          <li className="flex items-center gap-3"><Icone nome="repetir" tamanho={20} className="text-erro-texto" /> Seus erros voltam na hora certa</li>
        </ul>
      </section>
      <section className="flex flex-[1_1_420px] items-center justify-center px-6 py-14">
        <form onSubmit={enviar} className="flex w-full max-w-sm flex-col gap-4">
          <h2 className="titulo m-0 text-2xl">Entrar</h2>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Usuário
            <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoFocus required className={campo} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Senha
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required className={campo} />
          </label>
          {erro && <MensagemErro mensagem={erro} />}
          <button
            type="submit"
            disabled={enviando}
            className="btn-jogo titulo mt-2 h-14 rounded-2xl bg-ouro text-lg text-[#241800] shadow-[0_5px_0_var(--color-ouro-sombra)] disabled:opacity-60"
          >
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </div>
  )
}
