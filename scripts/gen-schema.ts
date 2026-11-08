// Writes the published JSON Schema (for LLMs and editors) from the zod source of truth.
import { writeFileSync } from 'node:fs'
import { z } from 'zod'
import { DesignSchema } from '../src/model/schema.ts'

const schema = { title: 'archstory/v1 design', ...z.toJSONSchema(DesignSchema, { io: 'input' }) }
writeFileSync('public/schema/archstory-v1.json', JSON.stringify(schema, null, 2) + '\n')
console.log('wrote public/schema/archstory-v1.json')
