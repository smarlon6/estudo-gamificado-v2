import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

export const fmt = (n: number) => n.toLocaleString('pt-BR')

export function Barra({ percentual, cor = 'bg-xp', altura = 'h-2.5', trilho = 'bg-linha' }: {
  percentual: number
  cor?: string
  altura?: string
  trilho?: string
}) {
  const p = Math.max(0, Math.min(100, percentual))
  return (
    <div className={`${altura} w-full overflow-hidden rounded-full ${trilho}`}>
      <motion.div
        className={`h-full rounded-full ${cor}`}
        initial={{ width: 0 }}
        animate={{ width: `${p}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  )
}

/** Card padrão do web: branco, borda clara e sombra suave. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[20px] border border-linha bg-white p-6 shadow-[0_2px_8px_rgba(20,30,60,0.05)] ${className}`}>
      {children}
    </div>
  )
}

export function Titulo({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`titulo m-0 text-lg ${className}`}>{children}</h2>
}

export function Rotulo({ children, className = 'text-sub' }: { children: ReactNode; className?: string }) {
  return <span className={`text-xs font-semibold tracking-[1.5px] uppercase ${className}`}>{children}</span>
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-b-[3px] border-borda bg-[#f7f8fb] px-[7px] py-px text-xs font-semibold text-texto">
      {children}
    </kbd>
  )
}

export function Carregando() {
  return <p className="p-10 text-center text-sub">Carregando...</p>
}

export function MensagemErro({ mensagem }: { mensagem: string }) {
  return (
    <p role="alert" className="rounded-xl bg-erro-fundo p-3 text-sm font-semibold text-erro-texto">
      {mensagem}
    </p>
  )
}

/** Cor do % de acerto: verde (forte), ouro (médio), vermelho (fraco). Sempre acompanhada do número. */
export function corAcerto(p: number) {
  if (p >= 75) return { texto: 'text-certo-texto', barra: 'bg-certo' }
  if (p >= 55) return { texto: 'text-ouro-texto', barra: 'bg-ouro' }
  return { texto: 'text-erro-texto', barra: 'bg-erro' }
}
