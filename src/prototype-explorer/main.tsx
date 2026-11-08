import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ExplorerPrototype } from './ExplorerPrototype'

createRoot(document.getElementById('root')!).render(<StrictMode><ExplorerPrototype /></StrictMode>)
