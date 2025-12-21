const { streamText } = require('ai');
const { createGoogleGenerativeAI } = require('@ai-sdk/google');
require('dotenv').config({ path: '.env.local' });

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY
});

async function test() {
    const result = streamText({
        model: google('gemini-2.0-flash'),
        messages: [{ role: 'user', content: 'hi' }]
    });
    console.log('Result keys:', Object.keys(result));
    console.log('toDataStreamResponse type:', typeof result.toDataStreamResponse);
    console.log('toTextStreamResponse type:', typeof result.toTextStreamResponse);
}

test().catch(console.error);
