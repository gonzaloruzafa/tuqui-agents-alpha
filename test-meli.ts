import { searchProducts } from './lib/tools/mercadolibre/browser-client'

async function test() {
    console.log('Testing Meli Search...')
    try {
        const result = await searchProducts('robot pileta', 'MLA', 2)
        console.log('Result:', JSON.stringify(result, null, 2))
    } catch (err) {
        console.error('Test Failed:', err)
    }
}

test()
