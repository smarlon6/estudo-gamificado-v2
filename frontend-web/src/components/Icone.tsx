// Ícones em SVG (traço), os mesmos do mockup.

const caminhos = {
  chama: <path d="M12 3c1 3 4.5 4.5 4.5 9a4.5 4.5 0 0 1-9 0c0-1.8.8-3.1 1.8-4 .2 1.5 1 2.4 2 2.4C11.2 8 10.4 5.5 12 3z" />,
  ouro: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
    </>
  ),
  diamante: (
    <>
      <path d="M6 4h12l3 5-9 11L3 9z" />
      <path d="M3 9h18M9 4l3 16 3-16" />
    </>
  ),
  trofeu: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4" />
    </>
  ),
  estrela: <path d="M12 2l3 6 6 .8-4.5 4.2 1.1 6L12 16l-5.6 3 1.1-6L3 8.8 9 8z" />,
  raio: <path d="M13 3L5 13h6l-1 8 8-10h-6z" />,
  medalha: (
    <>
      <circle cx="12" cy="9" r="6" />
      <path d="M8.5 14L7 22l5-3 5 3-1.5-8" />
    </>
  ),
  casa: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  livro: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 19V5M9 8h6" />
    </>
  ),
  grafico: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  check: <path d="M5 12l5 5 9-10" />,
  fechar: <path d="M6 6l12 12M18 6L6 18" />,
  lampada: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />,
  cadeado: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  bau: (
    <>
      <rect x="3" y="10" width="18" height="10" rx="2" />
      <path d="M3 10l2-5h14l2 5M10 13h4v3h-4z" />
    </>
  ),
  alvo: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  relogio: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M9 2h6" />
    </>
  ),
  repetir: <path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5" />,
  banco: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </>
  ),
  sair: <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10" />,
  play: <path d="M7 4.5v15l12-7.5z" />,
  audio: (
    <>
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
    </>
  ),
  parar: <rect x="6" y="6" width="12" height="12" rx="2" />,
} as const

export type NomeIcone = keyof typeof caminhos

interface Props {
  nome: NomeIcone | string
  tamanho?: number
  className?: string
  espessura?: number
}

export function Icone({ nome, tamanho = 22, className = '', espessura = 2 }: Props) {
  const conteudo = caminhos[nome as NomeIcone] ?? caminhos.medalha
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={espessura}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {conteudo}
    </svg>
  )
}
