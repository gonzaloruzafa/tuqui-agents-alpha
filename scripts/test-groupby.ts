import 'dotenv-flow/config'
import { getOdooClient } from '../lib/tools/odoo/client'

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

async function testGroupBy() {
  console.log('Creando cliente Odoo...')
  const client = await getOdooClient(TENANT_ID)

  console.log('\n=== TEST 1: groupBy por quarter ===')
  try {
    const result = await client.readGroup(
      'account.move',
      [['move_type', '=', 'out_invoice'], ['state', '=', 'posted']],
      ['amount_total:sum'],
      ['invoice_date:quarter'],
      { limit: 10 }
    )
    console.log('✅ quarter funciona:', JSON.stringify(result, null, 2))
  } catch (e: any) {
    console.log('❌ quarter falló:', e.message)
  }

  console.log('\n=== TEST 2: groupBy por year ===')
  try {
    const result = await client.readGroup(
      'account.move',
      [['move_type', '=', 'out_invoice'], ['state', '=', 'posted']],
      ['amount_total:sum'],
      ['invoice_date:year'],
      { limit: 10 }
    )
    console.log('✅ year funciona:', JSON.stringify(result, null, 2))
  } catch (e: any) {
    console.log('❌ year falló:', e.message)
  }

  console.log('\n=== TEST 3: sale.order.line ===')
  try {
    const result = await client.readGroup(
      'sale.order.line',
      [['state', 'in', ['sale', 'done']]],
      ['product_uom_qty:sum', 'price_subtotal:sum'],
      ['product_id'],
      { limit: 10 }
    )
    console.log('✅ sale.order.line funciona:', JSON.stringify(result, null, 2))
  } catch (e: any) {
    console.log('❌ sale.order.line falló:', e.message)
  }

  console.log('\n=== TEST 4: account.payment (pagos) ===')
  try {
    const result = await client.searchRead(
      'account.payment',
      [],
      ['name', 'amount', 'date', 'partner_id', 'state'],
      5
    )
    console.log('✅ account.payment funciona:', JSON.stringify(result, null, 2))
  } catch (e: any) {
    console.log('❌ account.payment falló:', e.message)
  }
}

testGroupBy()
