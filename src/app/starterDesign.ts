// The smallest design that still shows the useful parts of the format: components, connections, one
// flow with an explanation and an example message, and a note. Offered in the Import dialog as a starting point.
export const STARTER_DESIGN = {
  schema: 'archstory/v1',
  id: 'my-first-design',
  meta: { title: 'My first design', summary: 'A notes API with a cache in front of a database.', tags: ['starter'] },
  requirements: {
    functional: ['Read a note by id'],
    nonFunctional: ['Reads are fast (< 100 ms p99)'],
    scale: [{ label: 'Reads', value: '1k requests/s' }],
  },
  nodes: [
    { id: 'client', label: 'Client', kind: 'web_client' },
    { id: 'api', label: 'Notes API', kind: 'service', cloud: { aws: 'ECS Fargate', gcp: 'Cloud Run' } },
    { id: 'cache', label: 'Cache', kind: 'cache', cloud: { aws: 'ElastiCache Redis', gcp: 'Memorystore Redis' } },
    { id: 'db', label: 'Database', kind: 'sql_db', cloud: { aws: 'Aurora PostgreSQL', gcp: 'Cloud SQL Postgres' } },
  ],
  edges: [
    { from: 'client', to: 'api' },
    { from: 'api', to: 'cache' },
    { from: 'api', to: 'db' },
  ],
  flows: [
    {
      id: 'read',
      title: 'Read a note',
      summary: 'Cache first; fall back to the database on a miss.',
      steps: [
        { from: 'client', to: 'api', kind: 'req', label: 'GET /notes/42', detail: 'The client asks for one note.', payload: 'GET /notes/42 HTTP/2' },
        { from: 'api', to: 'cache', kind: 'req', label: 'GET note:42', detail: 'Check the cache first: most reads are for recent notes.' },
        { from: 'cache', to: 'api', kind: 'res', label: 'MISS' },
        { from: 'api', to: 'db', kind: 'req', label: 'SELECT … WHERE id = 42', detail: 'On a miss, read from the source of truth.' },
        { from: 'db', to: 'api', kind: 'res', label: 'row' },
        { from: 'api', to: 'client', kind: 'res', label: '200 OK', payload: '{ "id": 42, "text": "Hello" }' },
      ],
    },
  ],
  notes: [{ target: 'cache', kind: 'tradeoff', text: 'A cache makes reads fast but can serve slightly stale data after an update.' }],
}
