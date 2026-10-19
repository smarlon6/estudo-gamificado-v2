import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { Icone } from '../components/Icone'
import { ModalRecompensa } from '../components/ModalRecompensa'
import { Barra, Carregando, MensagemErro } from '../components/ui'
import { rotuloVelocidade, textoQuestao, textoResultado, useLeitura } from '../lib/leitura'
import type { Painel, Questao, ResultadoResposta } from '../types'

const TITULO_MODO: Record<string, string> = {
  missao: 'Missão diária',
  revisao: 'Revisão de erros',
  treino: 'Treino livre',
}

export function Jogar() {
  const [params] = useSearchParams()
  const modo = params.get('modo') ?? 'treino'
  const materia = params.get('materia') ?? ''

  const [questao, setQuestao] = useState<Questao | null>(null)
  const [semQuestao, setSemQuestao] = useState('')
  const [selecionada, setSelecionada] = useState<number | null>(null)
  const [resultado, setResultado] = useState<ResultadoResposta | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [progresso, setProgresso] = useState({ respondidas: 0, meta: 20 })
  const [combo, setCombo] = useState(0)
  const [recompensa, setRecompensa] = useState<Painel['meta']['recompensa'] | null>(null)
  const [modalMeta, setModalMeta] = useState(false)
  const [anotando, setAnotando] = useState(false)
  const [anotacao, setAnotacao] = useState('')
  const [avisoAnotacao, setAvisoAnotacao] = useState('')

  const vistas = useRef<number[]>([])
  const inicio = useRef(Date.now())
  const leitura = useLeitura()
  const pararLeitura = leitura.parar

  // trocou de questão: para a leitura da anterior
  useEffect(() => pararLeitura(), [questao?.id, pararLeitura])

  const carregarQuestao = useCallback(async () => {
    setErro('')
    setResultado(null)
    setSelecionada(null)
    setAnotando(false)
    setAnotacao('')
    setAvisoAnotacao('')
    const q = new URLSearchParams({ modo })
    if (materia) q.set('materia', materia)
    if (vistas.current.length) q.set('excluir', vistas.current.slice(-30).join(','))
    try {
      const r = await api.get<{ questao: Questao | null; mensagem?: string }>(`/questoes/proxima/?${q}`)
      setQuestao(r.questao)
      setSemQuestao(r.questao ? '' : r.mensagem ?? 'Nenhuma questão disponível.')
      if (r.questao) vistas.current.push(r.questao.id)
      inicio.current = Date.now()
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [modo, materia])

  useEffect(() => {
    vistas.current = []
    api.get<Painel>('/painel/').then((p) => {
      setProgresso({ respondidas: p.meta.respondidas, meta: p.meta.meta })
      setCombo(p.combo)
      setRecompensa(p.meta.recompensa)
    })
    carregarQuestao()
  }, [carregarQuestao])

  async function confirmar() {
    if (!questao || selecionada === null) return
    setEnviando(true)
    try {
      const r = await api.post<ResultadoResposta>(`/questoes/${questao.id}/responder/`, {
        alternativa_id: selecionada,
        tempo_segundos: Math.round((Date.now() - inicio.current) / 1000),
        modo,
      })
      setResultado(r)
      leitura.parar()
      setCombo(r.combo)
      setProgresso(r.progresso_hoje)
      if (r.meta_concluida_agora) setModalMeta(true)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  async function salvarAnotacao() {
    if (!questao) return
    try {
      const r = await api.post<{ ouro_ganho: number }>(`/questoes/${questao.id}/anotacao/`, { texto: anotacao })
      setAvisoAnotacao(r.ouro_ganho ? `Anotação salva! +${r.ouro_ganho} ouro` : 'Anotação atualizada.')
      setAnotando(false)
    } catch (e) {
      setAvisoAnotacao((e as Error).message)
    }
  }

  if (erro) return <MensagemErro mensagem={erro} />
  if (semQuestao) {
    return (
      <div className="flex flex-col items-center gap-4 pt-16 text-center">
        <Icone nome="check" tamanho={48} className="text-certo-texto" />
        <p className="text-lg font-bold">{semQuestao}</p>
        <Link to="/" className="font-extrabold text-ouro-texto">Voltar ao início</Link>
      </div>
    )
  }
  if (!questao) return <Carregando />

  const corAlternativa = (id: number) => {
    if (!resultado) {
      return id === selecionada ? 'border-xp bg-[#eef1ff]' : 'border-trilho bg-card'
    }
    if (id === resultado.alternativa_correta_id) return 'border-certo bg-certo-fundo'
    if (id === selecionada) return 'border-erro bg-erro-fundo'
    return 'border-trilho bg-card opacity-60'
  }

  return (
    <div className="flex flex-col gap-3.5">
      {/* Topo: sair, progresso da meta, combo */}
      <div className="flex items-center gap-3">
        <Link to="/" aria-label="Sair da sessão" className="flex h-11 w-11 items-center justify-center rounded-xl border border-trilho bg-card text-sub">
          <Icone nome="fechar" tamanho={20} espessura={2.5} />
        </Link>
        <div className="flex-1">
          <Barra percentual={(progresso.respondidas / progresso.meta) * 100} cor="bg-certo" altura="h-3.5" />
        </div>
        <span className="font-display text-[15px]">
          {Math.min(progresso.respondidas, progresso.meta)}/{progresso.meta}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-trilho px-2.5 py-1 text-xs font-extrabold text-[#4a5270]">{questao.materia}</span>
          {questao.banca && (
            <span className="rounded-full bg-trilho px-2.5 py-1 text-xs font-bold text-[#4a5270]">
              {questao.banca}{questao.ano ? ` · ${questao.ano}` : ''}
            </span>
          )}
        </div>
        <AnimatePresence>
          {combo >= 2 && (
            <motion.div
              key={combo}
              initial={{ scale: 1.4 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-1.5 rounded-full bg-[#ffe9d9] px-2.5 py-1 text-[#c9580a]"
            >
              <Icone nome="chama" tamanho={16} />
              <span className="font-display text-sm">Combo x{combo}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="m-0 min-w-0 text-xs text-sub">
          {TITULO_MODO[modo] ?? 'Treino'}
          {questao.assunto ? ` · ${questao.assunto}` : ''}
        </p>
        {leitura.suportado && (
          <div className="flex shrink-0 items-center gap-1.5">
            {leitura.lendo && (
              <button
                type="button"
                onClick={leitura.trocarVelocidade}
                aria-label="Mudar a velocidade da leitura"
                className="flex h-10 min-w-10 items-center justify-center rounded-full border border-trilho bg-card px-2 text-xs font-bold text-[#4a5270] tabular-nums"
              >
                {rotuloVelocidade(leitura.velocidade)}
              </button>
            )}
            <button
              type="button"
              onClick={() => leitura.alternar('questao', textoQuestao(questao))}
              aria-pressed={leitura.lendo === 'questao'}
              className={`flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold ${
                leitura.lendo === 'questao' ? 'border-xp bg-[#eef1ff] text-xp-texto' : 'border-trilho bg-card text-[#4a5270]'
              }`}
            >
              <Icone nome={leitura.lendo === 'questao' ? 'parar' : 'audio'} tamanho={16} espessura={2.2} />
              {leitura.lendo === 'questao' ? 'Parar' : 'Ouvir'}
            </button>
          </div>
        )}
      </div>

      <p className="m-0 text-base leading-relaxed font-semibold whitespace-pre-line">{questao.enunciado}</p>

      {/* Alternativas */}
      <div className="flex flex-col gap-2">
        {questao.alternativas.map((alt) => (
          <button
            key={alt.id}
            type="button"
            disabled={!!resultado}
            onClick={() => setSelecionada(alt.id)}
            className={`flex min-h-12 items-center gap-3 rounded-2xl border-2 px-3.5 py-3 text-left transition-colors ${corAlternativa(alt.id)}`}
          >
            {questao.tipo === 'ME' && (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-trilho text-sm font-extrabold">
                {alt.letra}
              </span>
            )}
            <span className="text-[15px] font-semibold">{alt.texto}</span>
          </button>
        ))}
      </div>

      {!resultado && (
        <div className="mt-2 flex gap-2.5">
          {/* pular: vai para a próxima sem registrar resposta (não conta erro nem meta) */}
          <button
            type="button"
            onClick={carregarQuestao}
            disabled={enviando}
            className="flex h-14 shrink-0 items-center rounded-2xl border-2 border-trilho bg-card px-5 text-base font-bold text-[#4a5270] disabled:opacity-50"
          >
            Pular
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={selecionada === null || enviando}
            className="btn-jogo h-14 flex-1 rounded-2xl bg-ouro font-display text-xl text-[#241800] shadow-[0_5px_0_var(--color-ouro-sombra)] disabled:bg-trilho disabled:text-sub disabled:shadow-none"
          >
            {enviando ? 'Enviando...' : 'Confirmar'}
          </button>
        </div>
      )}

      {/* Painel de feedback */}
      <AnimatePresence>
        {resultado && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className={`mt-1 flex flex-col gap-3 rounded-3xl border-t-4 p-4 ${
              resultado.correta ? 'border-certo bg-[#e6f7ee]' : 'border-erro bg-erro-fundo'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${resultado.correta ? 'bg-certo text-[#0e2a1c]' : 'bg-erro text-[#2a0a10]'}`}>
                  <Icone nome={resultado.correta ? 'check' : 'fechar'} espessura={3} />
                </div>
                <span className={`font-display text-2xl ${resultado.correta ? 'text-certo-texto' : 'text-erro-texto'}`}>
                  {resultado.correta ? 'Mandou bem!' : 'Não foi dessa vez'}
                </span>
              </div>
              {resultado.xp_ganho > 0 && (
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.15, type: 'spring' }}
                  className="flex flex-col items-end"
                >
                  <span className="font-display text-lg text-xp-texto">+{resultado.xp_ganho} XP</span>
                  <span className="text-xs text-[#2e6b4a]">
                    {resultado.detalhe_xp.base} base
                    {resultado.detalhe_xp.combo > 0 && ` + ${resultado.detalhe_xp.combo} combo`}
                  </span>
                </motion.div>
              )}
            </div>

            {resultado.detalhe_xp.motivos.length > 0 && (
              <p className="text-xs text-sub">XP reduzido: {resultado.detalhe_xp.motivos.join(', ')}.</p>
            )}
            {resultado.revisao && (
              <p className={`text-sm font-bold ${resultado.correta ? 'text-certo-texto' : 'text-erro-texto'}`}>
                {resultado.revisao.mensagem}
              </p>
            )}
            {resultado.subiu_nivel && (
              <p className="rounded-xl bg-[#eef1ff] p-2 text-center font-display text-lg text-xp-texto">
                Subiu para o nível {resultado.nivel}!
              </p>
            )}
            {resultado.conquistas_novas.map((c) => (
              <p key={c.codigo} className="rounded-xl bg-[#fff6e0] p-2 text-center text-sm font-extrabold text-ouro-texto">
                Conquista desbloqueada: {c.nome}
              </p>
            ))}

            {resultado.explicacao && (
              <div className="flex gap-2.5 rounded-2xl bg-card p-3">
                <Icone nome="lampada" tamanho={20} className="mt-0.5 shrink-0 text-ouro" />
                <p className="m-0 flex-1 text-sm leading-relaxed">{resultado.explicacao}</p>
                {leitura.suportado && (
                  <button
                    type="button"
                    onClick={() => leitura.alternar('resultado', textoResultado(questao, resultado))}
                    aria-label={leitura.lendo === 'resultado' ? 'Parar a leitura' : 'Ouvir a explicação'}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                      leitura.lendo === 'resultado' ? 'border-xp bg-[#eef1ff] text-xp-texto' : 'border-trilho text-[#4a5270]'
                    }`}
                  >
                    <Icone nome={leitura.lendo === 'resultado' ? 'parar' : 'audio'} tamanho={16} espessura={2.2} />
                  </button>
                )}
              </div>
            )}

            {anotando && (
              <div className="flex flex-col gap-2">
                <label htmlFor="anotacao" className="text-sm font-bold">Sua anotação</label>
                <textarea
                  id="anotacao"
                  value={anotacao}
                  onChange={(e) => setAnotacao(e.target.value)}
                  rows={3}
                  className="rounded-xl border-2 border-trilho bg-card p-2.5 text-sm outline-none focus:border-xp"
                  placeholder="Escreva com suas palavras o que você aprendeu"
                />
                <button type="button" onClick={salvarAnotacao} className="h-11 rounded-xl bg-xp font-extrabold text-white">
                  Salvar anotação
                </button>
              </div>
            )}
            {avisoAnotacao && <p className="text-sm font-bold text-ouro-texto">{avisoAnotacao}</p>}

            <div className="flex gap-2.5">
              {!anotando && (
                <button
                  type="button"
                  onClick={() => setAnotando(true)}
                  className="h-13 shrink-0 rounded-2xl border-2 border-[#9acfb1] px-4 text-sm font-extrabold text-[#2e6b4a]"
                >
                  Anotar
                </button>
              )}
              <button
                type="button"
                onClick={carregarQuestao}
                className={`btn-jogo h-13 flex-1 rounded-2xl font-display text-lg ${
                  resultado.correta
                    ? 'bg-certo text-[#0e2a1c] shadow-[0_5px_0_var(--color-certo-sombra)]'
                    : 'bg-erro text-[#2a0a10] shadow-[0_5px_0_#b83a3a]'
                }`}
              >
                Continuar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {recompensa && (
        <ModalRecompensa aberto={modalMeta} recompensa={recompensa} onFechar={() => setModalMeta(false)} />
      )}
    </div>
  )
}
