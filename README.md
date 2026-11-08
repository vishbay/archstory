# ArchStory

**System design, one request at a time.** Explore real architectures and watch each request travel through them hop by hop, then practise building your own and get it checked. Cloud-neutral, with AWS and GCP views.

## Run locally
```
npm install
npm run dev      # http://localhost:5173
npm test         # schema, layout, library, practice and review tests
npm run schema   # regenerate public/schema/archstory-v1.json from the zod source
```

## Designs are JSON
Every design (built-in, imported, or written by an AI) is one `archstory/v1` file:
nodes (with a `tier` or a known `kind`), optional `groups` (region, tenant, …), directed `edges`,
request `flows` made of steps, and `notes`. No coordinates: the canvas lays itself out in tier bands.

- Source of truth: `src/model/schema.ts` (zod). Published JSON Schema: `public/schema/archstory-v1.json`.
- Import checks include cross-references, e.g. a flow step with no edge to travel is rejected with its path.
- **Generate with AI** (sidebar) builds a prompt with the schema, the validator's rules and an example. Paste it into
  any assistant, then paste the whole answer into **Import**; code fences and prose are ignored. If the validator
  rejects it, **Copy a fix request** gives the assistant the exact errors to correct.
- **Share** copies a link. Built-in designs link by id; your own designs travel compressed inside the URL hash,
  so nothing is uploaded. Opening a link shows the design with a "Save to My designs" option.

## Watching a flow
While a flow plays, the camera frames the two components of each hop and a caption under them explains it
(the ◎ control turns this off; reduced-motion settings skip the animation). Restart zooms back out.

## Network layer
An optional `network` section adds a VPC, subnets and availability zones. Subnets claim tiers
(`"tiers": ["services", "async"]`), so most designs need only a few lines; a node can override with
`"subnet": "<id>"` or `"subnet": "none"` (managed service outside the VPC). Object stores and queues default
to outside the VPC. The **Network** toggle draws the VPC and subnet strips, shows zone counts, and the step
card explains each boundary a request crosses, including the AWS (subnet per AZ) vs GCP (regional subnet) difference.

## Availability zones
With the Network toggle on (and `network.zones` > 1):
- **Fail zone** tags every component with what a zone outage does to it (capacity lost, failover time, unaffected,
  DOWN), and the **Resilience** tab gives recovery time, data loss, the capacity rule and single points of failure.
- **Zones** view splits the VPC into zone columns with one box per instance (primary/standby marked). Flows are
  pinned to instances: a request stays in its entry zone, crosses zones only to reach a primary, and fails over
  to the promoted standby when its zone is down.
- A node's `ha` is one of `active-active`, `primary-standby`, `quorum`, `regional`, `single`. It defaults by kind
  (services active-active, SQL and cache primary-standby, managed services regional), so most designs set nothing.

## Layout
- `src/model/`: schema, parsing, known component kinds (icon, colour, default tier)
- `src/layout/bands.ts`: deterministic tier-band layout; each group gets a contiguous column range
- `src/library/*.json`: built-in designs, validated at load
- `src/app/`: explorer UI (architecture canvas, timeline, player, inspector, import/export, light/dark theme)
- `src/practice/`: practice attempts (pure edit operations) and the checks that compare an attempt with its reference

## Practice mode
Pick any library design as a problem and build your own answer on the same tier-band canvas:
- **Add** components by clicking or dragging from the palette (they land in their tier band), **connect** them with
  Connect mode (press C, click the caller, then what it calls; clicks keep chaining) or by dragging between component
  edges, and **record flows** by clicking components in the order a request travels. Step kinds (request, response,
  async) are inferred from the arrows. Undo/redo with ⌘Z / ⇧⌘Z (Ctrl+Z / Ctrl+Y); typing in one field is one step.
- **Check** runs automatically: every flow must run on your drawing, required pieces from the reference
  (cache, queue, replicas …) must be present, anti-patterns like clients talking to a database are flagged,
  and single points of failure are found with the zone analysis. Then flip **Mine / Reference** to compare.
- **Written reasoning** (optional toggle) adds requirements, estimates, API, data model and trade-off notes.
- Answers are saved per problem in the browser and can be exported as `archstory/v1` JSON.
- **Review** (AI review by copy and paste): copy a prompt with the problem, your design, your written reasoning,
  the automatic checks, a six-dimension rubric and (optionally) the reference; paste it into any assistant and
  paste the reply back. You get an overall score, per-dimension scores, findings marked on your components
  (critical, major, minor, done well) and follow-up questions. The reply format is `archstory-review/v1`
  (`src/practice/review.ts`); the same prompt and format can back a direct API integration later.

## Cloud icons
AWS and GCP modes show the official provider icons. They are **not committed**: before `npm run dev` and
`npm run build`, the icons are downloaded from AWS and Google if missing, and only those listed in
`src/model/cloudIcons.ts` are copied into the git-ignored `public/icons/` (`npm run icons` forces a refresh).
Offline, the app falls back to emoji. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
A node gets an icon only when its provider name names the product exactly (`"cloud": { "aws": "ElastiCache Redis" }`).
No provider name, an unknown product, or a self-managed `"X on Y"` (Cassandra on EC2) shows the emoji instead.
To support a new product, add a row in `src/model/cloudIcons.ts` and rerun the script.

## Add a design
Drop a valid `*.json` into `src/library/`. `npm test` fails if it doesn't parse.

## License
[MIT](LICENSE) for ArchStory's code and content. Cloud provider icons and trademarks are not covered; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). ArchStory is not affiliated with Amazon or Google.
