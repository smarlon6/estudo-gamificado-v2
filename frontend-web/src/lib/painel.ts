import { useOutletContext } from 'react-router-dom'
import type { Painel } from '../types'

/** Dados do painel compartilhados pelo Layout com todas as páginas (evita buscar /painel/ em cada tela). */
export interface ContextoPainel {
  painel: Painel | null
  recarregarPainel: () => void
}

export function usePainel() {
  return useOutletContext<ContextoPainel>()
}
