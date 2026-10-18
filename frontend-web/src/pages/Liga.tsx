import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { Icone } from '../components/Icone'
import { Card, Carregando, MensagemErro, Rotulo, Titulo, fmt } from '../components/ui'
import { usePainel } from '../lib/painel'
import type { Trilha } from '../types'

const LIGAS = [
  { nome: 'Bronze', cor: '#B07A4A' },
  { nome: 'Prata', cor: '#B9C0D4' },
  { nome: 'Ouro', cor: '#F5B83D' },
  { nome: 'Diamante', cor: '#1AA7C7' },
  { nome: 'Mestre', cor: '#8B5CF6' },
]

const REGRAS = [
  { texto: 'Acerto na 1ª tentativa', valor: '+3', cor: 'text-certo-texto' },
  { texto: 'Erro na 1ª tentativa', valor: '−1', cor: 'text-erro-texto' },
  { texto: 'Acerto em revisão no dia certo', valor: '+3', cor: 'text-certo-texto' },
  { texto: 'Meta diária concluída', valor: '+25', cor: 'text-certo-texto' },
  { texto: 'Repetir questão já acertada', valor: '0', cor: 'text-sub' },
]

export function Liga() {
  const { recarregarPainel } = usePainel()
  const [dados, setDados] = useState<Trilha | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(() => {
    api.get<Trilha>('/trilha/').then(setDados).catch((e) => setErro(e.message))
  }, [])
  useEffect(carregar, [carregar])

  async function coletar(id: number) {
    try {
      const r = await api.post<{ ouro: number; diamantes: number }>(`/trilha/${id}/coletar/`)
      setAviso(`Você ganhou +${r.ouro} ouro${r.diamantes ? ` e +${r.diamantes} diamantes` : ''}!`)
      carregar()
      recarregarPainel()
    } catch (e) {
      setAviso((e as Error).message)
    }
  }

  if (erro) return <MensagemErro mensagem={erro} />
  if (!dados) return <Carregando />

  const indiceLiga = LIGAS.findIndex((l) => dados.liga.nome.startsWith(l.nome))
  const { esta_semana: a, semana_passada: b } = dados.comparativo_semanal
  const comparacao = [
    { valor: `${a.percentual}%`, rotulo: `acerto (era ${b.percentual}%)`, melhor: a.percentual >= b.percentual },
    { valor: fmt(a.respondidas), rotulo: `questões (era ${fmt(b.respondidas)})`, melhor: a.respondidas >= b.respondidas },
    { valor: `${a.tempo_medio}s`, rotulo: `por questão (era ${b.tempo_medio}s)`, melhor: !b.tempo_medio || a.tempo_medio <= b.tempo_medio },
  ]
  const vitorias = comparacao.filter((c) => c.melhor).length

  return (
    <>
      <section className="flex flex-wrap items-center gap-7 rounded-3xl border border-liga-borda bg-liga px-7 py-6">
        <div className="flex flex-[1_1_320px] items-center gap-4">
          <div className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-[#E2D8FF] text-ouro-texto">
            <Icone nome="estrela" tamanho={56} espessura={1.8} />
          </div>
          <div className="flex flex-col gap-1">
            <Rotulo className="text-liga-texto">Liga atual</Rotulo>
            <h1 className="titulo m-0 text-[40px] text-ouro-texto">Liga {dados.liga.nome}</h1>
            <span className="text-[15px] text-liga-texto">
              <strong className="text-texto">{fmt(dados.trofeus)} troféus</strong>
              {dados.liga.proxima_liga
                ? ` · faltam ${fmt(dados.liga.faltam)} para a Liga ${dados.liga.proxima_liga}`
                : ' · liga máxima!'}
            </span>
          </div>
        </div>
        <div className="flex flex-[2_1_420px] flex-col gap-2">
          <div className="flex gap-1">
            {LIGAS.map((l, i) => (
              <div key={l.nome} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="h-3 w-full rounded-md" style={{ background: i <= indiceLiga ? l.cor : '#DDD6F2' }} />
                <span className={`text-[13px] ${i === indiceLiga ? 'font-semibold text-ouro-texto' : 'text-liga-texto'}`}>{l.nome}</span>
              </div>
            ))}
          </div>
          <span className="text-[13px] text-liga-texto">Troféus sobem quando você acerta na primeira tentativa e descem quando erra.</span>
        </div>
      </section>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Titulo className="text-xl">Trilha de troféus</Titulo>
          <span className="text-[13px] text-sub">Role para o lado para ver as próximas recompensas</span>
        </div>
        {aviso && <p className="m-0 rounded-xl bg-ouro-claro p-3 text-sm font-semibold text-ouro-texto">{aviso}</p>}
        <div className="overflow-x-auto pb-1.5">
          <ol className="m-0 flex w-max list-none p-0">
            {dados.marcos.map((m, i) => {
              const anterior = i === 0 ? 0 : dados.marcos[i - 1].trofeus
              const proximo = dados.marcos[i + 1]?.trofeus ?? m.trofeus
              const alcancado = dados.trofeus >= m.trofeus
              const ehProximo = !alcancado && dados.trofeus >= anterior
              // a linha entre dois marcos enche conforme o progresso: metade direita deste + metade esquerda do próximo
              const pctTrecho = dados.trofeus >= proximo ? 100 : dados.trofeus <= m.trofeus ? 0 : ((dados.trofeus - m.trofeus) / (proximo - m.trofeus)) * 100
              const pctDir = Math.round(Math.min(100, pctTrecho * 2))
              const trechoAnterior = dados.trofeus >= m.trofeus ? 100 : dados.trofeus <= anterior ? 0 : ((dados.trofeus - anterior) / (m.trofeus - anterior)) * 100
              const pctEsq = Math.round(Math.max(0, (trechoAnterior - 50) * 2))
              const circulo =
                m.estado === 'coletado'
                  ? 'bg-certo border-certo text-[#0e2a1c]'
                  : m.estado === 'disponivel'
                    ? 'bg-ouro border-ouro text-[#241800] shadow-[0_0_0_6px_#FFF1CC]'
                    : ehProximo
                      ? 'bg-white border-ouro text-[#D9900A]'
                      : 'bg-white border-borda text-[#8A91A8]'
              return (
                <li key={m.id} className="relative flex w-[156px] flex-col items-center gap-2.5">
                  {i > 0 && (
                    <div className="absolute top-[33px] left-0 h-1.5 w-1/2" style={{ background: `linear-gradient(90deg, #3DD68C ${pctEsq}%, #E3E7F0 ${pctEsq}%)` }} />
                  )}
                  {i < dados.marcos.length - 1 && (
                    <div
                      className="absolute top-[33px] left-1/2 h-1.5 w-1/2"
                      style={{ background: `linear-gradient(90deg, #3DD68C ${pctDir}%, #E3E7F0 ${pctDir}%)` }}
                    />
                  )}
                  <div className={`relative flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] ${circulo}`}>
                    <Icone nome={m.estado === 'coletado' ? 'check' : m.estado === 'disponivel' || ehProximo ? 'bau' : 'cadeado'} tamanho={30} espessura={m.estado === 'coletado' ? 3 : 2.2} />
                  </div>
                  <span className="titulo text-base">{fmt(m.trofeus)}</span>
                  <span className="px-2 text-center text-xs leading-snug text-sub">
                    {m.titulo}
                    <br />
                    {m.ouro} ouro{m.diamantes ? ` + ${m.diamantes} diam.` : ''}
                  </span>
                  {m.estado === 'disponivel' ? (
                    <button
                      type="button"
                      onClick={() => coletar(m.id)}
                      className="btn-jogo titulo min-h-9 rounded-xl bg-ouro px-4 text-sm text-[#241800] shadow-[0_3px_0_var(--color-ouro-sombra)]"
                    >
                      Coletar
                    </button>
                  ) : (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        m.estado === 'coletado' ? 'bg-certo-fundo text-certo-texto' : ehProximo ? 'bg-ouro-claro text-ouro-texto' : 'bg-painel text-sub'
                      }`}
                    >
                      {m.estado === 'coletado' ? 'coletado' : ehProximo ? `faltam ${fmt(m.trofeus - dados.trofeus)}` : 'bloqueado'}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      </Card>

      <div className="flex flex-wrap gap-5">
        <Card className="flex min-w-0 flex-[1_1_380px] flex-col gap-3.5">
          <Titulo>Você vs. você da semana passada</Titulo>
          <div className="grid grid-cols-3 gap-3 text-center">
            {comparacao.map((c) => (
              <div key={c.rotulo} className="flex flex-col gap-1 rounded-2xl bg-painel px-2 py-3.5">
                <span className={`titulo text-[26px] ${c.melhor ? 'text-certo-texto' : 'text-erro-texto'}`}>{c.valor}</span>
                <span className="text-xs text-sub">{c.rotulo}</span>
              </div>
            ))}
          </div>
          <span className="text-[13px] text-sub">
            {a.respondidas === 0
              ? 'Resolva questões esta semana para entrar na disputa contra você mesmo.'
              : `Você está ganhando da semana passada em ${vitorias} de 3.`}
          </span>
        </Card>

        <Card className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
          <Titulo className="mb-1.5">Como ganhar troféus</Titulo>
          {REGRAS.map((r, i) => (
            <div key={r.texto} className={`flex justify-between py-2 text-sm ${i < REGRAS.length - 1 ? 'border-b border-[#EEF1F7]' : ''}`}>
              <span>{r.texto}</span>
              <strong className={r.cor}>{r.valor}</strong>
            </div>
          ))}
        </Card>
      </div>
    </>
  )
}
