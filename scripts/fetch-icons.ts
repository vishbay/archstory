// Downloads the official AWS Architecture Icons and Google Cloud icon packages and copies only the
// icons listed in src/model/cloudIcons.ts into public/icons/<cloud>/<key>.svg.
// Update the URLs when a new quarterly package ships: https://aws.amazon.com/architecture/icons/ · https://cloud.google.com/icons
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PRODUCTS } from '../src/model/cloudIcons.ts'

const AWS_ZIP = 'https://d1.awsstatic.com/onedam/marketing-channels/website/public/shared/architecture-icon-release/Icon-package_07312026.5846e92413caa21490223536cc97f1269e44fa92.zip'
const GCP_CORE_ZIP = 'https://services.google.com/fh/files/misc/core-products-icons.zip'
const GCP_LEGACY_ZIP = 'https://services.google.com/fh/files/misc/google-cloud-legacy-icons.zip'

// key → file name stem in the AWS package: Arch_<stem>_48.svg, or Res_<stem>_48.svg for resource icons ("res:" prefix)
const AWS_SRC: Record<string, string> = {
  'cloudfront': 'Amazon-CloudFront', 'global-accelerator': 'AWS-Global-Accelerator', 'elb': 'Elastic-Load-Balancing',
  'alb': 'res:Elastic-Load-Balancing_Application-Load-Balancer', 'nlb': 'res:Elastic-Load-Balancing_Network-Load-Balancer',
  'api-gateway': 'Amazon-API-Gateway', 'route53': 'Amazon-Route-53', 'waf': 'AWS-WAF', 'shield': 'AWS-Shield',
  'fargate': 'AWS-Fargate', 'ecs': 'Amazon-Elastic-Container-Service', 'eks': 'Amazon-Elastic-Kubernetes-Service',
  'app-runner': 'AWS-App-Runner', 'lambda': 'AWS-Lambda', 'ec2': 'Amazon-EC2', 'batch': 'AWS-Batch',
  'elasticache': 'Amazon-ElastiCache', 'memorydb': 'Amazon-MemoryDB', 'aurora': 'Amazon-Aurora', 'rds': 'Amazon-RDS',
  'dynamodb': 'Amazon-DynamoDB', 'documentdb': 'Amazon-DocumentDB', 'keyspaces': 'Amazon-Keyspaces',
  'neptune': 'Amazon-Neptune', 'timestream': 'Amazon-Timestream', 's3': 'Amazon-Simple-Storage-Service',
  'sqs': 'Amazon-Simple-Queue-Service', 'sns': 'Amazon-Simple-Notification-Service', 'kinesis': 'Amazon-Kinesis-Data-Streams',
  'msk': 'Amazon-Managed-Streaming-for-Apache-Kafka', 'eventbridge': 'Amazon-EventBridge', 'step-functions': 'AWS-Step-Functions',
  'redshift': 'Amazon-Redshift', 'athena': 'Amazon-Athena', 'opensearch': 'Amazon-OpenSearch-Service', 'glue': 'AWS-Glue',
  'cognito': 'Amazon-Cognito', 'iam': 'AWS-Identity-and-Access-Management', 'secrets-manager': 'AWS-Secrets-Manager',
  'location': 'Amazon-Location-Service', 'ses': 'Amazon-Simple-Email-Service', 'pinpoint': 'Amazon-Pinpoint',
  'cloudwatch': 'Amazon-CloudWatch', 'mediaconvert': 'AWS-Elemental-MediaConvert',
}

// key → folder in the core package (new-style unique icon) or the legacy package
const GCP_SRC: Record<string, { core: string } | { legacy: string }> = {
  'cloud-cdn': { legacy: 'cloud_cdn' }, 'load-balancing': { legacy: 'cloud_load_balancing' },
  'api-gateway': { legacy: 'cloud_api_gateway' }, 'apigee': { core: 'Apigee' }, 'cloud-dns': { legacy: 'cloud_dns' },
  'cloud-armor': { legacy: 'cloud_armor' }, 'cloud-run': { core: 'Cloud Run' }, 'cloud-functions': { legacy: 'cloud_functions' },
  'gke': { core: 'GKE' }, 'compute-engine': { core: 'Compute Engine' }, 'app-engine': { legacy: 'app_engine' },
  'memorystore': { legacy: 'memorystore' }, 'cloud-sql': { core: 'Cloud SQL' }, 'spanner': { legacy: 'cloud_spanner' },
  'firestore': { legacy: 'firestore' }, 'datastore': { legacy: 'datastore' }, 'bigtable': { legacy: 'bigtable' },
  'cloud-storage': { core: 'Cloud Storage' }, 'pubsub': { legacy: 'pubsub' }, 'eventarc': { legacy: 'eventarc' },
  'cloud-tasks': { legacy: 'cloud_tasks' }, 'cloud-scheduler': { legacy: 'cloud_scheduler' }, 'workflows': { legacy: 'workflows' },
  'dataflow': { legacy: 'dataflow' }, 'bigquery': { core: 'BigQuery' }, 'looker': { core: 'Looker' },
  'identity-platform': { legacy: 'identity_platform' }, 'iam': { legacy: 'identity_and_access_management' },
  'secret-manager': { legacy: 'secret_manager' }, 'maps': { legacy: 'google_maps_platform' }, 'monitoring': { legacy: 'cloud_monitoring' },
}

const work = mkdtempSync(join(tmpdir(), 'sdl-icons-'))
async function unpack(url: string, name: string) {
  const zip = join(work, `${name}.zip`), dir = join(work, name)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()))
  execFileSync('unzip', ['-q', '-o', zip, '-d', dir])
  return dir
}
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.name === '__MACOSX' ? [] : e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))

const [awsDir, coreDir, legacyDir] = await Promise.all([unpack(AWS_ZIP, 'aws'), unpack(GCP_CORE_ZIP, 'core'), unpack(GCP_LEGACY_ZIP, 'legacy')])
const awsFiles = walk(awsDir), coreFiles = walk(coreDir), legacyFiles = walk(legacyDir)
const missing: string[] = []

rmSync('public/icons', { recursive: true, force: true })
for (const cloud of ['aws', 'gcp'] as const) mkdirSync(`public/icons/${cloud}`, { recursive: true })

for (const { key } of PRODUCTS.aws) {
  const stem = AWS_SRC[key]
  const file = stem && (stem.startsWith('res:')
    ? awsFiles.find(f => f.endsWith(`/Res_${stem.slice(4)}_48.svg`))
    : awsFiles.find(f => f.endsWith(`/48/Arch_${stem}_48.svg`)))
  if (file) copyFileSync(file, `public/icons/aws/${key}.svg`); else missing.push(`aws:${key}`)
}
for (const { key } of PRODUCTS.gcp) {
  const src = GCP_SRC[key]
  const file = !src ? undefined : 'core' in src
    ? coreFiles.find(f => f.includes(`/${src.core}/SVG/`) && f.endsWith('.svg'))
    : legacyFiles.find(f => f.endsWith(`/${src.legacy}/${src.legacy}.svg`))
  if (file) copyFileSync(file, `public/icons/gcp/${key}.svg`); else missing.push(`gcp:${key}`)
}
rmSync(work, { recursive: true, force: true })

writeFileSync('public/icons/NOTICE.md', `# Third-party icons

- \`aws/\`: AWS Architecture Icons, © Amazon Web Services, Inc. or its affiliates. Used unmodified to draw
  architecture diagrams, as permitted at https://aws.amazon.com/architecture/icons/
- \`gcp/\`: Google Cloud product icons, © Google LLC. Used to reference Google Cloud products in architecture
  diagrams, as permitted at https://cloud.google.com/icons

These icons are not covered by this project's MIT license, are not committed to the repository, and are
downloaded from the providers by \`npm run icons\`. ArchStory is not affiliated with or endorsed by Amazon or Google.
See THIRD_PARTY_NOTICES.md.
`)
console.log(`icons: ${PRODUCTS.aws.length + PRODUCTS.gcp.length - missing.length} copied`)
if (missing.length) { console.error('missing:', missing.join(', ')); process.exit(1) }
