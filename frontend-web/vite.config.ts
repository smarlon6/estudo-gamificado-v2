import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Front web (desktop). Roda na porta 5174 para conviver com o app de celular (5173).
// O proxy envia /api e /admin para o Django (porta 8000): mesma origem, sessão e CSRF sem CORS.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
    host: true,
    // changeOrigin: false mantém o endereço que o navegador usou (ex.: o IP do PC ao abrir de outro aparelho),
    // assim a checagem de origem do CSRF do Django também passa pela rede local.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false },
      '/admin': { target: 'http://127.0.0.1:8000', changeOrigin: false },
      '/static': { target: 'http://127.0.0.1:8000', changeOrigin: false },
    },
  },
  preview: { port: 5174 },
})
