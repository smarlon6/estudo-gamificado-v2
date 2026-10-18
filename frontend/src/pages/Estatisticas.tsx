import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { Icone } from '../components/Icone'
import { Barra, Card, Carregando, MensagemErro, Titulo } from '../components/ui'
import type { Estatisticas as Stats } from '../types'

const fmt = (n: number) => n.toLocaleString('pt-BR')

function corPercentual(p: number) {
  if (p >= 75) return { barra: 'bg-certo', texto: '' }
  if (p >= 55) return { barra: 'bg-ouro', texto: '' }
  return { barra: 'bg-erro', texto: 'text-erro-texto' }
}

export function Estatisticas() {
  const [dados, setDados] = useState<Stats | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    api.get<Stats>('/estatisticas/').then(setDados).catch((e) => setErro(e.message))
  }, [])

  if (erro) return <MensagemErro mensagem={erro} />
  if (!dados) return <Carregando />

  const resumo = [
    { valor: fmt(dados.total_respondidas), rotulo: 'questões feitas', cor: '' },
    { valor: `${dados.percentual_geral}%`, rotulo: 'acerto geral', cor: 'text-certo-texto' },
    { valor: fmt(dados.recordes.ofensiva), rotulo: 'recorde ofensiva', cor: 'text-[#c9580a]' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-normal">Estatísticas</h1>

      <div className="grid grid-cols-3 gap-2">
        {resumo.map((r) => (
          <Card key={r.rotulo} className="flex flex-col items-center gap-0.5 !px-2 !py-3">
            <span className={`font-display text-[22px] ${r.cor}`}>{r.valor}</span>
            <span className="text-center text-[11px] text-sub">{r.rotulo}</span>
          </Card>
        ))}
      </div>

      <Card className="flex flex-col gap-3.5">
        <div className="flex items-baseline justify-between">
          <Titulo>Desempenho por matéria</Titulo>
          <span className="text-xs text-sub">% de acerto</span>
        </div>
        {dados.por_materia.length === 0 && (
          <p className="text-sm text-sub">Responda algumas questões para ver seu desempenho.</p>
        )}
        {dados.por_materia.map((m) => {
          const c = corPercentual(m.percentual)
          return (
            <div key={m.materia_id} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-sm">
                <span className="font-extrabold">
                  {m.materia} <span className="font-bold text-xp-texto">· nv. {m.nivel}</span>
                </span>
                <span className={`font-extrabold ${c.texto}`}>{m.percentual}%</span>
              </div>
              <Barra percentual={m.percentual} cor={c.barra} />
              <span className="text-[11px] text-sub">{m.acertos} de {m.respondidas} questões</span>
            </div>
          )
        })}
      </Card>

      {dados.pontos_fracos.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-[#f3c2c2] bg-erro-fundo p-4">
          <div className="flex items-center gap-2">
            <Icone nome="alvo" tamanho={20} className="text-erro-texto" />
            <Titulo>Pontos fracos para treinar</Titulo>
          </div>
          {dados.pontos_fracos.map((p) => (
            <div key={p.assunto_id} className="flex justify-between gap-3 text-sm">
              <span>{p.materia} · {p.assunto}</span>
              <span className="font-extrabold text-erro-texto">{p.percentual}%</span>
            </div>
          ))}
          <Link
            to="/jogar?modo=missao"
            className="btn-jogo mt-1 flex h-12 items-center justify-center rounded-xl bg-erro font-display text-[#2a0a10] shadow-[0_4px_0_#b83a3a]"
          >
            Treinar pontos fracos
          </Link>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <Titulo>Conquistas</Titulo>
        {dados.conquistas.length === 0 ? (
          <p className="text-sm text-sub">Nenhuma ainda. A primeira vem na primeira questão!</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {dados.conquistas.map((c) => (
              <Card key={c.codigo} className="flex flex-col items-center gap-1 !px-1.5 !py-2.5 text-center">
                <Icone nome={c.icone} tamanho={26} className="text-ouro-texto" />
                <span className="text-[11px] leading-tight font-extrabold">{c.nome}</span>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
