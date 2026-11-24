import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './shared/api/global'
import './app/cet.css'
import './app/styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { CrashBoundary } from './app/CrashScreen'

// до первого кадра: CSS и TitleBar различают платформы по этому атрибуту
document.documentElement.dataset.platform = window.musicTagEditor?.platform ?? ''

const root = document.getElementById('root')
if (!root) throw new Error('Не найден корневой элемент')

createRoot(root).render(
  <StrictMode>
    <CrashBoundary>
      <App />
    </CrashBoundary>
  </StrictMode>
)