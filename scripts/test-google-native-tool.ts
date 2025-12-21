import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from '@ai-sdk/google'
import { generateText } from 'ai'

async function test() {
    console.log('Testing Google native tools...')
    try {
        // Use Google's native tools
        const { text, sources } = await generateText({
            model: google('gemini-2.0-flash'),
            tools: {
                google_search: google.tools.googleSearch({})
            },
            prompt: 'What is the weather in Buenos Aires today?'
        })
        
        console.log('Result:', text)
        console.log('Sources:', sources)
        console.log('\n✅ Google native tool works!')
    } catch (e: any) {
        console.log('❌ Error:', e.message)
        console.log('Details:', e.data)
    }
}

test()
