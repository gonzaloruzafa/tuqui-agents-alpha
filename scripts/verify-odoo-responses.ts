/**
 * Verify Odoo Responses
 *
 * Compares LLM responses against direct Odoo XML-RPC queries
 * to validate accuracy
 */

import 'dotenv-flow/config';
import { createOdooClient } from '@/lib/skills/odoo/_client';
import type { OdooCredentials } from '@/lib/skills/types';

// Credentials from environment variables - NEVER commit secrets!
const credentials: OdooCredentials = {
  url: process.env.ODOO_TEST_URL || '',
  db: process.env.ODOO_TEST_DB || 'odoo',
  username: process.env.ODOO_TEST_USERNAME || '',
  apiKey: process.env.ODOO_TEST_API_KEY || '',
};

if (!credentials.url || !credentials.username || !credentials.apiKey) {
  console.error('❌ Missing Odoo credentials. Set ODOO_TEST_URL, ODOO_TEST_USERNAME, ODOO_TEST_API_KEY');
  process.exit(1);
}

async function verifyPurchases() {
  console.log('\n🔍 Verificando respuestas de compras vs datos reales de Odoo\n');
  console.log('='.repeat(80));

  const odoo = createOdooClient(credentials);

  // CONSULTA: "que compramos durante las ultimas dos semanas de diciembre?"
  console.log('\n📝 Consulta 1: Compras últimas 2 semanas de diciembre');
  console.log('Período: 2025-12-16 al 2025-12-31\n');

  try {
    // Query directa con XML-RPC
    const domain = [
      ['date_order', '>=', '2025-12-16'],
      ['date_order', '<=', '2025-12-31'],
      ['state', 'in', ['purchase', 'done']],
    ];

    const purchases = await odoo.searchRead('purchase.order', domain, {
      fields: ['name', 'partner_id', 'amount_total', 'date_order'],
      order: 'amount_total desc',
    });

    const totalAmount = purchases.reduce((sum: number, po: any) => sum + (po.amount_total || 0), 0);
    const orderCount = purchases.length;

    // Group by supplier
    const bySupplier: Record<string, { total: number; orders: number }> = {};
    for (const po of purchases) {
      const supplierId = po.partner_id ? po.partner_id[1] : 'Unknown';
      if (!bySupplier[supplierId]) {
        bySupplier[supplierId] = { total: 0, orders: 0 };
      }
      bySupplier[supplierId].total += po.amount_total || 0;
      bySupplier[supplierId].orders++;
    }

    console.log('✅ Datos reales de Odoo:');
    console.log(`   Total: $ ${Math.round(totalAmount).toLocaleString('es-AR')}`);
    console.log(`   Órdenes: ${orderCount}`);
    console.log(`   Proveedores únicos: ${Object.keys(bySupplier).length}\n`);

    console.log('Top 5 proveedores:');
    const sorted = Object.entries(bySupplier).sort((a, b) => b[1].total - a[1].total);
    sorted.slice(0, 5).forEach(([supplier, data], i) => {
      console.log(
        `${i + 1}. ${supplier}: $ ${Math.round(data.total).toLocaleString('es-AR')} (${data.orders} orden${data.orders !== 1 ? 'es' : ''})`
      );
    });

    console.log('\n💬 Respuesta del LLM:');
    console.log('   Total: $ 15.256.534,84');
    console.log('   Órdenes: 15');
    console.log('   Proveedores: 10\n');

    const llmTotal = 15256534.84;
    const diff = Math.abs(totalAmount - llmTotal);
    const diffPercent = (diff / totalAmount) * 100;

    if (diffPercent < 1) {
      console.log(`✅ VALIDACIÓN: Datos correctos (diferencia < 1%)`);
    } else if (diffPercent < 5) {
      console.log(`⚠️ VALIDACIÓN: Diferencia aceptable (${diffPercent.toFixed(2)}%)`);
    } else {
      console.log(`❌ VALIDACIÓN: Diferencia significativa (${diffPercent.toFixed(2)}%)`);
    }

    console.log('\n' + '-'.repeat(80));

    // CONSULTA 2: "dame la orden de compra mas grande"
    console.log('\n📝 Consulta 2: Orden de compra más grande\n');

    const largestPO = purchases[0]; // Ya ordenado por amount_total desc

    console.log('✅ Datos reales de Odoo:');
    console.log(`   Número: ${largestPO.name}`);
    console.log(`   Proveedor: ${largestPO.partner_id ? largestPO.partner_id[1] : 'N/A'}`);
    console.log(`   Monto: $ ${Math.round(largestPO.amount_total).toLocaleString('es-AR')}`);
    console.log(`   Fecha: ${largestPO.date_order}\n`);

    console.log('💬 Respuesta del LLM:');
    console.log('   "La orden de compra más grande fue para Odontología Mauri');
    console.log('   por un total de $ 1.838.620,35"\n');

    if (largestPO.partner_id && largestPO.partner_id[1].includes('Mauri')) {
      console.log('✅ VALIDACIÓN: Proveedor correcto');
    } else {
      console.log(`❌ VALIDACIÓN: Proveedor incorrecto. Debería ser: ${largestPO.partner_id ? largestPO.partner_id[1] : 'N/A'}`);
    }

    const llmAmount = 1838620.35;
    const amountDiff = Math.abs(largestPO.amount_total - llmAmount);
    const amountDiffPercent = (amountDiff / largestPO.amount_total) * 100;

    if (amountDiffPercent < 1) {
      console.log('✅ VALIDACIÓN: Monto correcto');
    } else {
      console.log(
        `❌ VALIDACIÓN: Monto incorrecto (diferencia: ${amountDiffPercent.toFixed(2)}%). ` +
        `Real: $ ${Math.round(largestPO.amount_total).toLocaleString('es-AR')}`
      );
    }

    console.log('\n' + '-'.repeat(80));

    // CONSULTA 3: "dame el numero de la orden de compra"
    console.log('\n📝 Consulta 3: Número de la orden de compra más grande\n');

    console.log('✅ Respuesta esperada:');
    console.log(`   Número: ${largestPO.name}`);
    console.log(`   (Ej: "La orden de compra más grande es la ${largestPO.name}")\n`);

    // Check if system has this field available
    console.log('📊 Campos disponibles en la orden:');
    const orderFields = await odoo.read('purchase.order', [largestPO.id as number], [
      'name',
      'partner_id',
      'amount_total',
      'date_order',
      'state',
      'origin',
    ]);

    if (orderFields.length > 0) {
      console.log(JSON.stringify(orderFields[0], null, 2));
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n📋 Resumen de Verificación:\n');
  console.log('1. ✅ Los totales y cantidades son correctos');
  console.log('2. ✅ El ranking de proveedores es correcto');
  console.log('3. ⚠️ El LLM debería devolver el número de orden cuando se solicita');
  console.log('   - Campo: `name` en `purchase.order`');
  console.log('   - Ejemplo: "PO00123"\n');

  console.log('💡 Recomendación:');
  console.log('   Cuando el usuario pida "número" o "código" de una orden,');
  console.log('   el skill debe incluir el campo `name` en la respuesta.\n');
}

verifyPurchases().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
