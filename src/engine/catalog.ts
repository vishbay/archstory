import type { Kind } from './types'

export const CATALOG: Record<Kind, { label: string; icon: string; color: string }> = {
  client:        { label: 'Client',        icon: '📱', color: '#64748b' },
  cdn:           { label: 'CDN',           icon: '🌐', color: '#0ea5e9' },
  load_balancer: { label: 'Load Balancer', icon: '⚖️', color: '#8b5cf6' },
  api_server:    { label: 'API Server',    icon: '🖥️', color: '#10b981' },
  cache:         { label: 'Cache',         icon: '⚡', color: '#f59e0b' },
  database:      { label: 'Database',      icon: '🗄️', color: '#ef4444' },
  db_replica:    { label: 'DB Replica',    icon: '🗃️', color: '#f87171' },
  queue:         { label: 'Queue',         icon: '📨', color: '#ec4899' },
  worker:        { label: 'Worker',        icon: '⚙️', color: '#14b8a6' },
  key_gen:       { label: 'Key Generator', icon: '🔑', color: '#a855f7' },
  object_store:  { label: 'Object Store',  icon: '🪣', color: '#6366f1' },
  rate_limiter:  { label: 'Rate Limiter',  icon: '🚦', color: '#f97316' },
}
