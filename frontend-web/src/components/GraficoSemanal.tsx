import { useState } from 'react'
import type { Historico } from '../types'

type Semana = Historico['semanas'][number]

const L = 660, A = 250, ESQ = 44, DIR = 640, TOPO = 24, BASE = 206
const META = 80
const y = (v: number) => BASE - (v / 100) * (BASE - TOPO)

function curta(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

/** Linha do % de acerto semanal (uma série só: sem legenda; o título do card nomeia a série). */
export function GraficoSemanal({ semanas }: { semanas: Semana[] }) {
  const [foco, setFoco] = useState<number | null>(null)
  const passo = (DIR - ESQ - 20) / Math.max(1, semanas.length - 1)
  const pontos = semanas.map((s, i) => ({ ...s, i, x: ESQ + 10 + i * passo, y: y(s.percentual) }))
  const comDados = pontos.filter((p) => p.respondidas > 0)

  // linha só entre semanas com dados (semanas sem estudo viram um vão)
  const trechos: (typeof pontos)[] = []
  pontos.forEach((p) => {
    if (p.respondidas === 0) return
    const ultimo = trechos[trechos.length - 1]
    if (ultimo && ultimo[ultimo.length - 1].i === p.i - 1) ultimo.push(p)
    else trechos.push([p])
  })
  const ultimoComDados = comDados[comDados.length - 1]
  const p = foco !== null ? pontos[foco] : null

  if (!comDados.length) {
    return <p className="m-0 py-10 text-center text-sm text-sub">Responda algumas questões para ver sua evolução semanal.</p>
  }

  return (
    <svg
      viewBox={`0 0 ${L} ${A}`}
      role="img"
      aria-label={`Percentual de acerto nas últimas ${semanas.length} semanas`}
      className="block h-auto w-full"
      onMouseLeave={() => setFoco(null)}
    >
      <g fontFamily="Inter, sans-serif" fontSize="12" fill="#5E6680">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={ESQ} x2={DIR} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#C5CBDA' : '#E9ECF2'} />
            <text x={ESQ - 8} y={y(v) + 4} textAnchor="end">{v}%</text>
          </g>
        ))}
        <line x1={ESQ} x2={DIR} y1={y(META)} y2={y(META)} stroke="#3DD68C" strokeWidth="1.5" strokeDasharray="5 5" />
        <text x={ESQ + 6} y={y(META) - 6} textAnchor="start" fill="#138A52" fontWeight="600">meta {META}%</text>
        {pontos.map((pt) =>
          pt.i % 2 === semanas.length % 2 || pt.i === semanas.length - 1 ? (
            <text key={pt.i} x={pt.x} y={BASE + 20} textAnchor="middle">{curta(pt.fim)}</text>
          ) : null,
        )}
      </g>
      {p && <line x1={p.x} x2={p.x} y1={TOPO} y2={BASE} stroke="#C5CBDA" strokeDasharray="3 3" />}
      {trechos.map((t, i) => (
        <polyline
          key={i}
          points={t.map((q) => `${q.x},${q.y}`).join(' ')}
          fill="none"
          stroke="#4E6BF0"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {comDados.map((pt) => (
        <circle key={pt.i} cx={pt.x} cy={pt.y} r={foco === pt.i ? 6 : 4.5} fill="#4E6BF0" stroke="#FFFFFF" strokeWidth="2" pointerEvents="none" />
      ))}
      {ultimoComDados && foco === null && (
        <text x={ultimoComDados.x} y={ultimoComDados.y - 12} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="14" fontWeight="600" fill="#1B1F2E">
          {ultimoComDados.percentual}%
        </text>
      )}
      {/* áreas de hover maiores que o ponto */}
      {pontos.map((pt) => (
        <rect key={pt.i} x={pt.x - passo / 2} y={TOPO} width={passo} height={BASE - TOPO} fill="transparent" onMouseEnter={() => setFoco(pt.i)} />
      ))}
      {p && (
        <g pointerEvents="none" transform={`translate(${Math.min(Math.max(p.x - 95, ESQ), DIR - 190)}, ${Math.max(p.y - 70, 0)})`}>
          <rect width="190" height="54" rx="10" fill="#1B1F2E" />
          <text x="12" y="21" fontFamily="Inter, sans-serif" fontSize="12" fill="#C5CBDA">
            {curta(p.inicio)} a {curta(p.fim)}
          </text>
          <text x="12" y="41" fontFamily="Inter, sans-serif" fontSize="13" fontWeight="600" fill="#FFFFFF">
            {p.respondidas ? `${p.percentual}% · ${p.respondidas} questões` : 'Sem estudo nesta semana'}
          </text>
        </g>
      )}
    </svg>
  )
}
