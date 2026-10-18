import { useMemo, useState } from 'react'
import type { Historico } from '../types'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
// escala sequencial de uma cor só (laranja da ofensiva), do claro ao escuro
const NIVEIS = ['#E3E7F0', '#FFD9B8', '#FFB27A', '#F08A3E', '#B9561A']

function nivel(respondidas: number) {
  if (respondidas === 0) return 0
  if (respondidas < 10) return 1
  if (respondidas < 20) return 2
  if (respondidas < 35) return 3
  return 4
}

function paraData(iso: string) {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d)
}

type Dia = Historico['dias'][number]

/** Calendário de atividade no estilo GitHub: uma coluna por semana, de domingo a sábado. */
export function Calendario({ dias }: { dias: Dia[] }) {
  const [foco, setFoco] = useState<Dia | null>(null)

  const { semanas, meses } = useMemo(() => {
    const celulas: (Dia | null)[] = []
    if (dias.length) {
      const deslocamento = paraData(dias[0].data).getDay() // completa a primeira semana
      for (let i = 0; i < deslocamento; i++) celulas.push(null)
    }
    celulas.push(...dias)
    const semanas: (Dia | null)[][] = []
    for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7))
    const meses = semanas.map((s) => {
      const primeiro = s.find((d) => d)
      if (!primeiro) return ''
      const dt = paraData(primeiro.data)
      return dt.getDate() <= 7 ? MESES[dt.getMonth()] : ''
    })
    return { semanas, meses }
  }, [dias])

  const descrever = (d: Dia) => {
    const dt = paraData(d.data)
    const quando = `${dt.getDate()} ${MESES[dt.getMonth()]}`
    if (!d.respondidas) return `${quando} · sem estudo`
    const pct = Math.round((100 * d.acertos) / d.respondidas)
    return `${quando} · ${d.respondidas} questões · ${pct}% de acerto${d.meta_concluida ? ' · meta batida' : ''}`
  }
  const hoje = dias[dias.length - 1]?.data

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto pb-1">
        <div className="flex w-max flex-col gap-1">
          <div className="flex gap-[3px] pl-0 text-[11px] text-sub">
            {meses.map((m, i) => (
              <span key={i} className="w-[14px] overflow-visible whitespace-nowrap">{m}</span>
            ))}
          </div>
          <div
            className="flex gap-[3px]"
            role="img"
            aria-label="Calendário de atividade: cada quadrado é um dia; quanto mais escuro, mais questões resolvidas"
            onMouseLeave={() => setFoco(null)}
          >
            {semanas.map((semana, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {semana.map((d, j) =>
                  d ? (
                    <div
                      key={d.data}
                      title={descrever(d)}
                      onMouseEnter={() => setFoco(d)}
                      className="h-[14px] w-[14px] rounded-[3px]"
                      style={{
                        background: NIVEIS[nivel(d.respondidas)],
                        boxShadow: d.data === hoje ? '0 0 0 2px #1B1F2E' : undefined,
                      }}
                    />
                  ) : (
                    <div key={`v${j}`} className="h-[14px] w-[14px]" />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-sub">
        <span>Menos</span>
        {NIVEIS.map((c) => (
          <span key={c} className="h-3 w-3 rounded-[3px]" style={{ background: c }} />
        ))}
        <span>Mais</span>
        <span className="ml-3 min-h-4 font-semibold text-texto">
          {foco ? descrever(foco) : 'Passe o mouse num dia para ver os detalhes.'}
        </span>
      </div>
    </div>
  )
}
