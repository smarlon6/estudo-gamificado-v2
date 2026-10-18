import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Calendario } from '../components/Calendario'
import { Icone } from '../components/Icone'
import { ModalRecompensa } from '../components/ModalRecompensa'
import { Barra, Card, Carregando, Kbd, MensagemErro, Rotulo, Titulo, corAcerto, fmt } from '../components/ui'
import { usePainel } from '../lib/painel'
import type { Estatisticas, Historico, Trilha } from '../types'

function saudacao() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

export function Inicio() {
  const { painel, recarregarPainel } = usePainel()
  const navegar = useNavigate()
  const [historico, setHistorico] = useState<Historico | null>(null)
  const [stats, setStats] = useState<Estatisticas | null>(null)
  const [trilha, setTrilha] = useState<Trilha | null>(null)
  const [erro, setErro] = useState('')
  const [modal, setModal] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get<Historico>('/historico/'),
      api.get<Estatisticas>('/estatisticas/'),
      api.get<Trilha>('/trilha/'),
    ])
      .then(([h, e, t]) => {
        setHistorico(h)
        setStats(e)
        setTrilha(t)
      })
      .catch((e) => setErro(e.message))
  }, [])

  // Enter = continuar a missão (atalho de teclado)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !modal && (e.target as HTMLElement).tagName === 'BODY') navegar('/questoes?modo=missao')
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [navegar, modal])

  if (erro) return <MensagemErro mensagem={erro} />
  if (!painel || !historico || !stats || !trilha) return <Carregando />

  const { recursos, liga, meta } = painel
  const faltam = Math.max(0, meta.meta - meta.respondidas)
  const percLiga = liga.trofeus_proxima
    ? ((recursos.trofeus - liga.trofeus_minimos) / (liga.trofeus_proxima - liga.trofeus_minimos)) * 100
    : 100
  const proximoMarco = trilha.marcos.find((m) => m.estado !== 'coletado')
  const acertoPorMateria = new Map(stats.por_materia.map((m) => [m.materia_id, m]))
  const pctHoje = meta.respondidas ? Math.round((100 * meta.acertos) / meta.respondidas) : 0

  const recursosTopo = [
    { icone: 'ouro', valor: recursos.ouro, rotulo: 'ouro', cor: 'text-[#D9900A]' },
    { icone: 'diamante', valor: recursos.diamantes, rotulo: 'diamantes', cor: 'text-diamante' },
    { icone: 'trofeu', valor: recursos.trofeus, rotulo: 'troféus', cor: 'text-[#D9900A]' },
  ]

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="titulo m-0 text-[32px]">
            {saudacao()}, {painel.usuario}
          </h1>
          <span className="text-[15px] text-sub">
            {meta.concluida
              ? 'Meta de hoje batida! Tudo que vier agora é lucro.'
              : `Faltam ${faltam} ${faltam === 1 ? 'questão' : 'questões'} para bater a meta de hoje.`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {recursosTopo.map((r) => (
            <div key={r.rotulo} className="flex items-center gap-2 rounded-full border border-linha bg-white px-3.5 py-2 shadow-[0_2px_8px_rgba(20,30,60,0.05)]">
              <Icone nome={r.icone} tamanho={20} className={r.cor} />
              <span className="titulo">{fmt(r.valor)}</span>
              <span className="text-xs text-sub">{r.rotulo}</span>
            </div>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap gap-5">
        <Card className="flex min-w-0 flex-[2_1_520px] flex-wrap gap-7">
          <div className="flex flex-[1_1_260px] flex-col gap-3.5">
            <Rotulo>Meta diária</Rotulo>
            <div className="flex items-baseline gap-2">
              <span className="titulo text-[56px] leading-none">{Math.min(meta.respondidas, meta.meta)}</span>
              <span className="titulo text-2xl text-sub">/ {meta.meta} questões</span>
            </div>
            <Barra percentual={(meta.respondidas / meta.meta) * 100} cor="bg-certo" altura="h-4" />
            <div className="flex flex-wrap items-center gap-2 text-sm text-sub">
              <span>{meta.coletada ? 'Recompensa coletada:' : 'Ao concluir:'}</span>
              <span className="font-semibold text-ouro-texto">+{meta.recompensa.ouro} ouro</span>·
              <span className="font-semibold text-diamante-texto">+{meta.recompensa.diamantes} diamantes</span>·
              <span className="font-semibold text-ouro-texto">+{meta.recompensa.trofeus} troféus</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-3.5">
              {meta.concluida && !meta.coletada ? (
                <button
                  type="button"
                  onClick={() => setModal(true)}
                  className="btn-jogo titulo inline-flex min-h-[52px] items-center gap-2.5 rounded-2xl bg-ouro px-6 text-lg text-[#241800] shadow-[0_5px_0_var(--color-ouro-sombra)]"
                >
                  <Icone nome="bau" tamanho={20} /> Abrir baú da meta
                </button>
              ) : (
                <Link
                  to="/questoes?modo=missao"
                  className="btn-jogo titulo inline-flex min-h-[52px] items-center gap-2.5 rounded-2xl bg-ouro px-6 text-lg text-[#241800] shadow-[0_5px_0_var(--color-ouro-sombra)]"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
                  {meta.respondidas ? 'Continuar missão' : 'Começar missão'}
                </Link>
              )}
              <span className="text-[13px] text-sub">ou pressione <Kbd>Enter</Kbd></span>
            </div>
          </div>

          <div className="flex flex-[1_1_240px] flex-col gap-2.5">
            <Titulo>Hoje</Titulo>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-0.5 rounded-2xl bg-painel p-3.5">
                <span className="titulo text-2xl">{meta.respondidas}</span>
                <span className="text-xs text-sub">questões resolvidas</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-2xl bg-painel p-3.5">
                <span className={`titulo text-2xl ${meta.respondidas ? corAcerto(pctHoje).texto : ''}`}>
                  {meta.respondidas ? `${pctHoje}%` : '—'}
                </span>
                <span className="text-xs text-sub">de acerto ({meta.acertos} certas)</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-2xl bg-painel p-3.5">
                <span className="titulo flex items-center gap-1.5 text-2xl">
                  <Icone nome="chama" tamanho={20} className="text-chama" /> x{painel.combo}
                </span>
                <span className="text-xs text-sub">combo atual</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-2xl bg-painel p-3.5">
                <span className="titulo text-2xl">{recursos.congeladores}</span>
                <span className="text-xs text-sub">congeladores de ofensiva</span>
              </div>
            </div>
          </div>
        </Card>

        <Link
          to="/liga"
          className="flex min-w-0 flex-[1_1_280px] flex-col gap-3.5 rounded-[20px] border border-liga-borda bg-liga p-6 text-texto"
        >
          <Rotulo className="text-liga-texto">Liga atual</Rotulo>
          <div className="flex items-center gap-3.5">
            <div className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-[#E2D8FF] text-ouro-texto">
              <Icone nome="estrela" tamanho={36} />
            </div>
            <div className="flex flex-col">
              <span className="titulo text-[26px] text-ouro-texto">Liga {liga.nome}</span>
              <span className="text-sm text-liga-texto">{fmt(recursos.trofeus)} troféus</span>
            </div>
          </div>
          <Barra percentual={percLiga} cor="bg-ouro" altura="h-2.5" trilho="bg-[#DDD3F5]" />
          <span className="text-sm text-liga-texto">
            {liga.proxima_liga ? (
              <>Faltam <strong className="text-texto">{fmt(liga.faltam)} troféus</strong> para a Liga {liga.proxima_liga}</>
            ) : (
              'Você está na liga máxima!'
            )}
          </span>
          {proximoMarco && (
            <div className="mt-auto flex items-center gap-2.5 rounded-2xl bg-white p-3">
              <Icone nome="bau" tamanho={22} className="text-[#D9900A]" />
              <span className="text-[13px]">
                {proximoMarco.estado === 'disponivel' ? 'Pronto para coletar: ' : `Próximo em ${fmt(proximoMarco.trofeus)} troféus: `}
                <strong>{proximoMarco.titulo}</strong>
              </span>
            </div>
          )}
        </Link>
      </div>

      <div className="flex flex-wrap gap-5">
        <Card className="flex min-w-0 flex-[2_1_520px] flex-col gap-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Titulo>Seu ritmo nos últimos 6 meses</Titulo>
            <span className="text-[13px] text-sub">
              {historico.dias_com_estudo} dias com estudo · {fmt(historico.questoes_no_periodo)} questões
            </span>
          </div>
          <Calendario dias={historico.dias} />
        </Card>

        <section className="flex min-w-0 flex-[1_1_280px] flex-col gap-3 rounded-[20px] border border-erro-borda bg-erro-fundo p-6">
          <div className="flex items-center gap-2.5">
            <Icone nome="repetir" tamanho={24} className="text-erro-texto" />
            <Titulo>Revisão de erros</Titulo>
          </div>
          <span className="titulo text-[40px] leading-none text-erro-texto">{painel.revisoes_pendentes}</span>
          <span className="text-sm text-[#6B2B2B]">
            {painel.revisoes_pendentes
              ? `${painel.revisoes_pendentes === 1 ? 'questão que você errou volta' : 'questões que você errou voltam'} hoje. Revisar no dia certo é o que fixa o conteúdo, e conta troféus.`
              : 'Nada para revisar agora. Errou? A questão volta em ~10 minutos e depois em intervalos que crescem a cada acerto.'}
          </span>
          {painel.revisoes_pendentes > 0 && (
            <Link
              to="/questoes?modo=revisao"
              className="btn-jogo titulo mt-auto flex min-h-12 items-center justify-center rounded-2xl bg-erro text-base text-[#2A0A10] shadow-[0_4px_0_var(--color-erro-sombra)]"
            >
              Revisar agora
            </Link>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="titulo m-0 text-xl">Suas matérias</h2>
          <Link to="/estatisticas" className="text-sm font-semibold text-ouro-texto hover:underline">
            Ver estatísticas completas
          </Link>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5">
          {painel.materias.map((m) => {
            const s = acertoPorMateria.get(m.id)
            return (
              <Link
                key={m.id}
                to={`/questoes?materia=${m.slug}`}
                className="flex flex-col gap-2.5 rounded-[18px] border border-linha bg-white p-4 text-texto shadow-[0_2px_8px_rgba(20,30,60,0.05)] transition-colors hover:border-ouro"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[15px] leading-tight font-semibold">{m.nome}</span>
                  <span className="titulo whitespace-nowrap text-[15px] text-xp-texto">nv. {m.nivel}</span>
                </div>
                <Barra percentual={m.percentual_nivel} altura="h-1.5" />
                <div className="flex justify-between text-[13px] text-sub">
                  <span>{s ? `${fmt(s.respondidas)} questões` : 'Nenhuma ainda'}</span>
                  {s && <span className={`font-semibold ${corAcerto(s.percentual).texto}`}>{s.percentual}% de acerto</span>}
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <ModalRecompensa
        aberto={modal}
        recompensa={meta.recompensa}
        onFechar={() => {
          setModal(false)
          recarregarPainel()
        }}
      />
    </>
  )
}
