// Official AWS / Google Cloud product icons (fetched by `npm run icons` into public/icons/<cloud>/<key>.svg).
// A node gets an icon only when its provider name names the product exactly (node.cloud.aws = "ElastiCache Redis"
// → elasticache). No name, no match, or a self-managed "X on Y" (Cassandra on EC2) → the emoji. First match wins.
import type { DNode } from './schema'

type Cloud = 'aws' | 'gcp'
interface Product { key: string; match: RegExp }

export const PRODUCTS: Record<Cloud, Product[]> = {
  aws: [
    { key: 'cloudfront', match: /cloudfront/i },
    { key: 'global-accelerator', match: /global accelerator/i },
    { key: 'alb', match: /\balb\b|application load balancer/i },
    { key: 'nlb', match: /\bnlb\b|network load balancer/i },
    { key: 'elb', match: /\belb\b|load balanc/i },
    { key: 'api-gateway', match: /api gateway/i },
    { key: 'route53', match: /route ?53/i },
    { key: 'waf', match: /\bwaf\b/i },
    { key: 'shield', match: /shield/i },
    { key: 'fargate', match: /fargate/i },
    { key: 'ecs', match: /\becs\b|elastic container service/i },
    { key: 'eks', match: /\beks\b|elastic kubernetes/i },
    { key: 'app-runner', match: /app runner/i },
    { key: 'lambda', match: /lambda/i },
    { key: 'ec2', match: /\bec2\b/i },
    { key: 'batch', match: /aws batch/i },
    { key: 'elasticache', match: /elasticache|valkey/i },
    { key: 'memorydb', match: /memorydb/i },
    { key: 'aurora', match: /aurora/i },
    { key: 'rds', match: /\brds\b/i },
    { key: 'dynamodb', match: /dynamo/i },
    { key: 'documentdb', match: /documentdb/i },
    { key: 'keyspaces', match: /keyspaces|cassandra/i },
    { key: 'neptune', match: /neptune/i },
    { key: 'timestream', match: /timestream/i },
    { key: 's3', match: /\bs3\b/i },
    { key: 'sqs', match: /\bsqs\b/i },
    { key: 'sns', match: /\bsns\b/i },
    { key: 'kinesis', match: /kinesis/i },
    { key: 'msk', match: /\bmsk\b|kafka/i },
    { key: 'eventbridge', match: /eventbridge/i },
    { key: 'step-functions', match: /step functions/i },
    { key: 'redshift', match: /redshift/i },
    { key: 'athena', match: /athena/i },
    { key: 'opensearch', match: /opensearch|elasticsearch/i },
    { key: 'glue', match: /\bglue\b/i },
    { key: 'cognito', match: /cognito/i },
    { key: 'iam', match: /\biam\b/i },
    { key: 'secrets-manager', match: /secrets manager/i },
    { key: 'location', match: /location service/i },
    { key: 'ses', match: /\bses\b|simple email/i },
    { key: 'pinpoint', match: /pinpoint/i },
    { key: 'cloudwatch', match: /cloudwatch/i },
    { key: 'mediaconvert', match: /mediaconvert/i },
  ],
  gcp: [
    { key: 'cloud-cdn', match: /cloud cdn|media cdn/i },
    { key: 'load-balancing', match: /load balanc/i },
    { key: 'api-gateway', match: /api gateway/i },
    { key: 'apigee', match: /apigee/i },
    { key: 'cloud-dns', match: /cloud dns/i },
    { key: 'cloud-armor', match: /armor/i },
    { key: 'cloud-run', match: /cloud run/i },
    { key: 'cloud-functions', match: /functions/i },
    { key: 'gke', match: /\bgke\b|kubernetes engine/i },
    { key: 'compute-engine', match: /compute engine|\bgce\b/i },
    { key: 'app-engine', match: /app engine/i },
    { key: 'memorystore', match: /memorystore/i },
    { key: 'cloud-sql', match: /cloud sql/i },
    { key: 'spanner', match: /spanner/i },
    { key: 'firestore', match: /firestore/i },
    { key: 'datastore', match: /datastore/i },
    { key: 'bigtable', match: /bigtable/i },
    { key: 'cloud-storage', match: /cloud storage|\bgcs\b/i },
    { key: 'pubsub', match: /pub\/?sub/i },
    { key: 'eventarc', match: /eventarc/i },
    { key: 'cloud-tasks', match: /cloud tasks/i },
    { key: 'cloud-scheduler', match: /scheduler/i },
    { key: 'workflows', match: /workflows/i },
    { key: 'dataflow', match: /dataflow/i },
    { key: 'bigquery', match: /bigquery/i },
    { key: 'looker', match: /looker/i },
    { key: 'identity-platform', match: /identity platform|firebase auth/i },
    { key: 'iam', match: /\biam\b/i },
    { key: 'secret-manager', match: /secret manager/i },
    { key: 'maps', match: /maps|fleet engine/i },
    { key: 'monitoring', match: /monitoring|cloud logging/i },
  ],
}

/** URL of the official icon for this node in this cloud, or null to use the emoji. */
export function cloudIconUrl(n: DNode, cloud: string): string | null {
  if (cloud !== 'aws' && cloud !== 'gcp') return null
  const name = n.cloud?.[cloud]
  if (!name || / on /i.test(name)) return null
  const key = PRODUCTS[cloud].find(p => p.match.test(name))?.key
  return key ? `${import.meta.env.BASE_URL}icons/${cloud}/${key}.svg` : null
}
