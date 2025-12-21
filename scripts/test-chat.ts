import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText } from 'ai'

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY
})

async function testChat() {
    console.log('Testing Gemini Chat API...\n')
    
    const messages = [
        { role: 'user' as const, content: '¿Qué es el IVA?' }
    ]
    
    const systemPrompt = `Sos Tuqui Contador, un asistente para consultas contables e impositivas.
Tus respuestas son orientativas y se basan en la normativa vigente.
Siempre recordá que la interpretación final depende de un contador matriculado.`
    
    console.log('System prompt:', systemPrompt.substring(0, 50) + '...')
    console.log('User message:', messages[0].content)
    console.log('\n--- Response ---\n')
    
    try {
        const result = streamText({
            model: google('gemini-2.0-flash'),
            system: systemPrompt,
            messages,
            maxSteps: 5
        })
        
        // Check what methods are available
        console.log('Result keys:', Object.keys(result))
        
        // Test text stream
        let fullText = ''
        for await (const chunk of result.textStream) {
            process.stdout.write(chunk)
            fullText += chunk
        }
        
        console.log('\n\n--- Stream complete ---')
        console.log('Total length:', fullText.length)
        
        // Check for toTextStreamResponse
        console.log('\nChecking response methods:')
        console.log('- toTextStreamResponse:', typeof (result as any).toTextStreamResponse)
        console.log('- toDataStreamResponse:', typeof (result as any).toDataStreamResponse)
        
    } catch (e: any) {
        console.error('Error:', e.message)
        console.error('Stack:', e.stack)
    }
}

testChat()
