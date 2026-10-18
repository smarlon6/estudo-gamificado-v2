import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { api } from '../api'
import type { ContextoPainel } from '../lib/painel'
import type { Painel } from '../types'
import { Icone } from './Icone'
import type { NomeIcone } from './Icone'
import { Barra, fmt } from './ui'

const itens: { para: string; rotulo: string; icone: NomeIcone; emBreve?: boolean }[] = [
  { para: '/', rotulo: 'Início', icone: 'casa' },
  { para: '/questoes', rotulo: 'Resolver questões', icone: 'livro' },
  { para: '/simulado', rotulo: 'Simulado', icone: 'relogio', emBreve: true },
  { para: '/liga', rotulo: 'Liga e trilha', icone: 'estrela' },
  { para: '/estatisticas', rotulo: 'Estatísticas', icone: 'grafico' },
  { para: '/banco', rotulo: 'Banco de questões', icone: 'banco', emBreve: true },
]

export function Layout({ onSair }: { onSair: () => void }) {
  const [painel, setPainel] = useState<Painel | null>(null)
  const local = useLocation()

  const recarregarPainel = useCallback(() => {
    api.get<Painel>('/painel/').then(setPainel).catch(() => {})
  }, [])

  // recarrega ao trocar de página (XP, ouro e ofensiva mudam enquanto você estuda)
  useEffect(recarregarPainel, [recarregarPainel, local.pathname])

  async function sair() {
    await api.post('/auth/sair/').catch(() => {})
    onSair()
  }

  const contexto: ContextoPainel = { painel, recarregarPainel }

  return (
    <div className="flex min-h-screen flex-wrap items-stretch bg-white">
      <aside className="box-border flex flex-[1_1_240px] flex-col gap-6 border-r border-linha bg-white px-4 py-6 lg:sticky lg:top-0 lg:h-screen lg:max-w-[260px]">
        <div className="flex items-center gap-2.5 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ouro text-[#241800]">
            <Icone nome="trofeu" tamanho={22} espessura={2.2} />
          </div>
          <div className="flex flex-col leading-[1.1]">
            <span className="titulo text-xl">Estudo</span>
            <span className="titulo text-xl text-ouro-texto">Gamificado</span>
          </div>
        </div>

        <nav aria-label="Menu principal" className="flex flex-col gap-1">
          {itens.map((item) =>
            item.emBreve ? (
              <span
                key={item.para}
                aria-disabled="true"
                className="flex min-h-11 cursor-default items-center gap-3 rounded-xl px-3.5 text-[15px] font-semibold whitespace-nowrap text-menu/60"
              >
                <Icone nome={item.icone} tamanho={20} />
                {item.rotulo}
                <span className="ml-auto shrink-0 rounded-full bg-liga px-2 py-0.5 text-[10px] font-semibold text-liga-texto">
                  em breve
                </span>
              </span>
            ) : (
              <NavLink
                key={item.para}
                to={item.para}
                end={item.para === '/'}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-semibold transition-colors ${
                    isActive ? 'bg-ouro-claro text-ouro-texto' : 'text-menu hover:bg-painel'
                  }`
                }
              >
                <Icone nome={item.icone} tamanho={20} />
                {item.rotulo}
              </NavLink>
            ),
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          {painel && (
            <>
              <div className="flex items-center gap-3 rounded-2xl bg-chama-claro p-3.5">
                <Icone nome="chama" tamanho={28} className="text-chama" />
                <div className="flex flex-col">
                  <span className="titulo text-[16px]">
                    {painel.recursos.ofensiva} {painel.recursos.ofensiva === 1 ? 'dia seguido' : 'dias seguidos'}
                  </span>
                  <span className="text-xs text-sub">Recorde: {fmt(painel.recursos.ofensiva_recorde)} dias</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 rounded-2xl bg-painel p-3.5">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">{painel.usuario}</span>
                  <span className="titulo text-xp-texto">Nível {painel.nivel.nivel}</span>
                </div>
                <Barra percentual={painel.nivel.percentual} altura="h-1.5" />
                <span className="text-xs text-sub">
                  {fmt(painel.nivel.xp_no_nivel)} / {fmt(painel.nivel.xp_para_proximo)} XP
                </span>
              </div>
            </>
          )}
          <div className="flex gap-2">
            <a
              href="/admin/questoes/questao/"
              className="flex min-h-10 flex-1 items-center justify-center rounded-xl border border-linha text-xs font-semibold text-menu hover:bg-painel"
            >
              Cadastrar questões
            </a>
            <button
              type="button"
              onClick={sair}
              aria-label="Sair da conta"
              className="flex min-h-10 w-10 items-center justify-center rounded-xl border border-linha text-menu hover:bg-painel"
            >
              <Icone nome="sair" tamanho={18} />
            </button>
          </div>
        </div>
      </aside>

      <main className="box-border min-w-0 flex-[999_1_560px] px-5 py-6 sm:px-9 sm:py-7">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-[22px]">
          <Outlet context={contexto} />
        </div>
      </main>
    </div>
  )
}
