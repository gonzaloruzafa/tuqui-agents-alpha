import { streamText } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY
})

async function test() {
    console.log('Testing streamText...')
    try {
        const result = streamText({
            model: google('gemini-2.0-flash'),
            messages: [
                { role: 'user', content: 'Hola, ¿cómo estás?' }
            ]
        })

        console.log('Stream started...')
        for await (const chunk of result.textStream) {
            process.stdout.write(chunk)
        }
        console.log('\nStream finished.')
    } catch (error) {
        console.error('Error in test:', error)
    }
}

test()
