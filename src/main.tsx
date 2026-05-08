import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Layout from './components/Layout'
import Home from './pages/Home'
import Import from './pages/Import'
import CoursePage from './pages/CoursePage'
import Lesson from './pages/Lesson'
import Settings from './pages/Settings'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/import" element={<Import />} />
          <Route path="/course/:id" element={<CoursePage />} />
          <Route path="/lesson/:id" element={<Lesson />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
