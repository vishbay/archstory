// Regions view: one group of columns per region, each holding that region's copy of every component.
// Global services (DNS, CDN, a global load balancer) sit outside the regions; data store copies are linked by
// their cross-region replication.
import type { Design, DNode } from '../model/schema'
import { layoutBands } from './bands'
import { layoutColumns, type Inst, type Replica, type ZoneLayout } from './zones'
import { regionPlacements, replicationOf } from '../model/regions'

const REPLICA_NOTE = { sync: 'sync replication', async: 'async replication', backup: 'backup copies' } as const

export function layoutRegions(d: Design, failed: number | null): ZoneLayout {
  const replicas = (n: DNode, insts: Inst[]): Replica[] => {
    const rep = replicationOf(d, n)
    if (!rep || rep === 'none') return []
    const live = insts.filter(i => !i.failed)
    const src = live.find(i => ['primary', 'promoted', 'active'].includes(i.role))
    return src ? live.filter(i => i !== src).map(i => ({ from: src.id, to: i.id, async: rep !== 'sync', note: REPLICA_NOTE[rep] })) : []
  }
  return layoutColumns(d, layoutBands(d), {
    unit: 'region', count: d.regions?.regions.length ?? 1, failed, vpc: false, replicas,
    place: n => regionPlacements(d, n, failed), label: k => d.regions!.regions[k].name,
  })
}
