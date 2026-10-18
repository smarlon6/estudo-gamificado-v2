import { NavLink, Outlet } from 'react-router-dom'
import { Icone } from './Icone'
import type { NomeIcone } from './Icone'

const itens: { para: string; rotulo: string; icone: NomeIcone }[] = [
  { para: '/', rotulo: 'Início', icone: 'casa' },
  { para: '/jogar', rotulo: 'Questões', icone: 'livro' },
  { para: '/liga', rotulo: 'Liga', icone: 'trofeu' },
  { para: '/estatisticas', rotulo: 'Estatísticas', icone: 'grafico' },
]

export function Layout() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <main className="flex-1 px-4 pt-5 pb-28">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 border-t border-trilho bg-card">
        <div className="mx-auto grid max-w-md grid-cols-4 px-1.5 pt-2 pb-4">
          {itens.map((item) => (
            <NavLink
              key={item.para}
              to={item.para}
              end={item.para === '/'}
              className={({ isActive }) =>
                `flex min-h-11 flex-col items-center gap-0.5 py-1.5 text-[11px] ${
                  isActive ? 'font-extrabold text-ouro-texto' : 'font-bold text-sub'
                }`
              }
            >
              <Icone nome={item.icone} tamanho={24} />
              {item.rotulo}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
