import { useState } from 'react'
import type { DNode } from '../model/schema'
import { iconOf } from '../model/kinds'
import { cloudIconUrl } from '../model/cloudIcons'

// Official provider icon in AWS/GCP mode, emoji otherwise (or if the icon file is missing).
export function NodeIcon({ node, cloud, size = 28 }: { node: DNode; cloud: string; size?: number }) {
  const url = cloudIconUrl(node, cloud)
  const [failed, setFailed] = useState<string | null>(null)
  if (!url || failed === url) return <span className="node-icon" style={{ fontSize: size * 0.72 }}>{iconOf(node)}</span>
  return <img className="node-icon-img" src={url} width={size} height={size} alt="" onError={() => setFailed(url)} />
}
