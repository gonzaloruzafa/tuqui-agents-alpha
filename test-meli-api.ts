async function test() {
    const query = 'robot pileta'
    const site = 'MLA'
    const url = `https://api.mercadolibre.com/sites/${site}/search?q=${encodeURIComponent(query)}&limit=5`

    console.log('Testing Meli API:', url)
    try {
        const response = await fetch(url)
        const data = await response.json()
        console.log('Results count:', data.results?.length)
        if (data.results && data.results.length > 0) {
            console.log('First result:', data.results[0].title, data.results[0].price)
        }
    } catch (err) {
        console.error('API Test Failed:', err)
    }
}

test()
