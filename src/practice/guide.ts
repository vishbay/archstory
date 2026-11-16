// The content of the interview guide page: how to approach a system design interview. Plain data so it can be tested,
// with the phases and their minutes coming from the timed mode so the guide and the clock always agree.
import { TIERS, type Tier } from '../model/schema'
import { PHASES } from './timed'

export interface Principle { title: string; body: string }
export const PRINCIPLES: Principle[] = [
  { title: 'Drive the conversation', body: 'You lead. Say what you will do next and why: "I will start with requirements, then rough numbers, then draw." Interviewers rate structure as much as the final design.' },
  { title: 'Start simple, then evolve', body: 'Draw the smallest design that works: a client, a service and a database. Then ask "what breaks first?" and fix only that. A design that grows for stated reasons beats one that starts complicated.' },
  { title: 'Let numbers choose', body: '500 requests a second and 500,000 need different designs. If a number does not change a decision it was not needed, and if a decision has no number behind it you are guessing.' },
  { title: 'Every choice has a cost', body: 'Say what you gain and what you give up: "A cache makes reads fast but they can be stale. For a feed that is fine, for an account balance it is not." Name the alternative you rejected.' },
  { title: 'Walk a request through it', body: 'Trace one write and one read from the client to the data and back, naming each hop. A missing component, or a hop with no reason, shows up at once. This is what ArchStory flows are for.' },
  { title: 'Assume failure', body: 'For each component ask what happens when it is slow, down or returns bad data. Replicas, timeouts, retries with idempotency, queues and fallbacks all come from this one question.' },
  { title: 'Think out loud, and check in', body: 'Say your reasoning, and pause at decisions: "I could do A or B, I will take A because of X. Does that fit what you want?" It turns a quiz into a design conversation.' },
]

export interface Question { ask: string; changes: string }
export interface QuestionGroup { title: string; why: string; questions: Question[] }
export const CLARIFY: QuestionGroup[] = [
  { title: 'Scope', why: 'Decides what you draw first and what you leave out.', questions: [
    { ask: 'What are the two or three things users must be able to do?', changes: 'Those become the first design. Everything else waits.' },
    { ask: 'Who uses it: consumers, businesses, other services? Is there an admin side?', changes: 'Adds or removes sign-in, roles, tenant isolation and abuse handling.' },
    { ask: 'What is explicitly out of scope?', changes: 'Protects your time. Say it out loud so it is agreed.' },
  ] },
  { title: 'Users and scale', why: 'Turns "big" into numbers you can design for.', questions: [
    { ask: 'How many users, and how many are active in a day?', changes: 'Sets requests per second and how much data exists.' },
    { ask: 'What is the read to write ratio, and what is the peak compared with the average?', changes: 'Read-heavy points to caching and replicas. Spiky traffic points to queues and autoscaling.' },
    { ask: 'How big is each item, how fast does it grow and how long is it kept?', changes: 'Drives storage, partitioning and whether old data moves to cheaper storage.' },
  ] },
  { title: 'Quality goals', why: 'The non-functional requirements are where designs differ most.', questions: [
    { ask: 'How fast must it feel? Is there a latency target for most requests?', changes: 'Decides caching, where data lives and how many hops are allowed.' },
    { ask: 'How available must it be, and what does an hour of downtime cost?', changes: 'Decides replication across zones or regions, and how much failover you pay for.' },
    { ask: 'May a reader see slightly stale data, or must every read be the latest?', changes: 'Strong consistency limits caching and replication. Eventual consistency opens them up.' },
    { ask: 'Can we ever lose data, even a little?', changes: 'Decides write-ahead logs, synchronous replication and backup strategy.' },
  ] },
  { title: 'Constraints', why: 'Real systems start from something.', questions: [
    { ask: 'Is it one region or global? Are there data residency rules?', changes: 'Brings in CDNs, regional deployments and the consistency problems that come with them.' },
    { ask: 'Is there an existing stack, a cloud already chosen, or a small team?', changes: 'Favours boring, managed pieces over clever ones.' },
    { ask: 'Does it handle payments or personal data?', changes: 'Adds audit, encryption, key management and compliance scope.' },
  ] },
]

export interface PhaseGuide { do: string[]; say: string; avoid: string }
const GUIDE: Record<string, PhaseGuide> = {
  requirements: {
    do: ['Restate the problem in one sentence.', 'List three to five core features and agree them.', 'Ask the scale and quality questions from the section above, and use the answers.', 'Say what is out of scope.'],
    say: '"So we are building X for about Y users. I will focus on A and B and leave C out unless you want it. Does that match?"',
    avoid: 'Drawing before scope is agreed, or asking a long list of questions and then ignoring the answers.' },
  estimates: {
    do: ['Turn users into requests per second: a day is about 86,400 seconds, and peak is two to four times the average.', 'Split reads from writes.', 'Storage = new items per day x size x days kept x copies.', 'Finish each number with what it means for the design.'],
    say: '"10 million daily users with 5 reads each is 50 million a day, about 600 a second, call it 2,000 at peak. Reads dominate, so I will cache them."',
    avoid: 'False precision, or arithmetic that never reaches a decision.' },
  interface: {
    do: ['List the main endpoints or messages with their inputs and outputs.', 'Name the main entities and the key each is looked up by.', 'Pick a datastore from the access pattern first: lookup by key, range scan, joins or text search. Then name the product.'],
    say: '"The hot path is get by id, so a key-value lookup. A relational database also works at this size, and I would pick it if we need joins later."',
    avoid: 'Designing every endpoint, or naming a database with no reason.' },
  design: {
    do: ['Draw client, entry point (load balancer or gateway), services and data, one component at a time, saying why each is there.', 'Walk the main write and the main read end to end.', 'Keep slow work (email, thumbnails, fan-out) off the request path with a queue.'],
    say: '"A write goes to the service, is stored, and returns. The slow part goes on a queue, so the request stays fast."',
    avoid: 'Ten boxes before a single flow has been walked, or a component with no stated reason.' },
  deep: {
    do: ['Ask what breaks first at ten times the load, and fix that.', 'Pick one or two areas and go deep: partitioning, replication, caching policy, ordering and duplicates, or a failed zone.', 'Say where data may be stale and why that is acceptable.', 'If the interviewer picks the topic, follow it.'],
    say: '"At 10x the database write rate is the limit, so I would partition by user id. That makes cross-user queries hard, which I accept because they are rare."',
    avoid: 'Spreading thin across everything, or naming a technology (a queue, a log) without saying why it fits.' },
  wrap: {
    do: ['Summarise the design in three sentences.', 'Name the biggest risks and what you traded away.', 'Say how you would run it: SLOs, alerts on what users feel, tracing to find a cause.', 'Say what you would do next with more time.'],
    say: '"To recap: ... The main risks are ... I would watch ... With more time I would ..."',
    avoid: 'Ending abruptly, or adding new components in the last minute.' },
}
export const phaseGuide = (id: string): PhaseGuide => GUIDE[id]
/** What each phase leaves you holding, shown under the time bar. */
export const OUTPUTS: Record<string, string> = {
  requirements: 'An agreed scope and quality goals',
  estimates: 'Load and storage numbers',
  interface: 'Endpoints and the main tables',
  design: 'A diagram with the main flows walked',
  deep: 'The bottleneck and failure answered',
  wrap: 'A summary, the risks and next steps',
}
export const GUIDE_PHASES = PHASES.map(p => ({ id: p.id, title: p.title, minutes: p.minutes, goal: p.goal, output: OUTPUTS[p.id], ...GUIDE[p.id] }))

/** The steps of the estimate in the worked example, as a chain. */
export const ESTIMATE_CHAIN = [
  { value: '10 M', label: 'daily users' },
  { op: 'x 5 reads', value: '50 M', label: 'reads a day' },
  { op: 'divide by 86,400', value: '580', label: 'a second, average' },
  { op: 'x 3 for peak', value: '1,700', label: 'a second at peak' },
]

/** Rough latencies in nanoseconds, for a chart on a log scale. */
export const LATENCIES = [
  { label: 'Memory read', ns: 100, text: '100 ns' },
  { label: 'SSD read', ns: 100_000, text: '0.1 ms' },
  { label: 'Round trip in a data centre', ns: 500_000, text: '0.5 ms' },
  { label: 'Disk seek', ns: 10_000_000, text: '10 ms' },
  { label: 'Across an ocean', ns: 150_000_000, text: '100 to 150 ms' },
]

/** A design growing for stated reasons: boxes on a small grid, with the ones added in that step marked. */
export interface MiniBox { id: string; label: string; x: number; y: number; added?: boolean }
export interface MiniStage { title: string; why: string; boxes: MiniBox[]; edges: [string, string][] }
export const EVOLVE: MiniStage[] = [
  { title: 'Version 1', why: 'The smallest thing that works.',
    boxes: [{ id: 'c', label: 'Client', x: 0, y: 1 }, { id: 's', label: 'Service', x: 2, y: 1 }, { id: 'd', label: 'Database', x: 3, y: 1 }],
    edges: [['c', 's'], ['s', 'd']] },
  { title: 'Reads dominate', why: 'Add a load balancer so there can be more instances, and a cache for hot reads.',
    boxes: [{ id: 'c', label: 'Client', x: 0, y: 1 }, { id: 'l', label: 'Load balancer', x: 1, y: 1, added: true }, { id: 's', label: 'Service x3', x: 2, y: 1 }, { id: 'd', label: 'Database', x: 3, y: 1 }, { id: 'k', label: 'Cache', x: 2, y: 2, added: true }],
    edges: [['c', 'l'], ['l', 's'], ['s', 'd'], ['s', 'k']] },
  { title: 'Slow work and failures', why: 'Move slow work to a queue and workers, and add a replica so losing the database is survivable.',
    boxes: [{ id: 'c', label: 'Client', x: 0, y: 1 }, { id: 'l', label: 'Load balancer', x: 1, y: 1 }, { id: 's', label: 'Service x3', x: 2, y: 1 }, { id: 'd', label: 'Database', x: 3, y: 1 }, { id: 'k', label: 'Cache', x: 2, y: 2 }, { id: 'q', label: 'Queue', x: 2, y: 0, added: true }, { id: 'w', label: 'Workers', x: 3, y: 0, added: true }, { id: 'r', label: 'Replica', x: 3, y: 2, added: true }],
    edges: [['c', 'l'], ['l', 's'], ['s', 'd'], ['s', 'k'], ['s', 'q'], ['q', 'w'], ['w', 'd'], ['d', 'r']] },
]


export const LOOP = [
  { step: 'Need', text: 'What the requirement or number demands.', example: '2,000 reads a second on data that changes rarely.' },
  { step: 'Options', text: 'Two real alternatives.', example: 'A bigger database, or a cache in front of it.' },
  { step: 'Pick', text: 'Choose one and say why.', example: 'A cache with a short expiry: cheaper, and reads are most of the load.' },
  { step: 'Cost', text: 'What it costs and how you would handle that.', example: 'Reads can be five minutes stale. Pages that must be fresh skip the cache. If the cache is down the database takes the load, so size for it.' },
]

export interface Rule { label: string; value: string }
export const NUMBERS: Rule[] = [
  { label: 'Per day to per second', value: '1 million a day is about 12 a second. 10 million is about 120, 100 million about 1,200, and 1 billion about 12,000. Divide by 86,400, or by 100,000 for a quick answer.' },
  { label: 'Peak against average', value: 'Two to four times the average. Higher for spiky traffic such as sales or live events.' },
  { label: 'Sizes', value: 'A row or small JSON message is 0.1 to 1 KB. A compressed photo is roughly 0.2 to 3 MB. A minute of 1080p video is roughly 40 MB.' },
  { label: 'Storage per year', value: 'New items per day x size x 365 x copies (often 3 for replication). 1 million items a day at 1 KB is about 365 GB a year, or about 1.1 TB with three copies.' },
  { label: 'Rough latencies', value: 'Memory about 100 ns. SSD read about 0.1 ms. A round trip inside a data centre about 0.5 ms. A disk seek about 10 ms. Across an ocean 100 to 150 ms. Orders of magnitude only.' },
  { label: 'One server', value: 'Anywhere from hundreds to a few thousand requests a second, depending on the work done per request. Say the assumption you use.' },
]

export interface Pattern { need: string; reach: string; cost: string }
export const PATTERNS: Pattern[] = [
  { need: 'Reads dominate', reach: 'A cache, read replicas, a CDN for static files', cost: 'Stale data, invalidation, a burst of load when a hot entry expires' },
  { need: 'One database cannot hold the data or the writes', reach: 'Partition (shard) by a key', cost: 'Hot keys, hard cross-partition queries and transactions, resharding' },
  { need: 'Slow or bursty work', reach: 'A queue and workers', cost: 'Results arrive later, retries need idempotency, ordering is limited' },
  { need: 'Data must not be lost', reach: 'Replicas in other zones, a write-ahead log, tested backups', cost: 'Write latency, replica lag, money' },
  { need: 'Spikes or abusive clients', reach: 'Rate limits, backpressure, load shedding', cost: 'Some requests are rejected; limits must be per tenant or key to be fair' },
  { need: 'Clients retry or send duplicates', reach: 'Idempotency keys', cost: 'Storing keys, and a unique constraint to enforce them' },
  { need: 'Users are far away', reach: 'A CDN, regional deployments', cost: 'Consistency across regions, cost, operational complexity' },
  { need: 'Many consumers need the same events', reach: 'A publish and subscribe stream', cost: 'Consumer lag, ordering only within a partition, schema changes' },
]

export const MISTAKES: string[] = [
  'Jumping to boxes before agreeing what is being built.',
  'Skipping numbers, or computing them and not using them.',
  'Stacking buzzwords (Kafka, Redis, microservices) with no reason attached.',
  'Never stating a trade-off, so every choice sounds free.',
  'Ignoring failure: a single database, no retries, nothing for a lost zone.',
  'Over-building the first version instead of growing it when something breaks.',
  'Going silent while thinking. Say what you are weighing.',
  'Ignoring a hint. If the interviewer asks about something, it is usually where they want to go.',
  'Forgetting an earlier requirement, such as the latency target, when making a later choice.',
  'Spending 25 minutes on one component and never finishing the end-to-end design.',
]

/** One question per tier of the canvas, in the order a request meets them. Walking the tiers is a way to not forget a layer. */
export const TIER_WALK: Record<Tier, { ask: string; examples: string }> = {
  client: { ask: 'Who is asking, and from what?', examples: 'Web, mobile, other services, devices. Each has its own network and retry behaviour.' },
  edge: { ask: 'Can anything be answered before it reaches you?', examples: 'DNS, TLS, a CDN for static files, a web application firewall.' },
  entry: { ask: 'Who may come in, and how fast?', examples: 'A load balancer or gateway, authentication, rate limits per user or tenant.' },
  services: { ask: 'Is the logic stateless, so you can add copies?', examples: 'Split into services only when there is a reason: scale, ownership or failure isolation.' },
  data: { ask: 'Where does state live, and what happens if it is lost?', examples: 'A cache, a database with replicas, object storage. Say how each is looked up.' },
  async: { ask: 'What can happen after the response is sent?', examples: 'Queues and workers, schedulers, streams. Retries need idempotency.' },
  external: { ask: 'What depends on someone else being up?', examples: 'Payments, email, maps, identity. Add a timeout and a fallback.' },
}
export const TIER_ORDER: readonly Tier[] = TIERS

export interface Trick { title: string; body: string }
export const TRICKS: Trick[] = [
  { title: 'Walk the tiers', body: 'Before you finish, run down the list above, from clients to external. It takes a minute and catches the layer you forgot, such as rate limits at the entry or a timeout on a third party.' },
  { title: 'Number your arrows', body: 'Label the write path 1, 2, 3 on the board and trace it out loud. It keeps you honest about every hop, and the interviewer can follow along.' },
  { title: 'Park a topic', body: 'Say "I will note that and come back to it." You stay on track and show that you are keeping a list of what is open.' },
  { title: 'Check in at the halfway point', body: 'Around 25 minutes, ask "Is there an area you would like me to go deeper on?" Interviewers often steer you toward what they want to see.' },
  { title: 'Ask for their priority', body: 'Ask "Is this more about scale, reliability or cost?" and design to the answer. It turns a generic design into one for this problem.' },
  { title: 'Break one thing on purpose', body: 'When the design is drawn, pick a component and say "if this fails, here is what happens." Answer it before you are asked.' },
  { title: 'Two options per decision', body: 'Name two real options before you pick one, even when one is clearly better. It shows judgement, not recall.' },
  { title: 'Summarise each phase in a sentence', body: 'Finish requirements, estimates and the design with one line: "So the key numbers are ...". It gives the interviewer a chance to correct you early.' },
]

export interface Level { level: string; looksFor: string; show: string }
/** Rough bars only: titles and expectations differ between companies. */
export const LEVELS: Level[] = [
  { level: 'Early career', looksFor: 'A working design built from standard parts, and a clear explanation of how it handles a request.', show: 'Clarify the problem, draw an end-to-end path, explain each box in plain words, and take hints well.' },
  { level: 'Mid and senior', looksFor: 'Ownership of the conversation, numbers that drive choices, depth in one or two areas, trade-offs and failure handled without being asked.', show: 'Lead the phases, estimate and use the result, go deep where it matters, and say what each choice costs.' },
  { level: 'Staff and above', looksFor: 'Judgement about an ambiguous problem: what to build first, what to leave out, and how it is run, rolled out and changed over years.', show: 'Challenge or reshape the requirements, weigh cost and operability, plan a migration, and choose where to spend the time.' },
]

export interface FrameworkRow { phase: string; fourStep: string; entityFirst: string }
/** Widely shared step-by-step guides, lined up against the phases of the timer. Summaries, not quotations. */
export const FRAMEWORKS: FrameworkRow[] = [
  { phase: 'requirements', fourStep: '1. Understand the problem and set the scope', entityFirst: 'Requirements' },
  { phase: 'estimates', fourStep: 'Inside steps 1 and 2: back-of-envelope numbers', entityFirst: 'Done when a number is needed' },
  { phase: 'interface', fourStep: 'Inside step 2: API design and the data model', entityFirst: 'Core entities, then API' },
  { phase: 'design', fourStep: '2. Propose a high-level design and get buy-in', entityFirst: 'High-level design' },
  { phase: 'deep', fourStep: '3. Design deep dive', entityFirst: 'Deep dives' },
  { phase: 'wrap', fourStep: '4. Wrap up', entityFirst: 'A closing summary' },
]

export interface AiStep { title: string; text: string; example: string }
/** How an AI works through a design problem, with the Ticket Booking design as the running example. */
export const AI_STEPS: AiStep[] = [
  { title: 'Find the hard part', text: 'Every problem has one core tension. Name it first, and design around it.', example: 'Never sell the same seat twice while millions arrive at once.' },
  { title: 'Turn requirements into numbers and rules that must never break', text: 'Write the load figures, and the invariants that no failure may violate.', example: '5 million fans for 50,000 seats, a hold in under 500 ms, and a seat sold at most once.' },
  { title: 'List entities and access patterns before choosing storage', text: 'How data is looked up decides the datastore, not the other way round.', example: 'Seats by event and section, holds that expire, bookings by id: a relational store for seats and a cache for holds.' },
  { title: 'Draw the smallest path, then walk a read and a write', text: 'Start with what must exist, and trace one request each way.', example: 'Fan, booking service, database. Walk "hold a seat" and "pay".' },
  { title: 'Attack it', text: 'Try ten times the load, a failed part, two requests at once, abuse and cost. Fix only what breaks.', example: 'Two fans click the same seat. A cache failover loses a hold. The payment provider times out.' },
  { title: 'Record each decision: need, options, pick, cost', text: 'Say what you chose, what you gave up, and how the cost is contained.', example: 'Holds in Redis are fast and expire on their own. A failover can lose one, so the seat row in the database still guarantees a single sale.' },
  { title: 'Check the details you feel sure about', text: 'Look up or test any limit, default or feature you are relying on. A plausible detail that is wrong is how a good-looking design fails.', example: 'Confirm what a service really supports before you build on it.' },
]
export const AI_CAVEATS: Trick[] = [
  { title: 'Copy the process, not the confidence', body: 'An AI recalls patterns quickly and follows a checklist without getting flustered, and it can also state a wrong specific in a confident tone. Verify numbers and limits, and say your assumptions out loud.' },
  { title: 'Ask what an AI cannot know', body: 'It does not know your interviewer, your company or what they care about. Ask for their priority and their constraints, then design to those.' },
  { title: 'Use an AI as a sparring partner', body: 'Ask it to interview you, challenge a choice, or find the weakest part of your design. ArchStory\'s Ask AI, AI interviewer and review do this with your own key.' },
]
