import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// O proxy envia /api e /admin para o Django (porta 8000).
// Assim front e back ficam na mesma origem: a sessão e o CSRF funcionam sem CORS.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // aceita acesso de outros aparelhos da rede (celular)
    // changeOrigin: false mantém o endereço que o celular usou, para o CSRF do Django aceitar o login
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false },
      '/admin': { target: 'http://127.0.0.1:8000', changeOrigin: false },
      '/static': { target: 'http://127.0.0.1:8000', changeOrigin: false },
    },
  },
})
