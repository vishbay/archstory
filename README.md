# ArchStory

**System design, one request at a time.**

Explore real architectures and watch each request travel through them hop by hop. Then build your own answer, check it against a reference, and get it reviewed.

**[Try the live demo →](https://vishbay.github.io/archstory/)**

![A redirect in the URL shortener design: the response travels back from the read replica, with the step explained in the Flow panel](docs/screenshot.png)

## Features

- **Explore** 22 built-in designs with step-by-step request flows: URL shortener, news feed, ride hailing, chat, video streaming, checkout, ticket booking, file storage and sync, multi-tenant SaaS, autocomplete, rate limiter, notifications, web crawler, distributed key-value store, payment ledger and job scheduler, plus solutions architect scenarios: multi-region active-active app, monolith to cloud migration, RAG knowledge assistant, data platform, IoT telemetry and enterprise integration.
- **Any cloud**: switch between cloud-neutral names, AWS and GCP, with official icons.
- **Network and zones**: VPCs, subnets and availability-zone failure drills.
- **Regions and disaster recovery**: for designs with a `regions` section, a Regions view and a region failure drill with RTO, RPO, cross-region replication and the gaps in the plan.
- **Monitoring**: SLOs with error budgets, alerts (page or ticket), what to watch on each component and how to debug it, plus a telemetry layer you can switch on.
- **Practice**: draw your own design (type `/` to add components, start from a skeleton), record its flows and get automatic checks against a reference. Save attempts and track your progress.
- **Timed interviews**: the usual phases on a 30, 45 or 60 minute clock, with a checklist for each.
- **Estimate calculator**: requests per second, storage, bandwidth and cache size, with the arithmetic shown, plus a rough monthly cloud cost with editable prices and the usual ways to cut it.
- **Follow-up questions**: 132 questions interviewers ask next, with model answers and a daily spaced-repetition drill.
- **AI interviewer** (optional, your own API key): a mock interview that asks one question at a time about your design, by text or voice.
- **Review with your own AI**: ArchStory writes the prompt and its findings appear on your design. Paste it into any assistant, or optionally connect your own API key (Anthropic, OpenAI, Gemini, DeepSeek, or a local server such as Ollama) to send it from the app.
- **Any question, not just the built-in ones**: import any other system design question as JSON, or have your own AI write one. An imported design gets everything the built-in ones do: Explore, Practice with automatic checks, timed interviews, AI review and the follow-up drill. No AI or server of its own, no account. An API key stays in your browser and goes only to the provider you pick.

## Quick start

```bash
npm install
npm run dev     # http://localhost:5173
npm test
```

## What AI costs

Everything except the AI features is free and runs in your browser. For the AI features you have two options:

- **Copy and paste** (the default): ArchStory writes the prompt and you paste it into ChatGPT, Claude, Gemini or any assistant. It costs nothing beyond the subscription you already have.
- **Your own API key** (optional): ArchStory sends the prompt for you and you pay the provider per token. A local model through Ollama or LM Studio costs nothing.

Estimated cost per action and per month, in US dollars, at list prices on 10 November 2026:

| Provider | Model | Review | Make a design | AI interview (20 questions) | Light month | Regular month | Intensive month |
|---|---|---|---|---|---|---|---|
| Anthropic | Claude Haiku 5.5 | $0.002 | $0.006 | $0.004 | $0.04 | $0.09 | $0.30 |
| Anthropic | Claude Sonnet 5.5 | $0.04 | $0.11 | $0.07 | $0.68 | $1.79 | $5.52 |
| Anthropic | Claude Opus 5.5 | $0.08 | $0.23 | $0.13 | $1.36 | $3.57 | $11.04 |
| OpenAI | GPT-6 Luna | $0.002 | $0.006 | $0.02 | $0.06 | $0.19 | $0.66 |
| OpenAI | GPT-6.1 Terra | $0.02 | $0.06 | $0.16 | $0.60 | $1.92 | $6.61 |
| OpenAI | GPT-6.1 Sol | $0.04 | $0.11 | $0.32 | $1.20 | $3.84 | $13.22 |
| OpenAI | GPT-6 Astra | $0.20 | $0.57 | $1.61 | $5.98 | $19.19 | $66.09 |
| Google | Gemini 3.1 Flash-Lite | $0.006 | $0.02 | $0.04 | $0.16 | $0.51 | $1.73 |
| Google | Gemini 3.8 Flash | $0.02 | $0.04 | $0.12 | $0.45 | $1.44 | $4.96 |
| Google | Gemini 4 Argon | $0.04 | $0.11 | $0.32 | $1.20 | $3.84 | $13.22 |
| DeepSeek | DeepSeek Flash | $0.005 | $0.01 | $0.05 | $0.16 | $0.54 | $1.89 |
| DeepSeek | DeepSeek V4 Pro | $0.02 | $0.05 | $0.21 | $0.67 | $2.24 | $7.88 |
| Local | Ollama or LM Studio | free | free | free | free | free | free |

How these are worked out:

- **Measured prompt sizes**: a review sends about 5,700 tokens and gets about 2,000 back; making a design sends about 6,700 and gets 6,000 to 9,000 back. One reply in four is assumed to need the automatic fix request, which roughly doubles that call.
- **AI interview**: 22 calls (opening, 20 answers, feedback). Every reply re-sends the conversation, about 150,000 input tokens in total. ArchStory turns on Anthropic's prompt caching, which charges most of that at the cached rate; the OpenAI, Gemini and DeepSeek figures assume no caching, so treat them as an upper limit (all three cache repeated prompts automatically).
- **Months**: light is 8 reviews, 2 designs and 2 interviews; regular is 20, 4 and 8; intensive (the month before an interview) is 60, 10 and 30.
- **Price changes**: Google has announced that Gemini 4 Argon doubles from 1 December 2026 and Gemini 3.8 Flash from 1 January 2027. Check current prices: [Anthropic](https://platform.claude.com/docs/en/about-claude/pricing), [OpenAI](https://openai.com/api/pricing/), [Google](https://ai.google.dev/gemini-api/docs/pricing), [DeepSeek](https://api-docs.deepseek.com/quick_start/pricing). DeepSeek charges half price outside its peak hours (01:00 to 04:00 and 06:00 to 10:00 UTC on weekdays); the table uses the peak price. Add your own prices in the AI settings to see a running cost during an AI interview.
- **Voice**: speaking your answers and hearing questions read aloud use your browser's built-in speech features, so they add no cost. Chrome sends speech to Google to turn it into text. A dedicated speech service would add roughly $0.005 a minute of speech (Gemini 3.5 Transcribe Live), about $0.10 to $0.15 for a 45-minute interview.

For interview practice, a mid-range model (Claude Sonnet 5.5, GPT-6.1 Sol or Gemini 3.8 Flash) gives good reviews and probing questions for a few dollars a month. The smallest models are close to free and fine for quick drills; the largest ones rarely improve a design review enough to justify the cost. You can also set a model per feature in the AI settings, for example a strong model for reviews and making designs and a faster, cheaper one for the AI interviewer.

## Add a design

The built-in designs are a starting set. You can add any other question, in the app or in the repo.

**In the app** (nothing to install): use Import in the left panel or on the home page, or Prompt for your AI to have an assistant write one. Imported designs are saved in your browser under My designs, and you can practise them exactly like the library.

**In the repo**, to contribute one to the library: Designs are JSON files in the [`archstory/v1`](public/schema/archstory-v1.json) format: components, connections and request flows. Layout is automatic. Add a file to `src/library/` and run `npm test` to validate it.

### Multi-region designs

Add a top-level `regions` section only when the question is about more than one region (disaster recovery, global users). It lists the regions and how the design survives losing one:

- `regions`: two or more `{ id, name, role }`. `role` is `primary` or `secondary` for `backup-restore`, `pilot-light` and `warm-standby`; every region is `active` for `active-active`.
- `strategy`: `backup-restore` (hours to recover), `pilot-light` (tens of minutes), `warm-standby` (minutes) or `active-active` (near zero).
- `rto` and `rpo`: the targets as text, for example `"15 min"` and `"1 min"`.
- `failover`: how traffic moves, for example `"DNS failover on health checks"`. `dnsTtl` (seconds, optional) is checked against the RTO.

Two optional fields on components say where they run. `regions` is `all` (a copy in every region, run as the strategy says), `primary` (only in the primary region) or `global` (DNS, CDN, a global load balancer or a globally replicated store); edge components (DNS, CDN, WAF) default to `global`, everything else to `all`, and clients and third parties always sit outside the regions. `replication` on a data store is `sync` (nothing lost, every write waits for a cross-region round trip), `async` (loses the replication lag), `backup` (loses everything since the last backup) or `none`; it defaults to `backup` for backup and restore, `none` for caches and `async` otherwise.

```json
"regions": {
  "regions": [
    { "id": "use1", "name": "us-east-1", "role": "primary" },
    { "id": "usw2", "name": "us-west-2", "role": "secondary" }
  ],
  "strategy": "warm-standby", "rto": "15 min", "rpo": "1 min",
  "failover": "DNS failover on health checks", "dnsTtl": 60
},
"nodes": [
  { "id": "db", "label": "Orders DB", "kind": "sql_db", "replication": "async" },
  { "id": "fraud", "label": "Fraud Check", "kind": "service", "regions": "primary" }
]
```

### Hybrid and on-premises designs

For migration or hybrid questions, give a component that runs in the customer's own data centre `"site": "onprem"` (the default is `cloud`). It is drawn in an On-premises box outside the VPC, the zones and the regions, and failing a cloud zone or region does not touch it; the Resilience panel still warns that the data centre is a single site. An on-prem component takes no cloud `subnet`, `regions` or `replication`. Connect it to the cloud through a `hybrid_link` node (Direct Connect, Cloud Interconnect or a site-to-site VPN), and hops across it are described with their latency and per-GB cost.

```json
{ "id": "link", "label": "Hybrid Link", "kind": "hybrid_link", "cloud": { "aws": "Direct Connect", "gcp": "Cloud Interconnect" } },
{ "id": "erp", "label": "ERP", "kind": "service", "site": "onprem" }
```

Other kinds for these questions: `mqtt_broker` (IoT devices), `vector_db` (embeddings for retrieval), `llm` (a model endpoint such as Amazon Bedrock or Vertex AI), `schema_registry` and `data_catalog`. Any other kind still works and draws as a generic component.

## License

[MIT](LICENSE). AWS and Google Cloud icons are downloaded from the providers on first run and are not part of this repository; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). ArchStory is not affiliated with Amazon or Google.
