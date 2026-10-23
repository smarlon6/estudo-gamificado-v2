import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Icone } from '../components/Icone'
import { textoQuestao, textoResultado, useLeitura } from '../lib/leitura'
import type { EstadoBatalha, Questao, RespostaBatalha, ResultadoResposta, ResumoBatalha } from '../types'

// Tela escura só da batalha: as cores ficam aqui, sem mexer no tema claro do resto do app.
type Cena = 'encarando' | 'ataque' | 'dano' | 'vitoria' | 'derrota'
const CENAS: Cena[] = ['encarando', 'ataque', 'dano', 'vitoria', 'derrota']
const img = (slug: string, nome: string) => `/batalha/${slug}/${nome}.webp`

// ---------------------------------------------------------------------------
// Partes visuais
// ---------------------------------------------------------------------------
function BarraVida({ pct, cor, lado }: { pct: number; cor: 'verde' | 'vermelha'; lado: 'esq' | 'dir' }) {
  const fundo = cor === 'verde' ? 'linear-gradient(180deg,#5cf07a,#1f9e3a)' : 'linear-gradient(180deg,#ff6b6b,#b3122a)'
  return (
    <div className="relative h-4 w-full shrink-0 overflow-hidden rounded-full border border-[#5a4630] bg-[#1a1410] shadow-[inset_0_1px_3px_rgba(0,0,0,.7)]">
      <motion.div
        className={`absolute inset-y-0 ${lado === 'esq' ? 'left-0' : 'right-0'}`}
        style={{ background: fundo }}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 18 }}
      />
    </div>
  )
}

function Hud({ b }: { b: EstadoBatalha }) {
  return (
    <div className="flex items-center gap-2">
      <img src={img(b.inimigo.slug, 'retrato-heroi')} alt="Você" className="h-12 w-12 shrink-0 rounded-full border-2 border-[#c9a45c] bg-black" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[11px] font-semibold tracking-wide text-[#e9dcc0]">VOCÊ</span>
        <BarraVida pct={b.vida_jogador_pct} cor="verde" lado="esq" />
        <span className="text-[10px] text-[#b9a98a]">{b.vida_jogador} de {b.vida_jogador_max} vidas</span>
      </div>
      <div className="flex shrink-0 flex-col items-center rounded-xl border border-[#8a6a32] bg-[#1c140c] px-2.5 py-1">
        <span className="text-[9px] font-semibold tracking-wider text-[#e3b65a]">ACERTOS</span>
        <span className="text-lg leading-tight font-semibold text-[#f6ead0] tabular-nums">
          {b.acertos}/{b.vida_inimigo_max}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-end gap-1">
        <span className="text-[11px] font-semibold tracking-wide text-[#e9dcc0]">INIMIGO</span>
        <BarraVida pct={b.vida_inimigo_pct} cor="vermelha" lado="dir" />
        <span className="text-[10px] text-[#b9a98a]">{b.vida_inimigo_pct} / 100</span>
      </div>
      <img src={img(b.inimigo.slug, 'retrato-inimigo')} alt={b.inimigo.nome} className="h-12 w-12 shrink-0 rounded-full border-2 border-[#c9a45c] bg-black" />
    </div>
  )
}

function Palco({ slug, cena, golpe, dano }: { slug: string; cena: Cena; golpe: number; dano: string }) {
  const tremer = cena === 'ataque' || cena === 'dano'
  return (
    <motion.div
      key={`palco-${golpe}`}
      className="relative aspect-[1080/400] min-h-[150px] w-full overflow-hidden rounded-2xl border border-[#3a2c1c] bg-black shadow-[0_8px_24px_rgba(0,0,0,.5)]"
      animate={tremer ? { x: [0, -7, 7, -5, 5, -2, 0] } : { x: 0 }}
      transition={{ duration: 0.45 }}
    >
      {CENAS.map((c) => (
        <img
          key={c}
          src={img(slug, c)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
          style={{ opacity: c === cena ? 1 : 0 }}
        />
      ))}

      {/* raio roxo do ataque */}
      <AnimatePresence>
        {cena === 'ataque' && (
          <motion.div
            key={`raio-${golpe}`}
            className="pointer-events-none absolute top-[48%] left-[30%] h-3 rounded-full"
            style={{ background: 'linear-gradient(90deg,#fff 0%,#f0a6ff 30%,#b026ff 70%,rgba(176,38,255,0) 100%)', boxShadow: '0 0 18px 6px rgba(190,60,255,.75)' }}
            initial={{ width: '0%', opacity: 1 }}
            animate={{ width: '45%', opacity: [1, 1, 0] }}
            transition={{ duration: 0.6, times: [0, 0.7, 1] }}
          />
        )}
      </AnimatePresence>

      {/* clarão de acerto (inimigo) ou de dano (você) */}
      <AnimatePresence>
        {(cena === 'ataque' || cena === 'dano') && (
          <motion.div
            key={`clarao-${golpe}`}
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                cena === 'ataque'
                  ? 'radial-gradient(circle at 78% 50%, rgba(255,255,255,.85), rgba(255,80,160,.35) 25%, transparent 55%)'
                  : 'radial-gradient(circle at 22% 50%, rgba(255,40,40,.75), rgba(160,0,0,.35) 35%, transparent 65%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.7 }}
          />
        )}
      </AnimatePresence>

      {/* número de dano subindo */}
      <AnimatePresence>
        {dano && (cena === 'ataque' || cena === 'dano') && (
          <motion.span
            key={`dano-${golpe}`}
            className={`pointer-events-none absolute top-[30%] text-3xl font-semibold ${cena === 'ataque' ? 'right-[16%] text-[#ffe14d]' : 'left-[16%] text-[#ff5050]'}`}
            style={{ textShadow: '0 2px 0 #000, 0 0 12px rgba(0,0,0,.8)' }}
            initial={{ y: 10, opacity: 0, scale: 0.6 }}
            animate={{ y: -30, opacity: [0, 1, 1, 0], scale: 1.15 }}
            transition={{ duration: 1.2 }}
          >
            {dano}
          </motion.span>
        )}
      </AnimatePresence>

      {(cena === 'vitoria' || cena === 'derrota') && (
        <motion.div
          className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/80 to-transparent pt-8 pb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <span
            className={`text-3xl font-semibold tracking-wide ${cena === 'vitoria' ? 'text-[#ffd75a]' : 'text-[#ff6b6b]'}`}
            style={{ textShadow: '0 2px 0 #000' }}
          >
            {cena === 'vitoria' ? 'VITÓRIA!' : 'DERROTA'}
          </span>
        </motion.div>
      )}
    </motion.div>
  )
}

function Progresso({ b }: { b: EstadoBatalha }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#2a3150] bg-[#121729] px-3.5 py-3">
      <span className="shrink-0 text-xs text-[#9aa3c7]">Golpes</span>
      <div className="flex flex-1 flex-wrap gap-1">
        {Array.from({ length: b.vida_inimigo_max }, (_, i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full border ${i < b.acertos ? 'border-[#3dd68c] bg-[#3dd68c] shadow-[0_0_6px_#3dd68c]' : 'border-[#3b4466] bg-transparent'}`}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------
export function Batalha() {
  const navegar = useNavigate()
  const [resumo, setResumo] = useState<ResumoBatalha | null>(null)
  const [b, setB] = useState<EstadoBatalha | null>(null)
  const [questao, setQuestao] = useState<Questao | null>(null)
  const [semQuestao, setSemQuestao] = useState('')
  const [selecionada, setSelecionada] = useState<number | null>(null)
  const [resultado, setResultado] = useState<ResultadoResposta | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [cena, setCena] = useState<Cena>('encarando')
  const [golpe, setGolpe] = useState(0)
  const [dano, setDano] = useState('')
  const [fim, setFim] = useState(false)

  const vistas = useRef<number[]>([])
  const inicio = useRef(Date.now())
  const timers = useRef<number[]>([])
  const areaRolavel = useRef<HTMLDivElement>(null)
  const feedback = useRef<HTMLDivElement>(null)
  const leitura = useLeitura()
  const pararLeitura = leitura.parar

  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => pararLeitura(), [questao?.id, pararLeitura])

  // questão nova começa do topo; depois de responder, desce até o resultado
  useEffect(() => {
    areaRolavel.current?.scrollTo({ top: 0 })
  }, [questao?.id])
  useEffect(() => {
    if (resultado) setTimeout(() => feedback.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150)
  }, [resultado])

  const carregarResumo = useCallback(async () => {
    try {
      const r = await api.get<ResumoBatalha>('/batalha/')
      setResumo(r)
      setB(r.atual)
      return r
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [])

  const carregarQuestao = useCallback(async () => {
    setResultado(null)
    setSelecionada(null)
    setErro('')
    try {
      const pedir = (excluir: boolean) => {
        const q = new URLSearchParams({ modo: 'batalha' })
        if (excluir && vistas.current.length) q.set('excluir', vistas.current.slice(-30).join(','))
        return api.get<{ questao: Questao | null }>(`/questoes/proxima/?${q}`)
      }
      // banco pequeno: se já viu todas, deixa repetir
      let r = await pedir(true)
      if (!r.questao) r = await pedir(false)
      setQuestao(r.questao)
      setSemQuestao(r.questao ? '' : 'Nenhuma questão ativa cadastrada para batalhar.')
      if (r.questao) vistas.current.push(r.questao.id)
      inicio.current = Date.now()
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [])

  useEffect(() => {
    carregarResumo().then((r) => {
      if (r?.atual) carregarQuestao()
    })
  }, [carregarResumo, carregarQuestao])

  // pré-carrega as cenas para a troca ser instantânea
  useEffect(() => {
    const slug = b?.inimigo.slug ?? resumo?.inimigos[0]?.slug
    if (!slug) return
    CENAS.forEach((c) => {
      const i = new Image()
      i.src = img(slug, c)
    })
  }, [b?.inimigo.slug, resumo])

  async function lutar(slug: string) {
    try {
      const nova = await api.post<EstadoBatalha>('/batalha/iniciar/', { inimigo: slug })
      setB(nova)
      setFim(false)
      setCena('encarando')
      vistas.current = []
      carregarQuestao()
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  async function desistir() {
    if (!window.confirm('Desistir desta batalha? Ela conta como encerrada, sem recompensa.')) return
    leitura.parar()
    await api.post('/batalha/desistir/').catch(() => {})
    navegar('/')
  }

  function agendar(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms))
  }

  async function confirmar() {
    if (!questao || selecionada === null || enviando || !b) return
    setEnviando(true)
    leitura.parar()
    try {
      const r = await api.post<RespostaBatalha>('/batalha/responder/', {
        questao_id: questao.id,
        alternativa_id: selecionada,
        tempo_segundos: Math.round((Date.now() - inicio.current) / 1000),
      })
      setResultado(r.resultado)
      setB(r.batalha)
      setGolpe((g) => g + 1)
      const acertou = r.resultado.correta
      setDano(acertou ? `-${Math.round(100 / r.batalha.vida_inimigo_max)}` : `-${Math.round(100 / r.batalha.vida_jogador_max)}`)
      setCena(acertou ? 'ataque' : 'dano')
      if (r.evento === 'vitoria' || r.evento === 'derrota') {
        agendar(() => setCena(r.evento as Cena), 1300)
        agendar(() => setFim(true), 2000)
      } else {
        agendar(() => setCena('encarando'), 1500)
      }
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  // ---------------- telas ----------------
  const moldura = (conteudo: ReactNode) => (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#1d2340_0%,#0b0e1a_60%)] text-[#e8ecff]">
      <div className="mx-auto flex max-w-md flex-col gap-3 px-3.5 pt-4 pb-10">{conteudo}</div>
    </div>
  )

  if (erro && !b && !resumo) return moldura(<p className="pt-16 text-center text-[#ff8a8a]">{erro}</p>)
  if (!resumo) return moldura(<p className="pt-16 text-center text-[#9aa3c7]">Carregando...</p>)

  // Escolha do inimigo (sem batalha em andamento)
  if (!b) {
    return moldura(
      <>
        <div className="flex items-center gap-3">
          <Link to="/" aria-label="Voltar" className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#2a3150] bg-[#121729] text-[#9aa3c7]">
            <Icone nome="fechar" tamanho={20} espessura={2.5} />
          </Link>
          <h1 className="m-0 text-xl font-semibold">Batalha</h1>
          <span className="ml-auto text-xs text-[#9aa3c7]">
            {resumo.vitorias} vitórias · {resumo.derrotas} derrotas
          </span>
        </div>
        {resumo.inimigos.map((i) => (
          <div key={i.slug} className="overflow-hidden rounded-2xl border border-[#3a2c1c] bg-[#121729]">
            <img src={img(i.slug, 'encarando')} alt="" className="aspect-[1080/400] w-full object-cover" />
            <div className="flex flex-col gap-2.5 p-4">
              <div className="flex items-center gap-3">
                <img src={img(i.slug, 'retrato-inimigo')} alt="" className="h-12 w-12 rounded-full border-2 border-[#c9a45c]" />
                <div className="flex flex-col">
                  <span className="text-lg font-semibold">{i.nome}</span>
                  <span className="text-xs text-[#9aa3c7]">{i.descricao}</span>
                </div>
              </div>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-[#c6cbe6]">
                <li>Acerte <strong className="text-[#3dd68c]">{i.vida} questões</strong> para vencer.</li>
                <li>Você aguenta <strong className="text-[#ff8a8a]">{resumo.vidas_jogador} erros</strong>.</li>
                <li>
                  Prêmio: <strong className="text-[#ffd75a]">+{i.recompensa_ouro} ouro</strong>
                  {i.recompensa_diamantes ? <> e <strong className="text-[#6fe0ff]">+{i.recompensa_diamantes} diamante{i.recompensa_diamantes > 1 ? 's' : ''}</strong></> : null}
                </li>
              </ul>
              <button
                type="button"
                onClick={() => lutar(i.slug)}
                className="btn-jogo mt-1 h-14 rounded-2xl bg-[#7c3aed] text-xl font-semibold text-white shadow-[0_5px_0_#4c1d95]"
              >
                Lutar
              </button>
            </div>
          </div>
        ))}
      </>,
    )
  }

  // Resultado final
  if (fim && b.status !== 'andamento') {
    const venceu = b.status === 'vitoria'
    return moldura(
      <>
        <Hud b={b} />
        <Palco slug={b.inimigo.slug} cena={venceu ? 'vitoria' : 'derrota'} golpe={golpe} dano="" />
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={`flex flex-col gap-4 rounded-3xl border p-5 ${venceu ? 'border-[#8a6a32] bg-[#1c170e]' : 'border-[#5a2630] bg-[#1c0f14]'}`}
        >
          <div className="flex flex-col items-center gap-1 text-center">
            <span className={`text-3xl font-semibold ${venceu ? 'text-[#ffd75a]' : 'text-[#ff6b6b]'}`}>
              {venceu ? 'Vitória!' : 'Você foi derrotado'}
            </span>
            <span className="text-sm text-[#c6cbe6]">
              {venceu ? `${b.inimigo.nome} caiu depois de ${b.acertos} golpes.` : `${b.inimigo.nome} venceu desta vez. Revise os erros e volte mais forte.`}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { v: b.acertos, r: 'acertos', c: 'text-[#3dd68c]' },
              { v: b.erros, r: 'erros', c: 'text-[#ff8a8a]' },
              { v: b.melhor_sequencia, r: 'melhor sequência', c: 'text-[#ffd75a]' },
            ].map((x) => (
              <div key={x.r} className="flex flex-col rounded-xl bg-black/30 py-2.5">
                <span className={`text-2xl font-semibold ${x.c}`}>{x.v}</span>
                <span className="text-[11px] text-[#9aa3c7]">{x.r}</span>
              </div>
            ))}
          </div>
          {venceu && (
            <div className="flex items-center justify-center gap-4 rounded-xl bg-black/30 py-3 text-sm font-semibold">
              <span className="flex items-center gap-1.5 text-[#ffd75a]"><Icone nome="ouro" tamanho={18} /> +{b.recompensa.ouro}</span>
              {b.recompensa.diamantes > 0 && <span className="flex items-center gap-1.5 text-[#6fe0ff]"><Icone nome="diamante" tamanho={18} /> +{b.recompensa.diamantes}</span>}
              {b.recompensa.trofeus > 0 && <span className="flex items-center gap-1.5 text-[#ffd75a]"><Icone nome="trofeu" tamanho={18} /> +{b.recompensa.trofeus}</span>}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setB(null)
              setFim(false)
              carregarResumo()
            }}
            className="btn-jogo h-14 rounded-2xl bg-[#7c3aed] text-xl font-semibold text-white shadow-[0_5px_0_#4c1d95]"
          >
            Nova batalha
          </button>
          <Link to="/" className="text-center text-sm font-semibold text-[#9aa3c7]">Voltar ao início</Link>
        </motion.div>
      </>,
    )
  }

  // Batalha em andamento
  const corAlt = (id: number) => {
    if (!resultado) return id === selecionada ? 'border-[#8b5cf6] bg-[#221a45]' : 'border-[#2a3150] bg-[#121729]'
    if (id === resultado.alternativa_correta_id) return 'border-[#3dd68c] bg-[#0f2a1d]'
    if (id === selecionada) return 'border-[#ff6b6b] bg-[#2a1216]'
    return 'border-[#2a3150] bg-[#121729] opacity-50'
  }
  const acabou = b.status !== 'andamento'

  return (
    // topo (cabeçalho, barras de vida e cena) fica fixo; só a questão rola
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,#1d2340_0%,#0b0e1a_60%)] text-[#e8ecff]">
      <div className="mx-auto flex w-full max-w-md shrink-0 flex-col gap-3 px-3.5 pt-4 pb-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={desistir}
          aria-label="Desistir da batalha"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a3150] bg-[#121729] text-[#9aa3c7]"
        >
          <Icone nome="fechar" tamanho={16} espessura={2.5} />
        </button>
        <span className="text-sm font-semibold text-[#e9dcc0]">{b.inimigo.nome}</span>
        {b.sequencia >= 2 && (
          <motion.span key={b.sequencia} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="ml-auto flex items-center gap-1 rounded-full bg-[#3a1f0a] px-2.5 py-1 text-xs font-semibold text-[#ffb35c]">
            <Icone nome="chama" tamanho={14} /> {b.sequencia} seguidas
          </motion.span>
        )}
      </div>

      <Hud b={b} />
      <Palco slug={b.inimigo.slug} cena={cena} golpe={golpe} dano={dano} />
      </div>

      <div ref={areaRolavel} className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-[#1f2642]">
      <div className="mx-auto flex max-w-md flex-col gap-3 px-3.5 pt-3 pb-8">
      {erro && <p className="m-0 rounded-xl bg-[#2a1216] p-3 text-sm text-[#ff8a8a]">{erro}</p>}

      {semQuestao && <p className="m-0 rounded-2xl bg-[#121729] p-4 text-center text-sm text-[#c6cbe6]">{semQuestao}</p>}

      {questao && (
        <section className="flex flex-col gap-3 rounded-3xl border border-[#2a3150] bg-[#0f1424]/95 p-4 shadow-[0_8px_30px_rgba(0,0,0,.4)]">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="self-start rounded-full border border-[#4c3a8a] bg-[#1e1840] px-2.5 py-1 text-xs font-semibold text-[#b9a6ff]">
                {questao.materia}
              </span>
              {questao.assunto && <span className="text-xs text-[#9aa3c7]">{questao.assunto}</span>}
            </div>
            {leitura.suportado && (
              <button
                type="button"
                onClick={() => leitura.alternar('questao', textoQuestao(questao))}
                className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold ${
                  leitura.lendo === 'questao' ? 'border-[#8b5cf6] bg-[#221a45] text-[#d6c8ff]' : 'border-[#2a3150] text-[#c6cbe6]'
                }`}
              >
                <Icone nome={leitura.lendo === 'questao' ? 'parar' : 'audio'} tamanho={16} espessura={2.2} />
                {leitura.lendo === 'questao' ? 'Parar' : 'Ouvir'}
              </button>
            )}
          </div>

          <p className="m-0 text-[17px] leading-relaxed font-semibold whitespace-pre-line text-[#f2f4ff]">{questao.enunciado}</p>

          <div className="flex flex-col gap-2">
            {questao.alternativas.map((alt) => (
              <button
                key={alt.id}
                type="button"
                disabled={!!resultado || acabou}
                onClick={() => setSelecionada(alt.id)}
                className={`flex min-h-12 items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left transition-colors ${corAlt(alt.id)}`}
              >
                {questao.tipo === 'ME' && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1e2440] text-sm font-semibold text-[#e8ecff]">
                    {alt.letra}
                  </span>
                )}
                <span className="text-[15px] text-[#e8ecff]">{alt.texto}</span>
              </button>
            ))}
          </div>

          {!resultado ? (
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={carregarQuestao}
                disabled={enviando}
                className="h-14 shrink-0 rounded-2xl border-2 border-[#3b4466] px-5 font-semibold text-[#c6cbe6] disabled:opacity-50"
              >
                Pular
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={selecionada === null || enviando}
                className="btn-jogo h-14 flex-1 rounded-2xl bg-[#7c3aed] text-xl font-semibold text-white shadow-[0_5px_0_#4c1d95] disabled:bg-[#2a3150] disabled:text-[#6b7499] disabled:shadow-none"
              >
                {enviando ? 'Atacando...' : 'Confirmar'}
              </button>
            </div>
          ) : (
            <motion.div ref={feedback} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-lg font-semibold ${resultado.correta ? 'text-[#3dd68c]' : 'text-[#ff6b6b]'}`}>
                  {resultado.correta ? 'Golpe certeiro!' : 'O inimigo te acertou!'}
                </span>
                {resultado.xp_ganho > 0 && <span className="text-sm font-semibold text-[#a5b4ff]">+{resultado.xp_ganho} XP</span>}
              </div>
              {resultado.explicacao && (
                <div className="flex gap-2.5 rounded-2xl bg-[#161c33] p-3">
                  <Icone nome="lampada" tamanho={18} className="mt-0.5 shrink-0 text-[#ffd75a]" />
                  <p className="m-0 flex-1 text-sm leading-relaxed text-[#d6dbf5]">{resultado.explicacao}</p>
                  {leitura.suportado && (
                    <button
                      type="button"
                      onClick={() => leitura.alternar('resultado', textoResultado(questao, resultado))}
                      aria-label="Ouvir a explicação"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#2a3150] text-[#c6cbe6]"
                    >
                      <Icone nome={leitura.lendo === 'resultado' ? 'parar' : 'audio'} tamanho={16} espessura={2.2} />
                    </button>
                  )}
                </div>
              )}
              {resultado.revisao && <p className="m-0 text-xs text-[#9aa3c7]">{resultado.revisao.mensagem}</p>}
              {!acabou && (
                <button
                  type="button"
                  onClick={carregarQuestao}
                  className={`btn-jogo h-13 rounded-2xl text-lg font-semibold ${
                    resultado.correta ? 'bg-[#3dd68c] text-[#06210f] shadow-[0_4px_0_#1f8a52]' : 'bg-[#ff6b6b] text-[#2a0a10] shadow-[0_4px_0_#a32d3a]'
                  }`}
                >
                  Próximo golpe
                </button>
              )}
            </motion.div>
          )}
        </section>
      )}

      <Progresso b={b} />
      </div>
      </div>
    </div>
  )
}
