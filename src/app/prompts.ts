// Prompts for the user's own AI, and helpers for reading its answers.
import { z } from 'zod'
import { DesignSchema, type Design } from '../model/schema'
import { KINDS } from '../model/kinds'

/** Pull the JSON object out of an AI answer that may wrap it in a code fence or add prose around it. */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{'), end = body.lastIndexOf('}')
  return start >= 0 && end > start ? body.slice(start, end + 1) : body.trim()
}

/** What to say back to an AI whose JSON the validator rejected. */
export function fixRequest(what: 'design' | 'review', errors: string[]): string {
  return `The ${what} JSON you returned was rejected by the validator with these problems:\n${errors.map(e => `- ${e}`).join('\n')}\n\nFix them and return the complete corrected JSON in a single \`\`\`json code block, with no other text.`
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

/** A self-contained prompt that any chat assistant can turn into a valid design file. */
export function generationPrompt(task: string, example: Design): string {
  const kinds = Object.entries(KINDS).map(([k, v]) => `${k} (${v.tier})`).join(', ')
  const schema = JSON.stringify(z.toJSONSchema(DesignSchema, { io: 'input' }))
  const short: Design = { ...example, flows: example.flows.slice(0, 1), notes: example.notes.slice(0, 2), questions: example.questions.slice(0, 2) }
  return `You are creating a system design for an interview study tool called ArchStory.

Task: ${task.trim() || 'Design <system>.'}

Return ONE JSON document that follows the "archstory/v1" JSON Schema below. Output only the JSON inside a single \`\`\`json code block, with no other text.

Rules the schema cannot express (the tool rejects designs that break them):
1. ids use lowercase letters, digits, "-" or "_", and are unique.
2. Every edge's "from" and "to" is a node id. Edges point in the request direction (caller to callee).
3. Each flow step travels exactly one edge, in either direction: there must be an edge between its "from" and "to". Responses travel the request edge backwards with kind "res", one connection at a time. Example: if the request went client to cdn to lb to api, the response goes api to lb, then lb to cdn, then cdn to client. Never send a response straight from api to client, because there is no edge between them. Before you answer, check every step of every flow against the edges list.
4. A step with kind "local" happens inside one node, so its "from" equals its "to". Every other kind needs two different nodes.
5. Use kind "async" for fire-and-forget hops and for background work that continues after the user gets a response.
6. Use these component kinds where they fit, shown with the tier they land in: ${kinds}. Other kinds are allowed but look generic. Use load_balancer for HTTP traffic (L7 routing, TLS termination) and network_load_balancer for TCP/UDP, static IPs or very many long-lived connections (L4).
7. "cloud.aws" and "cloud.gcp" must be exact managed product names, for example "ElastiCache Redis", "Memorystore Redis", "Aurora PostgreSQL", "Cloud SQL Postgres", "SQS", "Pub/Sub", "ECS Fargate", "Cloud Run". Leave them out for anything that is not a managed cloud product.
8. Include a "network" section with 3 zones and public, app and data subnets unless the task says otherwise. Set "ha" on a node only when its default is wrong (defaults: services active-active, sql_db and cache primary-standby, managed services regional).
9. Write 2 to 4 flows: the main read path, the main write path, and one failure or edge case. Give every step a short "phase" (2 to 7 per flow, for example "DNS", "Request in", "Persist", "Respond"), with each phase's steps consecutive. Give every request and async step a one-sentence "detail" explaining why the hop happens (plain responses may omit it), and add an example "payload" (HTTP, SQL, JSON) on the important ones.
10. Set "meta.difficulty" to "easy", "medium" or "hard". Fill in requirements (functional, nonFunctional, and scale with real numbers) and 4 to 6 notes of kinds tradeoff, scaling, failure or security.
11. Include an "observability" section: 2 to 4 SLOs taken from the requirements (target is a percent, e.g. 99.9), 4 to 6 alerts (use severity "page" for symptoms users feel such as SLO burn, "ticket" for causes), signals specific to this design on the component ids, and 1 or 2 "debug" paths. Alerts and signals must reference real node ids and SLO ids. Do NOT add telemetry components (metrics store, log store, collector) as nodes: standard signals per component type are built in.
12. Add 4 to 6 "questions": follow-ups an interviewer would ask about this design (failures, scale, consistency, trade-offs), each with a model answer of 2 to 4 sentences and "targets" listing the component ids it is about.
13. Do not use em dashes anywhere in the text.

JSON Schema:
${schema}

Example of a valid design (shortened to one flow):
\`\`\`json
${JSON.stringify(short)}
\`\`\`
`
}
