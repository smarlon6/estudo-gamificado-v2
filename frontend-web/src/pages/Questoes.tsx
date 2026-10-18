import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { Icone } from '../components/Icone'
import { ModalRecompensa } from '../components/ModalRecompensa'
import { Barra, Card, Carregando, Kbd, MensagemErro, Titulo } from '../components/ui'
import { rotuloVelocidade, textoQuestao, textoResultado, useLeitura } from '../lib/leitura'
import { usePainel } from '../lib/painel'
import type { Questao, ResultadoResposta } from '../types'

const MODOS = [
  { id: 'missao', rotulo: 'Missão diária' },
  { id: 'treino', rotulo: 'Treino livre' },
  { id: 'revisao', rotulo: 'Revisão de erros' },
]

function relogio(seg: number) {
  return `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`
}

export function Questoes() {
  const { painel, recarregarPainel } = usePainel()
  const navegar = useNavigate()
  const [params, setParams] = useSearchParams()
  const modo = params.get('modo') ?? 'missao'
  const materia = params.get('materia') ?? ''

  const [questao, setQuestao] = useState<Questao | null>(null)
  const [semQuestao, setSemQuestao] = useState('')
  const [selecionada, setSelecionada] = useState<number | null>(null)
  const [resultado, setResultado] = useState<ResultadoResposta | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [progresso, setProgresso] = useState({ respondidas: 0, meta: 20 })
  const [combo, setCombo] = useState(0)
  const [segundos, setSegundos] = useState(0)
  const [sessao, setSessao] = useState({ xp: 0, acertos: 0, total: 0, trofeus: 0 })
  const [modalMeta, setModalMeta] = useState(false)
  const [anotando, setAnotando] = useState(false)
  const [anotacao, setAnotacao] = useState('')
  const [avisoAnotacao, setAvisoAnotacao] = useState('')

  const vistas = useRef<number[]>([])
  const inicio = useRef(Date.now())
  const campoAnotacao = useRef<HTMLTextAreaElement>(null)
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
      setSegundos(0)
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [modo, materia])

  useEffect(() => {
    vistas.current = []
    carregarQuestao()
  }, [carregarQuestao])

  useEffect(() => {
    if (painel) {
      setProgresso({ respondidas: painel.meta.respondidas, meta: painel.meta.meta })
      setCombo(painel.combo)
    }
    // só na primeira carga do painel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painel === null])

  // cronômetro da questão (para quando você responde)
  useEffect(() => {
    if (resultado || !questao) return
    const id = window.setInterval(() => setSegundos(Math.round((Date.now() - inicio.current) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [resultado, questao])

  const confirmar = useCallback(async () => {
    if (!questao || selecionada === null || enviando || resultado) return
    setEnviando(true)
    try {
      const r = await api.post<ResultadoResposta>(`/questoes/${questao.id}/responder/`, {
        alternativa_id: selecionada,
        tempo_segundos: Math.round((Date.now() - inicio.current) / 1000),
        modo,
      })
      setResultado(r)
      pararLeitura()
      setCombo(r.combo)
      setProgresso(r.progresso_hoje)
      setSessao((s) => ({
        xp: s.xp + r.xp_ganho,
        acertos: s.acertos + (r.correta ? 1 : 0),
        total: s.total + 1,
        trofeus: s.trofeus + r.trofeus_delta,
      }))
      if (r.meta_concluida_agora) setModalMeta(true)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }, [questao, selecionada, enviando, resultado, modo, pararLeitura])

  async function salvarAnotacao() {
    if (!questao || !anotacao.trim()) return
    try {
      const r = await api.post<{ ouro_ganho: number }>(`/questoes/${questao.id}/anotacao/`, { texto: anotacao })
      setAvisoAnotacao(r.ouro_ganho ? `Anotação salva! +${r.ouro_ganho} ouro` : 'Anotação atualizada.')
      setAnotando(false)
    } catch (e) {
      setAvisoAnotacao((e as Error).message)
    }
  }

  // Atalhos: A–E escolhem, Enter confirma/avança, N anota, S pula, Esc sai
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement
      if (modalMeta || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'INPUT' || alvo.tagName === 'SELECT') {
        if (e.key === 'Escape' && anotando) setAnotando(false)
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey || !questao) return
      const k = e.key.toLowerCase()
      if (!resultado && ['a', 'b', 'c', 'd', 'e', '1', '2', '3', '4', '5'].includes(k)) {
        let idx = '12345'.includes(k) ? Number(k) - 1 : k.charCodeAt(0) - 97
        if (questao.tipo === 'CE' && (k === 'c' || k === 'e')) idx = k === 'c' ? 0 : 1
        const alt = questao.alternativas[idx]
        if (alt) {
          e.preventDefault()
          setSelecionada(alt.id)
        }
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (resultado) carregarQuestao()
        else confirmar()
      } else if (k === 'n' && resultado) {
        e.preventDefault()
        setAnotando(true)
        setTimeout(() => campoAnotacao.current?.focus(), 0)
      } else if (k === 'l' && leitura.suportado) {
        // L: antes de responder lê a questão; depois, o resultado e a explicação
        e.preventDefault()
        if (resultado) leitura.alternar('resultado', textoResultado(questao, resultado))
        else leitura.alternar('questao', textoQuestao(questao))
      } else if (k === 's' && !resultado) {
        e.preventDefault()
        carregarQuestao()
      } else if (e.key === 'Escape') {
        navegar('/')
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [questao, resultado, confirmar, carregarQuestao, navegar, modalMeta, anotando, leitura])

  function trocarModo(novo: string) {
    const p = new URLSearchParams(params)
    p.set('modo', novo)
    setParams(p)
  }
  function trocarMateria(slug: string) {
    const p = new URLSearchParams(params)
    if (slug) p.set('materia', slug)
    else p.delete('materia')
    setParams(p)
  }

  const barraTopo = (
    <header className="flex flex-wrap items-center gap-4">
      <Link to="/" aria-label="Sair da sessão (Esc)" className="flex h-11 w-11 items-center justify-center rounded-xl border border-linha bg-white text-sub hover:bg-painel">
        <Icone nome="fechar" tamanho={20} espessura={2.5} />
      </Link>
      <div role="group" aria-label="Modo" className="flex gap-1 rounded-xl border border-linha bg-white p-1">
        {MODOS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => trocarModo(m.id)}
            className={`min-h-9 rounded-lg px-3.5 text-sm font-semibold ${modo === m.id ? 'bg-ouro-claro text-ouro-texto' : 'text-sub hover:text-texto'}`}
          >
            {m.rotulo}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-sub">
        <span className="sr-only">Matéria</span>
        <select
          value={materia}
          onChange={(e) => trocarMateria(e.target.value)}
          className="min-h-11 rounded-xl border border-linha bg-white px-3 text-sm font-semibold text-texto"
        >
          <option value="">Todas as matérias</option>
          {painel?.materias.map((m) => (
            <option key={m.id} value={m.slug}>{m.nome}</option>
          ))}
        </select>
      </label>
      <div className="flex min-w-[200px] flex-[1_1_220px] flex-col gap-1.5">
        <div className="flex justify-between text-[13px] text-sub">
          <span className="font-semibold text-texto">Meta do dia</span>
          <span>{Math.min(progresso.respondidas, progresso.meta)} de {progresso.meta}</span>
        </div>
        <Barra percentual={(progresso.respondidas / progresso.meta) * 100} cor="bg-certo" altura="h-3" />
      </div>
      <AnimatePresence>
        {combo >= 2 && (
          <motion.div
            key={combo}
            initial={{ scale: 1.35 }}
            animate={{ scale: 1 }}
            className="flex items-center gap-1.5 rounded-full bg-[#FFE9D9] px-3.5 py-2 text-[#A6480A]"
          >
            <Icone nome="chama" tamanho={18} espessura={2.2} />
            <span className="titulo text-[15px]">Combo x{combo}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex items-center gap-1.5 rounded-full border border-linha bg-white px-3.5 py-2 tabular-nums">
        <Icone nome="relogio" tamanho={18} className="text-sub" />
        <span className="font-semibold">{relogio(segundos)}</span>
      </div>
    </header>
  )

  if (erro) return <>{barraTopo}<MensagemErro mensagem={erro} /></>
  if (semQuestao) {
    return (
      <>
        {barraTopo}
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <Icone nome="check" tamanho={44} className="text-certo-texto" />
          <p className="m-0 text-lg font-semibold">{semQuestao}</p>
          <p className="m-0 text-sm text-sub">
            {modo === 'revisao' ? 'Você está em dia com as revisões.' : 'Tente outro modo ou outra matéria.'}
          </p>
          <Link to="/" className="mt-2 font-semibold text-ouro-texto hover:underline">Voltar ao início</Link>
        </Card>
      </>
    )
  }
  if (!questao) return <>{barraTopo}<Carregando /></>

  const corAlternativa = (id: number) => {
    if (!resultado) return id === selecionada ? 'border-xp bg-xp-claro' : 'border-linha bg-white hover:border-borda'
    if (id === resultado.alternativa_correta_id) return 'border-certo bg-certo-fundo'
    if (id === selecionada) return 'border-erro bg-erro-fundo'
    return 'border-linha bg-white opacity-60'
  }
  const corLetra = (id: number) => {
    if (!resultado) return id === selecionada ? 'bg-xp text-white border-xp' : 'bg-[#f7f8fb] text-texto border-borda'
    if (id === resultado.alternativa_correta_id) return 'bg-certo text-[#0e2a1c] border-certo'
    if (id === selecionada) return 'bg-erro text-[#2a0a10] border-erro'
    return 'bg-[#f7f8fb] text-texto border-borda'
  }
  const marca = (id: number) => {
    if (!resultado) return null
    if (id === resultado.alternativa_correta_id) return <span className="text-xs font-semibold text-certo-texto">{id === selecionada ? 'sua resposta' : 'correta'}</span>
    if (id === selecionada) return <span className="text-xs font-semibold text-erro-texto">sua resposta</span>
    return null
  }
  const origem = [questao.banca, questao.ano, questao.orgao].filter(Boolean).join(' · ')

  return (
    <>
      {barraTopo}

      <div className="flex flex-wrap items-start gap-5">
        <article className="flex min-w-0 flex-[1_1_520px] flex-col gap-4 rounded-[20px] border border-linha bg-white px-7 py-6 shadow-[0_2px_8px_rgba(20,30,60,0.05)]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-linha px-2.5 py-1 text-xs font-semibold text-menu">{questao.materia}</span>
            {questao.assunto && <span className="rounded-full bg-linha px-2.5 py-1 text-xs font-medium text-menu">{questao.assunto}</span>}
            {origem && <span className="rounded-full bg-linha px-2.5 py-1 text-xs font-medium text-menu">{origem}</span>}
            {questao.tipo === 'CE' && <span className="rounded-full bg-liga px-2.5 py-1 text-xs font-semibold text-liga-texto">Certo ou errado</span>}
            {leitura.suportado && (
              <div className="ml-auto flex items-center gap-1.5">
                {leitura.lendo && (
                  <button
                    type="button"
                    onClick={leitura.trocarVelocidade}
                    title="Velocidade da leitura"
                    aria-label="Mudar a velocidade da leitura"
                    className="min-h-9 min-w-11 rounded-full border border-linha bg-white px-2.5 text-xs font-semibold text-menu tabular-nums hover:bg-painel"
                  >
                    {rotuloVelocidade(leitura.velocidade)}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => leitura.alternar('questao', textoQuestao(questao))}
                  aria-pressed={leitura.lendo === 'questao'}
                  title="Ouvir a questão (L)"
                  className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold ${
                    leitura.lendo === 'questao' ? 'border-xp bg-xp-claro text-xp-texto' : 'border-linha bg-white text-menu hover:bg-painel'
                  }`}
                >
                  <Icone nome={leitura.lendo === 'questao' ? 'parar' : 'audio'} tamanho={16} espessura={2.2} />
                  {leitura.lendo === 'questao' ? 'Parar' : 'Ouvir questão'}
                </button>
              </div>
            )}
          </div>
          <div className="max-w-[75ch] text-base leading-[1.75] whitespace-pre-line text-[#262B3D]">{questao.enunciado}</div>
        </article>

        <section aria-label="Alternativas" className="flex min-w-0 flex-[1_1_400px] flex-col gap-2.5">
          {questao.alternativas.map((alt) => (
            <button
              key={alt.id}
              type="button"
              disabled={!!resultado}
              onClick={() => setSelecionada(alt.id)}
              className={`flex min-h-[58px] items-center gap-3.5 rounded-2xl border-2 px-4 py-3 text-left text-[15px] font-medium text-texto transition-colors ${corAlternativa(alt.id)} ${resultado ? '' : 'cursor-pointer'}`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-b-[3px] text-sm font-semibold ${corLetra(alt.id)}`}>
                {questao.tipo === 'CE' ? alt.letra.charAt(0) : alt.letra}
              </span>
              <span className="flex-1">{alt.texto}</span>
              {marca(alt.id)}
            </button>
          ))}

          {!resultado && (
            <button
              type="button"
              onClick={confirmar}
              disabled={selecionada === null || enviando}
              className="btn-jogo titulo mt-1.5 min-h-14 rounded-2xl bg-ouro text-lg text-[#241800] shadow-[0_5px_0_var(--color-ouro-sombra)] disabled:bg-linha disabled:text-sub disabled:shadow-none"
            >
              {enviando ? 'Enviando...' : 'Confirmar resposta · Enter'}
            </button>
          )}

          <AnimatePresence>
            {resultado && (
              <motion.div
                initial={{ y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className={`mt-1.5 flex flex-col gap-3 rounded-[20px] border-t-4 p-5 ${resultado.correta ? 'border-certo bg-[#E6F7EE]' : 'border-erro bg-erro-fundo'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <span className={`titulo text-2xl ${resultado.correta ? 'text-certo-texto' : 'text-erro-texto'}`}>
                    {resultado.correta ? 'Mandou bem!' : 'Não foi dessa vez'}
                  </span>
                  <motion.span
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.15, type: 'spring' }}
                    className="titulo text-[17px] text-xp-texto"
                  >
                    {[
                      resultado.xp_ganho > 0 ? `+${resultado.xp_ganho} XP` : '',
                      resultado.trofeus_delta !== 0 ? `${resultado.trofeus_delta > 0 ? '+' : '−'}${Math.abs(resultado.trofeus_delta)} troféus` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </motion.span>
                </div>
                {resultado.detalhe_xp.motivos.length > 0 && (
                  <p className="m-0 text-xs text-sub">XP reduzido: {resultado.detalhe_xp.motivos.join(', ')}.</p>
                )}
                {resultado.revisao && (
                  <p className={`m-0 text-sm font-semibold ${resultado.correta ? 'text-certo-texto' : 'text-erro-texto'}`}>
                    {resultado.revisao.mensagem}
                  </p>
                )}
                {resultado.subiu_nivel && (
                  <p className="titulo m-0 rounded-xl bg-xp-claro p-2 text-center text-lg text-xp-texto">Subiu para o nível {resultado.nivel}!</p>
                )}
                {resultado.conquistas_novas.map((c) => (
                  <p key={c.codigo} className="m-0 rounded-xl bg-ouro-claro p-2 text-center text-sm font-semibold text-ouro-texto">
                    Conquista desbloqueada: {c.nome}
                  </p>
                ))}
                {resultado.explicacao && (
                  <div className="flex gap-2.5 rounded-2xl bg-white p-3.5">
                    <Icone nome="lampada" tamanho={20} className="mt-0.5 shrink-0 text-ouro" />
                    <p className="m-0 flex-1 text-sm leading-relaxed whitespace-pre-line">{resultado.explicacao}</p>
                    {leitura.suportado && (
                      <button
                        type="button"
                        onClick={() => leitura.alternar('resultado', textoResultado(questao, resultado))}
                        title="Ouvir a explicação (L)"
                        aria-label={leitura.lendo === 'resultado' ? 'Parar a leitura' : 'Ouvir a explicação'}
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                          leitura.lendo === 'resultado' ? 'border-xp bg-xp-claro text-xp-texto' : 'border-linha text-menu hover:bg-painel'
                        }`}
                      >
                        <Icone nome={leitura.lendo === 'resultado' ? 'parar' : 'audio'} tamanho={16} espessura={2.2} />
                      </button>
                    )}
                  </div>
                )}
                {anotando && (
                  <div className="flex flex-col gap-2">
                    <label htmlFor="anotacao" className="text-sm font-semibold">Sua anotação</label>
                    <textarea
                      id="anotacao"
                      ref={campoAnotacao}
                      value={anotacao}
                      onChange={(e) => setAnotacao(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) salvarAnotacao()
                      }}
                      rows={3}
                      placeholder="Escreva com suas palavras o que você aprendeu (Ctrl+Enter salva)"
                      className="rounded-xl border-2 border-linha bg-white p-2.5 text-sm outline-none focus:border-xp"
                    />
                    <button type="button" onClick={salvarAnotacao} className="min-h-11 rounded-xl bg-xp font-semibold text-white">
                      Salvar anotação
                    </button>
                  </div>
                )}
                {avisoAnotacao && <p className="m-0 text-sm font-semibold text-ouro-texto">{avisoAnotacao}</p>}
                <div className="flex flex-wrap gap-2.5">
                  {!anotando && (
                    <button
                      type="button"
                      onClick={() => {
                        setAnotando(true)
                        setTimeout(() => campoAnotacao.current?.focus(), 0)
                      }}
                      className="min-h-12 rounded-2xl border-2 border-[#9ACFB1] bg-white px-4 text-sm font-semibold text-[#2E6B4A]"
                    >
                      Anotar · N
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={carregarQuestao}
                    className={`btn-jogo titulo min-h-12 flex-1 rounded-2xl text-[17px] ${
                      resultado.correta
                        ? 'bg-certo text-[#0e2a1c] shadow-[0_4px_0_var(--color-certo-sombra)]'
                        : 'bg-erro text-[#2a0a10] shadow-[0_4px_0_var(--color-erro-sombra)]'
                    }`}
                  >
                    Próxima questão · Enter
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Card className="flex flex-col gap-2 !p-4">
            <Titulo className="text-sm">Nesta sessão</Titulo>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="flex flex-col"><span className="titulo text-lg text-xp-texto">+{sessao.xp}</span><span className="text-xs text-sub">XP</span></div>
              <div className="flex flex-col"><span className="titulo text-lg">{sessao.acertos} de {sessao.total}</span><span className="text-xs text-sub">acertos</span></div>
              <div className="flex flex-col"><span className="titulo text-lg text-ouro-texto">{sessao.trofeus >= 0 ? '+' : ''}{sessao.trofeus}</span><span className="text-xs text-sub">troféus</span></div>
            </div>
          </Card>
        </section>
      </div>

      <footer aria-label="Atalhos de teclado" className="flex flex-wrap items-center gap-[18px] rounded-2xl border border-linha bg-white px-[18px] py-3 text-[13px] text-sub">
        <span className="font-semibold text-texto">Atalhos</span>
        <span><Kbd>A</Kbd> a <Kbd>E</Kbd> escolher</span>
        <span><Kbd>Enter</Kbd> confirmar / próxima</span>
        <span><Kbd>N</Kbd> anotar</span>
        <span><Kbd>S</Kbd> pular</span>
        <span><Kbd>L</Kbd> ouvir</span>
        <span><Kbd>Esc</Kbd> sair</span>
        {questao.tipo === 'CE' && <span><Kbd>C</Kbd> certo · <Kbd>E</Kbd> errado</span>}
      </footer>

      {painel && (
        <ModalRecompensa
          aberto={modalMeta}
          recompensa={painel.meta.recompensa}
          onFechar={() => {
            setModalMeta(false)
            recarregarPainel()
          }}
        />
      )}
    </>
  )
}
