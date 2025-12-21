import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from '@ai-sdk/google'
import { generateText, tool } from 'ai'
import { z } from 'zod'

const testTool = tool({
    description: 'Test tool',
    parameters: z.object({
        query: z.string()
    }),
    execute: async ({ query }) => ({ result: query })
})

async function testModel(modelId: string) {
    console.log(`\nTesting ${modelId}...`)
    try {
        const { text } = await generateText({
            model: google(modelId),
            tools: { test: testTool },
            prompt: 'Busca algo',
            maxSteps: 1
        })
        console.log(`✅ ${modelId} works! Response:`, text.substring(0, 50))
    } catch (e: any) {
        console.log(`❌ ${modelId} error:`, e.message.substring(0, 100))
    }
}

async function main() {
    await testModel('gemini-2.0-flash')
    await testModel('gemini-1.5-flash')
    await testModel('gemini-1.5-pro')
}

main()
