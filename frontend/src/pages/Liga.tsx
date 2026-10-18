import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { Icone } from '../components/Icone'
import { Barra, Card, Carregando, MensagemErro, Titulo } from '../components/ui'
import type { Comparativo, Trilha } from '../types'

const fmt = (n: number) => n.toLocaleString('pt-BR')
const LIGAS = ['Bronze', 'Prata', 'Ouro', 'Diamante', 'Mestre']
const CORES_LIGA = ['bg-[#b07a4a]', 'bg-[#b9c0d4]', 'bg-ouro', 'bg-diamante', 'bg-[#8b5cf6]']

export function CardComparativo({ dados }: { dados: Comparativo }) {
  const { esta_semana: a, semana_passada: b } = dados
  const itens = [
    { valor: `${a.percentual}%`, rotulo: `acerto (era ${b.percentual}%)`, melhor: a.percentual >= b.percentual },
    { valor: fmt(a.respondidas), rotulo: `questões (era ${b.respondidas})`, melhor: a.respondidas >= b.respondidas },
    { valor: `${a.tempo_medio}s`, rotulo: `por questão (era ${b.tempo_medio}s)`, melhor: a.tempo_medio <= b.tempo_medio },
  ]
  return (
    <Card className="flex flex-col gap-2.5">
      <Titulo>Você vs. você da semana passada</Titulo>
      <div className="grid grid-cols-3 gap-2 text-center">
        {itens.map((it) => (
          <div key={it.rotulo} className="flex flex-col gap-0.5">
            <span className={`font-display text-xl ${it.melhor ? 'text-certo-texto' : 'text-erro-texto'}`}>{it.valor}</span>
            <span className="text-[11px] text-sub">{it.rotulo}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function Liga() {
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
      setAviso(`Você ganhou +${r.ouro} ouro e +${r.diamantes} diamantes!`)
      carregar()
    } catch (e) {
      setAviso((e as Error).message)
    }
  }

  if (erro) return <MensagemErro mensagem={erro} />
  if (!dados) return <Carregando />

  const indiceLiga = LIGAS.findIndex((l) => dados.liga.nome.startsWith(l))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 rounded-3xl border border-liga-borda bg-liga p-5">
        <div className="flex items-center gap-2.5 text-ouro-texto">
          <Icone nome="trofeu" tamanho={40} />
          <span className="font-display text-5xl">{fmt(dados.trofeus)}</span>
        </div>
        <span className="font-display text-xl">Liga {dados.liga.nome}</span>
        <div className="mt-1 flex w-full gap-1">
          {LIGAS.map((l, i) => (
            <div key={l} className={`h-2 flex-1 rounded ${i <= indiceLiga ? CORES_LIGA[i] : 'bg-[#ddd6f2]'}`} />
          ))}
        </div>
        <div className="grid w-full grid-cols-5 text-center text-[11px] text-liga-texto">
          {LIGAS.map((l, i) => (
            <span key={l} className={i === indiceLiga ? 'font-extrabold text-ouro-texto' : ''}>{l}</span>
          ))}
        </div>
      </div>

      <CardComparativo dados={dados.comparativo_semanal} />

      <Titulo>Trilha de troféus</Titulo>
      {aviso && <p className="rounded-xl bg-[#fff6e0] p-3 text-sm font-bold text-ouro-texto">{aviso}</p>}

      <div className="relative">
      <div className="absolute top-6 bottom-6 left-[26px] w-1 rounded bg-[#e4e8ff]" aria-hidden="true" />
      <ol className="relative m-0 flex list-none flex-col gap-3 p-0">
        {dados.marcos.map((m) => {
          const anterior = dados.marcos.filter((x) => x.trofeus < m.trofeus).at(-1)?.trofeus ?? 0
          const perc = ((dados.trofeus - anterior) / (m.trofeus - anterior)) * 100
          return (
            <li key={m.id} className={`relative flex items-center gap-3.5 ${m.estado === 'coletado' ? 'opacity-60' : ''}`}>
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${
                  m.estado === 'coletado'
                    ? 'bg-certo text-[#0e2a1c]'
                    : m.estado === 'disponivel'
                      ? 'bg-ouro text-[#241800]'
                      : 'border-2 border-borda bg-card text-sub'
                }`}
              >
                <Icone nome={m.estado === 'coletado' ? 'check' : m.estado === 'disponivel' ? 'bau' : 'cadeado'} />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-sm font-extrabold">{fmt(m.trofeus)} troféus</span>
                <span className="text-[13px] text-sub">
                  {m.titulo} · {m.ouro} ouro{m.diamantes ? ` + ${m.diamantes} diamantes` : ''}
                </span>
                {m.estado === 'bloqueado' && perc > 0 && <Barra percentual={perc} cor="bg-ouro" altura="h-1.5" />}
              </div>
              {m.estado === 'disponivel' && (
                <button
                  type="button"
                  onClick={() => coletar(m.id)}
                  className="btn-jogo h-11 rounded-xl bg-ouro px-4 font-display text-[#241800] shadow-[0_4px_0_var(--color-ouro-sombra)]"
                >
                  Coletar
                </button>
              )}
            </li>
          )
        })}
      </ol>
      </div>
    </div>
  )
}
