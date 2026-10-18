// Leitura em voz alta das questões usando a voz do próprio navegador (Web Speech API).
// Não precisa de internet nem de backend; funciona no Chrome/Edge do PC e no celular.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Questao, ResultadoResposta } from '../types'

const VELOCIDADES = [1, 1.25, 1.5, 0.85]
const CHAVE_VELOCIDADE = 'leitura-velocidade'

function velocidadeSalva() {
  try {
    const v = Number(localStorage.getItem(CHAVE_VELOCIDADE))
    return VELOCIDADES.includes(v) ? v : 1
  } catch {
    return 1
  }
}

/** Prefere vozes em português do Brasil, e entre elas as mais naturais. */
function escolherVoz(): SpeechSynthesisVoice | null {
  const pt = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('pt'))
  if (!pt.length) return null
  const br = pt.filter((v) => v.lang.toLowerCase().includes('br'))
  const lista = br.length ? br : pt
  for (const nome of ['natural', 'online', 'google', 'francisca', 'antonio', 'thalita', 'luciana']) {
    const v = lista.find((x) => x.name.toLowerCase().includes(nome))
    if (v) return v
  }
  return lista[0]
}

/** Divide em trechos curtos: o Chrome corta falas muito longas no meio. */
function dividir(texto: string): string[] {
  const frases = texto.replace(/\s+/g, ' ').trim().split(/(?<=[.!?;:])\s+/)
  const partes: string[] = []
  let atual = ''
  for (const frase of frases) {
    let resto = frase
    while (resto.length > 240) {
      const espaco = resto.lastIndexOf(' ', 220)
      const corte = espaco > 80 ? espaco : 220
      if (atual) {
        partes.push(atual)
        atual = ''
      }
      partes.push(resto.slice(0, corte))
      resto = resto.slice(corte).trim()
    }
    if (atual && (atual + ' ' + resto).length > 220) {
      partes.push(atual)
      atual = ''
    }
    atual = atual ? `${atual} ${resto}` : resto
  }
  if (atual) partes.push(atual)
  return partes.map((p) => p.trim()).filter(Boolean)
}

const comPonto = (t: string) => {
  const s = t.trim()
  return !s || /[.!?:;]$/.test(s) ? s : `${s}.`
}

export function textoQuestao(q: Questao) {
  const partes = [`Questão de ${q.materia}.`, q.enunciado]
  if (q.tipo === 'CE') partes.push('Certo ou errado?')
  else q.alternativas.forEach((a) => partes.push(`Letra ${a.letra}, ${a.texto}`))
  return partes.map(comPonto).join(' ')
}

export function textoResultado(q: Questao, r: ResultadoResposta) {
  const certa = q.alternativas.find((a) => a.id === r.alternativa_correta_id)
  const partes = [r.correta ? 'Você acertou.' : 'Você errou.']
  if (certa) {
    partes.push(
      q.tipo === 'CE'
        ? `O item está ${(certa.texto || certa.letra).toLowerCase()}.`
        : `Resposta correta: letra ${certa.letra}. ${certa.texto}`,
    )
  }
  if (r.explicacao) partes.push(`Explicação. ${r.explicacao}`)
  return partes.map(comPonto).join(' ')
}

export function useLeitura() {
  const suportado = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
  const [lendo, setLendo] = useState<string | null>(null)
  const [velocidade, setVelocidade] = useState(velocidadeSalva)
  const sessao = useRef(0)
  const vel = useRef(velocidade)
  const voz = useRef<SpeechSynthesisVoice | null>(null)
  const falaAtual = useRef<SpeechSynthesisUtterance | null>(null) // evita o Chrome descartar a fala antes do fim

  useEffect(() => {
    if (!suportado) return
    const carregar = () => {
      voz.current = escolherVoz()
    }
    carregar()
    window.speechSynthesis.addEventListener('voiceschanged', carregar)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', carregar)
      sessao.current++
      window.speechSynthesis.cancel()
    }
  }, [suportado])

  const parar = useCallback(() => {
    sessao.current++
    if (suportado) window.speechSynthesis.cancel()
    setLendo(null)
  }, [suportado])

  const ler = useCallback(
    (chave: string, texto: string) => {
      if (!suportado) return
      const id = ++sessao.current
      window.speechSynthesis.cancel()
      const partes = dividir(texto)
      const proxima = () => {
        if (id !== sessao.current) return
        const trecho = partes.shift()
        if (!trecho) {
          setLendo(null)
          return
        }
        const u = new SpeechSynthesisUtterance(trecho)
        u.lang = voz.current?.lang ?? 'pt-BR'
        if (voz.current) u.voice = voz.current
        u.rate = vel.current
        u.onend = proxima
        u.onerror = () => {
          if (id === sessao.current) setLendo(null)
        }
        falaAtual.current = u
        window.speechSynthesis.resume()
        window.speechSynthesis.speak(u)
      }
      setLendo(chave)
      window.setTimeout(proxima, 60) // o Chrome às vezes ignora um speak() logo depois do cancel()
    },
    [suportado],
  )

  const alternar = useCallback(
    (chave: string, texto: string) => {
      if (lendo === chave) parar()
      else ler(chave, texto)
    },
    [lendo, ler, parar],
  )

  /** 1x → 1,25x → 1,5x → 0,85x; vale a partir do próximo trecho. */
  const trocarVelocidade = useCallback(() => {
    const nova = VELOCIDADES[(VELOCIDADES.indexOf(vel.current) + 1) % VELOCIDADES.length]
    vel.current = nova
    setVelocidade(nova)
    try {
      localStorage.setItem(CHAVE_VELOCIDADE, String(nova))
    } catch {
      /* navegador sem armazenamento: só não lembra a velocidade */
    }
  }, [])

  return { suportado, lendo, velocidade, alternar, parar, trocarVelocidade }
}

export const rotuloVelocidade = (v: number) => `${String(v).replace('.', ',')}x`
