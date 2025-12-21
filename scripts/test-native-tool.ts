import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from '@ai-sdk/google'
import { generateText } from 'ai'

async function test() {
    console.log('Testing with native tool format...')
    try {
        // Use google() directly with structuredOutputs option
        const result = await generateText({
            model: google('gemini-2.0-flash', {
                structuredOutputs: true
            }),
            messages: [{ role: 'user', content: 'Cual es la capital de Argentina?' }],
        })
        
        console.log('Result:', result.text)
        console.log('\n✅ Works without tools!')
    } catch (e: any) {
        console.log('❌ Error:', e.message)
    }
}

test()
