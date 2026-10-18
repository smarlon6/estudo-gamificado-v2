// Tipos das respostas da API (espelham jogo/views.py e jogo/services.py)

export interface Liga {
  nome: string
  trofeus_minimos: number
  proxima_liga: string | null
  trofeus_proxima: number | null
  faltam: number
}

export interface Painel {
  usuario: string
  nivel: { nivel: number; xp_no_nivel: number; xp_para_proximo: number; percentual: number }
  recursos: {
    ouro: number
    diamantes: number
    trofeus: number
    ofensiva: number
    ofensiva_recorde: number
    congeladores: number
  }
  liga: Liga
  meta: {
    respondidas: number
    meta: number
    acertos: number
    concluida: boolean
    coletada: boolean
    recompensa: Recompensa
  }
  revisoes_pendentes: number
  combo: number
  materias: { id: number; nome: string; slug: string; cor: string; nivel: number; percentual_nivel: number }[]
}

export interface Recompensa {
  ouro: number
  diamantes: number
  trofeus: number
}

export interface Alternativa {
  id: number
  letra: string
  texto: string
}

export interface Questao {
  id: number
  tipo: 'ME' | 'CE'
  enunciado: string
  materia: string
  assunto: string | null
  banca: string | null
  ano: number | null
  orgao: string
  cargo: string
  dificuldade: 1 | 2 | 3
  alternativas: Alternativa[]
}

export interface ConquistaNova {
  codigo: string
  nome: string
  icone: string
  ouro: number
  diamantes: number
}

export interface ResultadoResposta {
  resposta_id: number
  correta: boolean
  alternativa_correta_id: number | null
  explicacao: string
  xp_ganho: number
  detalhe_xp: { base: number; combo: number; fator: number; motivos: string[] }
  combo: number
  trofeus_delta: number
  subiu_nivel: boolean
  nivel: number
  subiu_nivel_materia: boolean
  meta_concluida_agora: boolean
  progresso_hoje: { respondidas: number; meta: number }
  conquistas_novas: ConquistaNova[]
  revisao?: InfoRevisao | null
}

export interface InfoRevisao {
  status: 'reforco' | 'agendada' | 'aprendida' | 'mantida'
  dias: number | null
  proxima_em: string | null
  mensagem: string
  teimosa: boolean
}

export interface ResumoPeriodo {
  respondidas: number
  percentual: number
  tempo_medio: number
}

export interface Comparativo {
  esta_semana: ResumoPeriodo
  semana_passada: ResumoPeriodo
}

export interface Trilha {
  trofeus: number
  liga: Liga
  marcos: {
    id: number
    trofeus: number
    titulo: string
    ouro: number
    diamantes: number
    estado: 'coletado' | 'disponivel' | 'bloqueado'
  }[]
  comparativo_semanal: Comparativo
}

export interface Estatisticas {
  total_respondidas: number
  total_acertos: number
  percentual_geral: number
  por_materia: {
    materia_id: number
    materia: string
    cor: string
    respondidas: number
    acertos: number
    percentual: number
    nivel: number
  }[]
  pontos_fracos: { assunto_id: number; assunto: string; materia: string; respondidas: number; percentual: number }[]
  comparativo_semanal: Comparativo
  recordes: { ofensiva: number; combo: number }
  conquistas: { codigo: string; nome: string; icone: string; obtida_em: string }[]
}

// ---- Exclusivo do front web: /api/historico/ ----
export interface Historico {
  dias: { data: string; respondidas: number; acertos: number; meta_concluida: boolean }[]
  dias_com_estudo: number
  questoes_no_periodo: number
  semanas: { inicio: string; fim: string; respondidas: number; percentual: number; tempo_medio: number }[]
  tendencias: { materia_id: number; delta: number | null }[]
  tempo_medio_segundos: number
  conquistas: { codigo: string; nome: string; descricao: string; icone: string; obtida: boolean }[]
}
