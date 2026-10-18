import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { Icone } from '../components/Icone'
import { ModalRecompensa } from '../components/ModalRecompensa'
import { Barra, Card, Carregando, MensagemErro, Titulo } from '../components/ui'
import type { Painel } from '../types'

const fmt = (n: number) => n.toLocaleString('pt-BR')

export function Inicio() {
  const [painel, setPainel] = useState<Painel | null>(null)
  const [erro, setErro] = useState('')
  const [modalAberto, setModalAberto] = useState(false)

  const carregar = useCallback(() => {
    api.get<Painel>('/painel/').then(setPainel).catch((e) => setErro(e.message))
  }, [])

  useEffect(carregar, [carregar])

  if (erro) return <MensagemErro mensagem={erro} />
  if (!painel) return <Carregando />

  const { nivel, recursos, liga, meta } = painel
  const percLiga = liga.trofeus_proxima
    ? ((recursos.trofeus - liga.trofeus_minimos) / (liga.trofeus_proxima - liga.trofeus_minimos)) * 100
    : 100

  const blocosRecursos = [
    { icone: 'chama', valor: recursos.ofensiva, rotulo: 'dias', cor: 'text-chama' },
    { icone: 'ouro', valor: recursos.ouro, rotulo: 'ouro', cor: 'text-ouro-texto' },
    { icone: 'diamante', valor: recursos.diamantes, rotulo: 'diamantes', cor: 'text-diamante' },
    { icone: 'trofeu', valor: recursos.trofeus, rotulo: 'troféus', cor: 'text-ouro-texto' },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho: nome, nível e XP */}
      <header className="flex items-center gap-3">
        <div className="flex h-13 w-13 items-center justify-center rounded-2xl border-2 border-ouro bg-[#e4e8ff] font-display text-2xl text-ouro-texto">
          {painel.usuario.charAt(0).toUpperCase()}
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-base font-extrabold">{painel.usuario}</span>
            <span className="font-display text-[15px] text-xp-texto">Nível {nivel.nivel}</span>
          </div>
          <Barra percentual={nivel.percentual} />
          <span className="text-xs text-sub">
            {fmt(nivel.xp_no_nivel)} / {fmt(nivel.xp_para_proximo)} XP para o nível {nivel.nivel + 1}
          </span>
        </div>
      </header>

      {/* Recursos */}
      <div className="grid grid-cols-4 gap-2">
        {blocosRecursos.map((b) => (
          <Card key={b.rotulo} className="flex flex-col items-center gap-1 !px-1.5 !py-2.5">
            <Icone nome={b.icone} className={b.cor} />
            <span className="font-display text-[17px]">{fmt(b.valor)}</span>
            <span className="text-[11px] text-sub">{b.rotulo}</span>
          </Card>
        ))}
      </div>

      {/* Liga */}
      <Link to="/liga" className="flex items-center gap-3.5 rounded-2xl border border-liga-borda bg-liga px-4 py-3.5">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#e2d8ff] text-ouro-texto">
          <Icone nome="estrela" tamanho={28} />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex justify-between">
            <span className="font-display text-[17px] text-ouro-texto">Liga {liga.nome}</span>
            {liga.trofeus_proxima && (
              <span className="text-xs text-liga-texto">
                {fmt(recursos.trofeus)} / {fmt(liga.trofeus_proxima)}
              </span>
            )}
          </div>
          <Barra percentual={percLiga} cor="bg-ouro" altura="h-2" />
          <span className="text-xs text-liga-texto">
            {liga.proxima_liga
              ? `Faltam ${fmt(liga.faltam)} troféus para a Liga ${liga.proxima_liga}`
              : 'Você está na liga máxima!'}
          </span>
        </div>
      </Link>

      {/* Meta diária */}
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Titulo>Meta diária</Titulo>
          {meta.concluida && <span className="text-xs font-extrabold text-certo-texto">Concluída!</span>}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Barra percentual={(meta.respondidas / meta.meta) * 100} cor="bg-certo" altura="h-3.5" />
          </div>
          <span className="font-display">
            {Math.min(meta.respondidas, meta.meta)}/{meta.meta}
          </span>
        </div>
        {meta.concluida && !meta.coletada ? (
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className="btn-jogo h-12 rounded-xl bg-ouro font-display text-lg text-[#241800] shadow-[0_4px_0_var(--color-ouro-sombra)]"
          >
            Abrir baú da meta
          </button>
        ) : (
          <div className="flex items-center gap-2 text-[13px] text-sub">
            <span>{meta.coletada ? 'Recompensa coletada:' : 'Recompensa:'}</span>
            <span className="font-extrabold text-ouro-texto">+{meta.recompensa.ouro} ouro</span>
            <span>·</span>
            <span className="font-extrabold text-diamante-texto">+{meta.recompensa.diamantes} diamantes</span>
          </div>
        )}
      </Card>

      {/* Ações principais */}
      <Link
        to="/jogar?modo=missao"
        className="btn-jogo flex h-15 items-center justify-center gap-2.5 rounded-2xl bg-ouro font-display text-xl text-[#241800] shadow-[0_5px_0_var(--color-ouro-sombra)]"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M7 4.5v15l12-7.5z" />
        </svg>
        Jogar missão diária
      </Link>

      {painel.revisoes_pendentes > 0 && (
        <Link
          to="/jogar?modo=revisao"
          className="flex items-center gap-3 rounded-2xl border border-[#f3c2c2] bg-erro-fundo px-4 py-3"
        >
          <Icone nome="repetir" className="text-erro-texto" />
          <span className="flex-1 text-sm font-bold">
            {painel.revisoes_pendentes} {painel.revisoes_pendentes === 1 ? 'questão' : 'questões'} para revisar hoje
          </span>
          <span className="text-sm font-extrabold text-erro-texto">Revisar</span>
        </Link>
      )}

      {/* Matérias */}
      <section className="flex flex-col gap-2">
        <Titulo>Suas matérias</Titulo>
        <div className="grid grid-cols-3 gap-2">
          {painel.materias.map((m) => (
            <Link key={m.id} to={`/jogar?materia=${m.slug}`}>
              <Card className="flex h-full flex-col gap-1.5 !px-2.5 !py-3">
                <span className="text-[13px] leading-tight font-extrabold">{m.nome}</span>
                <span className="font-display text-[15px] text-xp-texto">nv. {m.nivel}</span>
                <Barra percentual={m.percentual_nivel} altura="h-1.5" />
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <ModalRecompensa
        aberto={modalAberto}
        recompensa={meta.recompensa}
        onFechar={() => {
          setModalAberto(false)
          carregar()
        }}
      />
    </div>
  )
}
