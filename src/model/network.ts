// Network-layer wording. AWS and GCP differ in ways interviewers ask about:
// AWS subnets live in one AZ (one subnet per AZ per tier); GCP VPCs are global and subnets are regional.
import { isOnPrem, subnetOf, type Design, type DNode, type Step } from './schema'
import { nameOf, tierOf, type Cloud } from './kinds'

export const subnetFor = (d: Design, n: DNode) => subnetOf(d, n, tierOf(n))
export const zonesOf = (d: Design, n: DNode) => n.zones ?? d.network?.zones ?? 1

const ENDPOINT: Record<Cloud, string> = { neutral: 'a private endpoint', aws: 'a VPC endpoint', gcp: 'Private Google Access', azure: 'a private endpoint' }
const FIREWALL: Record<Cloud, string> = { neutral: 'firewall rule', aws: 'security group', gcp: 'VPC firewall rule', azure: 'network security group' }
// The private connection to your own data centre, and what it attaches to on the cloud side.
const LINK: Record<Cloud, string> = { neutral: 'a dedicated link or site-to-site VPN', aws: 'Direct Connect or a site-to-site VPN', gcp: 'Cloud Interconnect or Cloud VPN', azure: 'ExpressRoute or a VPN gateway' }
const ATTACH: Record<Cloud, string> = { neutral: 'a gateway on the VPC', aws: 'a virtual private gateway or transit gateway', gcp: 'a Cloud Router and VLAN attachment', azure: 'a virtual network gateway' }

/** The hybrid link's product name in this cloud, from the design's hybrid_link node when it names one. */
export function linkName(d: Design, cloud: Cloud): string {
  const link = d.nodes.find(n => n.kind === 'hybrid_link')
  return link && cloud !== 'neutral' && link.cloud?.[cloud] ? nameOf(link, cloud) : LINK[cloud]
}

export function vpcLabel(d: Design, cloud: Cloud): string {
  const net = d.network!
  const name = cloud === 'aws' ? 'VPC' : cloud === 'gcp' ? 'VPC network (global)' : 'Private network (VPC)'
  const zones = net.zones > 1 ? `${net.zones} ${cloud === 'aws' ? 'AZs' : 'zones'}` : 'single zone'
  const parts = [name, net.cidr, zones]
  if (net.subnets.some(s => s.public)) parts.push('internet gateway')
  if (net.egress === 'nat') parts.push('NAT for outbound')
  return parts.filter(Boolean).join(' · ')
}

export function subnetLabel(d: Design, s: { label: string; cidr?: string; public: boolean }, cloud: Cloud): string {
  const zones = d.network!.zones
  const scope = cloud === 'aws' && zones > 1 ? `×${zones}, one per AZ` : cloud === 'gcp' ? 'regional' : undefined
  return [`${s.label} subnet`, s.public ? 'public' : 'private', s.cidr, scope].filter(Boolean).join(' · ')
}

/** One line on where a node sits on the network, for the Component tab. */
export function placement(d: Design, n: DNode, cloud: Cloud, zones = zonesOf(d, n)): string | null {
  if (isOnPrem(n)) return `In your own data centre, reached from the cloud over the hybrid link (${linkName(d, cloud)}).`
  if (!d.network) return null
  if (n.kind === 'hybrid_link') return `Private connection from the VPC to your own data centre, attached through ${ATTACH[cloud]}; it never crosses the public internet.`
  const tier = tierOf(n)
  if (tier === 'client' || tier === 'external') return 'On the public internet.'
  if (tier === 'edge') return 'At the provider edge, outside the VPC.'
  const s = subnetFor(d, n)
  if (!s) return `Managed service outside the VPC, reached privately through ${ENDPOINT[cloud]}.`
  const z = zones
  const spread = z <= 1 ? 'in a single zone'
    : cloud === 'aws' ? `across ${z} AZs (one ${s.label.toLowerCase()} subnet per AZ)`
    : cloud === 'gcp' ? `across ${z} zones (one regional subnet covers them all)`
    : `across ${z} zones`
  return `${s.public ? 'Public' : 'Private'} ${s.label.toLowerCase()} subnet, ${spread}.`
}

/** What a hop crosses on the network, or null when it stays inside one boundary. */
export function crossing(d: Design, step: Step, cloud: Cloud): string | null {
  if (step.from === step.to) return null
  const byId = (id: string) => d.nodes.find(n => n.id === id)!
  const from = byId(step.from), to = byId(step.to)
  if (isOnPrem(from) !== isOnPrem(to))
    return `Crosses the hybrid link (${linkName(d, cloud)}) between the cloud and your data centre: a few to tens of milliseconds, and data transfer is charged per GB.`
  if (isOnPrem(from) || !d.network) return null
  if ([from, to].some(n => n.kind === 'hybrid_link'))
    return `Goes between the VPC and the hybrid link through ${ATTACH[cloud]}, never over the public internet.`
  const a = subnetFor(d, from), b = subnetFor(d, to)
  const internet = (n: DNode) => ['client', 'edge', 'external'].includes(tierOf(n))
  if (!a && !b) return null
  if (!a && b) return internet(from)
    ? (b.public ? `Enters the VPC through the internet gateway into the ${b.label.toLowerCase()} subnet.` : `Reaches a private subnet from the internet, which should not happen: put a public load balancer in front.`)
    : `Crosses into the VPC from a managed service through ${ENDPOINT[cloud]}.`
  if (a && !b) return internet(to)
    ? (a.public ? 'Leaves the VPC through the internet gateway.' : `Leaves the VPC through NAT (outbound only).`)
    : `Leaves the VPC to a managed service through ${ENDPOINT[cloud]}, not over the internet.`
  if (a!.id !== b!.id) return `Crosses from the ${a!.label.toLowerCase()} subnet to the ${b!.label.toLowerCase()} subnet; a ${FIREWALL[cloud]} on ${to.label} must allow it.`
  return null
}
