import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

export function Barra({ percentual, cor = 'bg-xp', altura = 'h-2.5' }: {
  percentual: number
  cor?: string
  altura?: string
}) {
  const p = Math.max(0, Math.min(100, percentual))
  return (
    <div className={`${altura} w-full overflow-hidden rounded-full bg-trilho`}>
      <motion.div
        className={`h-full rounded-full ${cor}`}
        initial={{ width: 0 }}
        animate={{ width: `${p}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-trilho bg-card p-4 shadow-[0_2px_8px_rgba(20,30,60,0.05)] ${className}`}>
      {children}
    </div>
  )
}

export function Titulo({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-lg font-normal">{children}</h2>
}

export function Carregando() {
  return <p className="p-8 text-center text-sub">Carregando...</p>
}

export function MensagemErro({ mensagem }: { mensagem: string }) {
  return (
    <p role="alert" className="rounded-xl bg-erro-fundo p-3 text-sm font-bold text-erro-texto">
      {mensagem}
    </p>
  )
}
