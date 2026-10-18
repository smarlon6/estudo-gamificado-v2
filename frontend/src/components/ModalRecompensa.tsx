import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { api } from '../api'
import type { ConquistaNova, Recompensa } from '../types'
import { Icone } from './Icone'

interface Props {
  aberto: boolean
  recompensa: Recompensa
  onFechar: (coletou: boolean) => void
}

/** Tela "Missão cumprida!": coleta a recompensa da meta diária. */
export function ModalRecompensa({ aberto, recompensa, onFechar }: Props) {
  const [coletando, setColetando] = useState(false)
  const [coletado, setColetado] = useState(false)
  const [conquistas, setConquistas] = useState<ConquistaNova[]>([])
  const [erro, setErro] = useState('')

  async function coletar() {
    setColetando(true)
    setErro('')
    try {
      const r = await api.post<{ conquistas_novas: ConquistaNova[] }>('/meta/coletar/')
      setConquistas(r.conquistas_novas)
      setColetado(true)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setColetando(false)
    }
  }

  const itens = [
    { icone: 'ouro', valor: recompensa.ouro, rotulo: 'ouro', cor: 'text-ouro-texto' },
    { icone: 'diamante', valor: recompensa.diamantes, rotulo: 'diamantes', cor: 'text-diamante-texto' },
    { icone: 'trofeu', valor: recompensa.trofeus, rotulo: 'troféus', cor: 'text-ouro-texto' },
  ]

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1b1f2e]/50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-recompensa"
            className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl bg-[#f4f0ff] p-6"
            initial={{ scale: 0.8, y: 30 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          >
            <span className="text-xs font-extrabold tracking-widest text-liga-texto">META DIÁRIA</span>
            <h2 id="titulo-recompensa" className="font-display text-4xl font-normal text-ouro-texto">
              Missão cumprida!
            </h2>

            <motion.div
              className="flex h-36 w-36 items-center justify-center rounded-full bg-[#e7deff] text-ouro-texto"
              animate={coletado ? { rotate: [0, -8, 8, -4, 0], scale: [1, 1.15, 1] } : { y: [0, -6, 0] }}
              transition={coletado ? { duration: 0.6 } : { repeat: Infinity, duration: 1.6 }}
            >
              <Icone nome="bau" tamanho={84} espessura={1.6} />
            </motion.div>

            <div className="grid w-full grid-cols-3 gap-2.5">
              {itens.map((it, i) => (
                <motion.div
                  key={it.rotulo}
                  className="flex flex-col items-center gap-1 rounded-2xl bg-card p-3"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                >
                  <Icone nome={it.icone} tamanho={28} className={it.cor} />
                  <span className={`font-display text-2xl ${it.cor}`}>+{it.valor}</span>
                  <span className="text-xs text-liga-texto">{it.rotulo}</span>
                </motion.div>
              ))}
            </div>

            {conquistas.length > 0 && (
              <p className="text-center text-sm font-bold text-liga-texto">
                Nova conquista: {conquistas.map((c) => c.nome).join(', ')}
              </p>
            )}
            {erro && <p className="text-sm font-bold text-erro-texto">{erro}</p>}

            {coletado ? (
              <button
                type="button"
                onClick={() => onFechar(true)}
                className="btn-jogo h-14 w-full rounded-2xl bg-certo font-display text-xl text-[#0e2a1c] shadow-[0_5px_0_var(--color-certo-sombra)]"
              >
                Continuar
              </button>
            ) : (
              <button
                type="button"
                onClick={coletar}
                disabled={coletando}
                className="btn-jogo h-14 w-full rounded-2xl bg-ouro font-display text-xl text-[#241800] shadow-[0_5px_0_var(--color-ouro-sombra)] disabled:opacity-60"
              >
                {coletando ? 'Coletando...' : 'Coletar recompensas'}
              </button>
            )}
            {!coletado && (
              <button type="button" onClick={() => onFechar(false)} className="p-2 text-sm font-extrabold text-liga-texto">
                Coletar depois
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
