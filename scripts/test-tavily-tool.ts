import { config } from 'dotenv'
config({ path: '.env.local' })

import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText } from 'ai'
import { tavilySearchTool } from '../lib/tools/tavily'

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY
})

const tools = {
    web_search: tavilySearchTool
}

async function test() {
    console.log('Testing Tavily tool with Gemini...')
    console.log('Tool keys:', Object.keys(tools))
    try {
        const result = streamText({
            model: google('gemini-2.0-flash'),
            messages: [{ role: 'user', content: 'Que es Tavily?' }],
            tools,
            maxSteps: 3
        })
        
        for await (const chunk of (result as any).textStream) {
            process.stdout.write(chunk)
        }
        console.log('\n✅ Tavily tool works!')
    } catch (e: any) {
        console.log('❌ Error:', e.message)
        console.log('Details:', e.data || e.responseBody)
    }
}

test()
