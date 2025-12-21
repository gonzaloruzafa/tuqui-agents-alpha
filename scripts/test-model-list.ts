import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from '@ai-sdk/google'
import { generateText } from 'ai'

async function listModels() {
    // Test various models without tools
    const models = [
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.5-flash-preview',
        'gemini-1.5-flash-latest',
    ]
    
    for (const modelId of models) {
        try {
            const { text } = await generateText({
                model: google(modelId),
                prompt: 'Di hola',
                maxTokens: 10
            })
            console.log(`✅ ${modelId}: ${text}`)
        } catch (e: any) {
            console.log(`❌ ${modelId}: ${e.message.substring(0, 80)}`)
        }
    }
}

listModels()
