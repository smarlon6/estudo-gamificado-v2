import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { GraficoSemanal } from '../components/GraficoSemanal'
import { Icone } from '../components/Icone'
import { Barra, Card, Carregando, MensagemErro, Titulo, corAcerto, fmt } from '../components/ui'
import { usePainel } from '../lib/painel'
import type { Estatisticas as Stats, Historico } from '../types'

export function Estatisticas() {
  const { painel } = usePainel()
  const [stats, setStats] = useState<Stats | null>(null)
  const [hist, setHist] = useState<Historico | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    Promise.all([api.get<Stats>('/estatisticas/'), api.get<Historico>('/historico/')])
      .then(([s, h]) => {
        setStats(s)
        setHist(h)
      })
      .catch((e) => setErro(e.message))
  }, [])

  if (erro) return <MensagemErro mensagem={erro} />
  if (!stats || !hist) return <Carregando />

  const semanaAtual = hist.semanas[hist.semanas.length - 1]
  const semanaPassada = hist.semanas[hist.semanas.length - 2]
  const tendencia = new Map(hist.tendencias.map((t) => [t.materia_id, t.delta]))
  const nivelPorMateria = new Map((painel?.materias ?? []).map((m) => [m.id, m]))
  const obtidas = hist.conquistas.filter((c) => c.obtida).length

  const kpis = [
    {
      rotulo: 'Questões resolvidas',
      valor: fmt(stats.total_respondidas),
      nota: `+${fmt(semanaAtual?.respondidas ?? 0)} nos últimos 7 dias`,
      corNota: 'text-certo-texto',
    },
    {
      rotulo: 'Acerto geral',
      valor: `${stats.percentual_geral}%`,
      nota:
        semanaAtual?.respondidas && semanaPassada?.respondidas
          ? `${semanaAtual.percentual - semanaPassada.percentual >= 0 ? '+' : ''}${semanaAtual.percentual - semanaPassada.percentual} p.p. vs. semana anterior`
          : `${fmt(stats.total_acertos)} acertos no total`,
      corNota:
        semanaAtual?.respondidas && semanaPassada?.respondidas && semanaAtual.percentual < semanaPassada.percentual
          ? 'text-erro-texto'
          : 'text-certo-texto',
    },
    { rotulo: 'Tempo médio por questão', valor: `${hist.tempo_medio_segundos}s`, nota: 'Considerando todas as respostas', corNota: 'text-sub' },
    {
      rotulo: 'Recorde de ofensiva',
      valor: `${stats.recordes.ofensiva} ${stats.recordes.ofensiva === 1 ? 'dia' : 'dias'}`,
      nota: `Melhor combo: ${stats.recordes.combo} acertos seguidos`,
      corNota: 'text-sub',
    },
  ]

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="titulo m-0 text-[32px]">Estatísticas</h1>
        <span className="text-[15px] text-sub">Onde você está forte, onde precisa treinar.</span>
      </header>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {kpis.map((k) => (
          <Card key={k.rotulo} className="flex flex-col gap-1.5 !px-5 !py-[18px]">
            <span className="text-[13px] font-medium text-sub">{k.rotulo}</span>
            <span className="titulo text-[34px] leading-none">{k.valor}</span>
            <span className={`text-[13px] font-semibold ${k.corNota}`}>{k.nota}</span>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-5">
        <Card className="flex min-w-0 flex-[2_1_520px] flex-col gap-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-1.5">
            <Titulo>% de acerto por semana</Titulo>
            <span className="text-[13px] text-sub">Últimas 12 semanas · passe o mouse no gráfico</span>
          </div>
          <GraficoSemanal semanas={hist.semanas} />
        </Card>

        <section className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-[20px] border border-erro-borda bg-erro-fundo p-6">
          <div className="flex items-center gap-2">
            <Icone nome="alvo" tamanho={22} className="text-erro-texto" />
            <Titulo>Pontos fracos</Titulo>
          </div>
          <span className="text-[13px] text-[#6B2B2B]">Assuntos com menos de 70% de acerto (mínimo de 5 questões)</span>
          {stats.pontos_fracos.length === 0 ? (
            <p className="m-0 text-sm text-[#6B2B2B]">Nenhum por enquanto. Continue resolvendo para o app identificar onde focar.</p>
          ) : (
            stats.pontos_fracos.map((f) => (
              <div key={f.assunto_id} className="flex flex-col gap-1.5">
                <div className="flex justify-between gap-2.5 text-sm">
                  <span><strong>{f.assunto}</strong> <span className="text-[#6B2B2B]">· {f.materia}</span></span>
                  <strong className="text-erro-texto">{f.percentual}%</strong>
                </div>
                <Barra percentual={f.percentual} cor="bg-erro" altura="h-1.5" trilho="bg-[#F7D3D3]" />
              </div>
            ))
          )}
          <Link
            to="/questoes?modo=missao"
            className="btn-jogo titulo mt-auto flex min-h-12 items-center justify-center rounded-2xl bg-erro text-base text-[#2A0A10] shadow-[0_4px_0_var(--color-erro-sombra)]"
          >
            Treinar com a missão diária
          </Link>
        </section>
      </div>

      <Card className="flex flex-col gap-3">
        <Titulo>Desempenho por matéria</Titulo>
        {stats.por_materia.length === 0 ? (
          <p className="m-0 text-sm text-sub">Responda algumas questões para ver seu desempenho.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs tracking-wide text-sub">
                  <th className="px-2.5 py-2 font-semibold">MATÉRIA</th>
                  <th className="px-2.5 py-2 font-semibold">NÍVEL</th>
                  <th className="px-2.5 py-2 text-right font-semibold">QUESTÕES</th>
                  <th className="w-[34%] px-2.5 py-2 font-semibold">ACERTO</th>
                  <th className="px-2.5 py-2 font-semibold">ÚLTIMOS 30 DIAS</th>
                </tr>
              </thead>
              <tbody>
                {stats.por_materia.map((m) => {
                  const d = tendencia.get(m.materia_id)
                  const nivel = nivelPorMateria.get(m.materia_id)?.nivel ?? m.nivel
                  return (
                    <tr key={m.materia_id} className="border-t border-[#EEF1F7]">
                      <td className="px-2.5 py-3 font-semibold">
                        <Link to={`/questoes?materia=${nivelPorMateria.get(m.materia_id)?.slug ?? ''}`} className="text-texto hover:text-ouro-texto">
                          {m.materia}
                        </Link>
                      </td>
                      <td className="titulo px-2.5 py-3 text-xp-texto">nv. {nivel}</td>
                      <td className="px-2.5 py-3 text-right tabular-nums">{fmt(m.respondidas)}</td>
                      <td className="px-2.5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex-1"><Barra percentual={m.percentual} cor="bg-xp" /></div>
                          <strong className={`w-10 text-right tabular-nums ${corAcerto(m.percentual).texto}`}>{m.percentual}%</strong>
                        </div>
                      </td>
                      <td className={`px-2.5 py-3 font-semibold ${d == null ? 'text-sub' : d > 0 ? 'text-certo-texto' : d < 0 ? 'text-erro-texto' : 'text-sub'}`}>
                        {d == null ? 'poucos dados' : d === 0 ? 'estável' : `${d > 0 ? '+' : '−'}${Math.abs(d)} p.p.`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="titulo m-0 text-xl">Conquistas · {obtidas} de {hist.conquistas.length}</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {hist.conquistas.map((c) => (
            <div
              key={c.codigo}
              title={c.descricao}
              className={`flex flex-col items-center gap-1.5 rounded-2xl p-3.5 text-center ${
                c.obtida ? 'border-2 border-[#F5D58A] bg-white' : 'border-2 border-dashed border-borda bg-painel opacity-80'
              }`}
            >
              <Icone nome={c.obtida ? c.icone : 'cadeado'} tamanho={28} className={c.obtida ? 'text-[#D9900A]' : 'text-[#8A91A8]'} />
              <span className="text-[13px] font-semibold">{c.nome}</span>
              <span className="text-[11px] text-sub">{c.obtida ? 'conquistada' : c.descricao}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
