import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/syne/latin-400.css'
import '@fontsource/syne/latin-500.css'
import '@fontsource/figtree/latin-300.css'
import '@fontsource/figtree/latin-400.css'
import '@fontsource/figtree/latin-500.css'
import '@fontsource/geist-mono/latin-400.css'
import '@fontsource/geist-mono/latin-500.css'
import './styles/app.css'
import App from './App.tsx'
import { startContentBackfill } from './lib/contentBackfill'
import { slimStoredSongs } from './lib/slim'
import { checkAllAccess } from './lib/folders'
import { listenForLaunch } from './lib/launch'
import { loadLibrary } from './lib/library'
import { initPlayer, restoreQueue } from './lib/player'
import { listenForInstall, registerServiceWorker } from './lib/pwa'
import { ensurePersistence } from './lib/storage'

registerServiceWorker()
listenForLaunch()
listenForInstall(() => void ensurePersistence())
void ensurePersistence()
initPlayer()
const seeded = import.meta.env.DEV
  ? import('./lib/devLibrary').then((m) => m.seedFromUrl()).catch((e: unknown) => console.error('Fake library failed', e))
  : Promise.resolve()
// The library loads before the first render so the app opens on the right page.
void seeded
  .then(loadLibrary)
  .then(() => Promise.all([restoreQueue(), checkAllAccess()]))
  .then(() => void startContentBackfill().then(slimStoredSongs))
  .catch((e: unknown) => console.error('Library failed to load', e))
  .finally(() =>
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
