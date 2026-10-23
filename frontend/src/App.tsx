import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { api } from './api'
import { Layout } from './components/Layout'
import { Carregando } from './components/ui'
import { Batalha } from './pages/Batalha'
import { Estatisticas } from './pages/Estatisticas'
import { Inicio } from './pages/Inicio'
import { Jogar } from './pages/Jogar'
import { Liga } from './pages/Liga'
import { Login } from './pages/Login'

export default function App() {
  const [autenticado, setAutenticado] = useState<boolean | null>(null)

  useEffect(() => {
    // 1) recebe o cookie CSRF  2) descobre se já existe sessão ativa
    api
      .get('/csrf/')
      .then(() => api.get<{ autenticado: boolean }>('/auth/eu/'))
      .then((r) => setAutenticado(r.autenticado))
      .catch(() => setAutenticado(false))
  }, [])

  if (autenticado === null) return <Carregando />
  if (!autenticado) return <Login onEntrar={() => setAutenticado(true)} />

  return (
    <BrowserRouter>
      <Routes>
        {/* batalha ocupa a tela toda, sem o menu de baixo */}
        <Route path="batalha" element={<Batalha />} />
        <Route element={<Layout />}>
          <Route index element={<Inicio />} />
          <Route path="jogar" element={<Jogar />} />
          <Route path="liga" element={<Liga />} />
          <Route path="estatisticas" element={<Estatisticas />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
