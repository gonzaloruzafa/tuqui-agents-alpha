/**
 * Test MercadoLibre Skills
 *
 * Verifica que los skills de MercadoLibre funcionen correctamente
 */

import 'dotenv-flow/config';
import { MeliSkills } from '@/lib/tools/web-search/meli-skills';

async function testMeliSkills() {
  console.log('\n🧪 Testing MercadoLibre Skills\n');
  console.log('='.repeat(80));

  // Test 1: Serper Search
  console.log('\n📱 Test 1: MeliSkills.search (Serper)\n');
  console.log('Query: "iPhone 15 nuevo"');

  try {
    const result = await MeliSkills.search('iPhone 15 nuevo', { maxResults: 5 });

    console.log(`\n✅ Found ${result.products.length} products`);
    console.log(`Method: ${result.method}`);
    console.log(`Cache hit: ${result.cacheHit}`);

    if (result.products.length > 0) {
      console.log('\nTop 3 products:');
      result.products.slice(0, 3).forEach((p, i) => {
        console.log(`\n${i + 1}. ${p.title}`);
        console.log(`   Precio: ${p.priceFormatted || 'No disponible'}`);
        console.log(`   URL: ${p.url}`);
        console.log(`   ID: ${p.id || 'N/A'}`);
      });
    }
  } catch (error: any) {
    console.log('❌ Error:', error.message);
  }

  console.log('\n' + '-'.repeat(80));

  // Test 2: Price Comparison
  console.log('\n💰 Test 2: MeliSkills.compare\n');
  console.log('Product: "notebook Lenovo"');
  console.log('User price: $800.000');

  try {
    const result = await MeliSkills.compare('notebook Lenovo', 800000);

    console.log('\n✅ Price comparison:');
    console.log(`   Min: ${MeliSkills.formatPrice(result.marketPrices.min)}`);
    console.log(`   Avg: ${MeliSkills.formatPrice(result.marketPrices.avg)}`);
    console.log(`   Max: ${MeliSkills.formatPrice(result.marketPrices.max)}`);
    console.log(`\n   Analysis: ${result.userPriceAnalysis}`);
    console.log(`   Recommendation: ${result.recommendation}`);
  } catch (error: any) {
    console.log('❌ Error:', error.message);
  }

  console.log('\n' + '-'.repeat(80));

  // Test 3: Hybrid Search
  console.log('\n🔀 Test 3: MeliSkills.hybrid\n');
  console.log('Query: "aire acondicionado 3000 frigorias"');

  try {
    const result = await MeliSkills.hybrid('aire acondicionado 3000 frigorias', {
      maxResults: 5,
      useCache: false,
    });

    console.log(`\n✅ Hybrid search completed`);
    console.log(`   Products found: ${result.products.length}`);
    console.log(`   Method: ${result.method}`);

    if (result.analysis) {
      console.log('\n📊 Grounding Analysis (first 500 chars):');
      console.log(result.analysis.slice(0, 500) + '...');
    }

    if (result.products.length > 0) {
      console.log('\n🛒 Products from Serper:');
      result.products.slice(0, 3).forEach((p, i) => {
        console.log(`\n${i + 1}. ${p.title}`);
        console.log(`   Precio: ${p.priceFormatted || 'Consultar'}`);
        console.log(`   URL: ${p.url}`);
      });
    }
  } catch (error: any) {
    console.log('❌ Error:', error.message);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Tests completed!\n');
}

testMeliSkills().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
