import { config } from 'dotenv'
config({ path: '.env.local' })

import { tool, jsonSchema } from 'ai'
import { z } from 'zod'

// Create tool with Zod
const zodTool = tool({
    description: 'Test tool',
    parameters: z.object({
        query: z.string()
    }),
    execute: async () => ({})
})

// Create tool with JSON Schema
const jsonTool = tool({
    description: 'Test tool 2',
    parameters: jsonSchema({
        type: 'object',
        properties: {
            query: { type: 'string' }
        },
        required: ['query']
    }),
    execute: async () => ({})
})

console.log('Zod tool:')
console.log(JSON.stringify(zodTool, null, 2))

console.log('\nJSON Schema tool:')
console.log(JSON.stringify(jsonTool, null, 2))
