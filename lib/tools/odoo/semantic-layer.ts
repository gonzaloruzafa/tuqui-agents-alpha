/**
 * Odoo Semantic Layer - Static Schema Reference
 * 
 * Provides a concise, pre-defined schema of key Odoo models and fields
 * for the LLM interpreter to make better decisions about queries.
 */

// ============================================
// TYPES
// ============================================

export interface FieldDef {
    name: string
    type: 'char' | 'integer' | 'float' | 'monetary' | 'date' | 'datetime' | 'boolean' | 'selection' | 'many2one' | 'one2many' | 'many2many' | 'text'
    relation?: string
    description?: string
    commonValues?: string[]
    isKey?: boolean
    isAmount?: boolean
    isDate?: boolean
}

export interface ModelDef {
    name: string
    description: string
    keyFields: FieldDef[]
    dateField: string
    amountField?: string
    stateField?: string
    tips?: string[]
}

// ============================================
// CORE SCHEMA - 12 Most Common Models
// ============================================

export const ODOO_LITE_SCHEMA: ModelDef[] = [
    {
        name: 'sale.order',
        description: 'Pedidos/Órdenes de venta (cabecera)',
        dateField: 'date_order',
        amountField: 'amount_total',
        stateField: 'state',
        keyFields: [
            { name: 'id', type: 'integer', description: 'ID interno' },
            { name: 'name', type: 'char', description: 'Número de pedido', isKey: true },
            { name: 'partner_id', type: 'many2one', relation: 'res.partner', description: 'Cliente' },
            { name: 'user_id', type: 'many2one', relation: 'res.users', description: 'Vendedor asignado' },
            { name: 'date_order', type: 'datetime', description: 'Fecha del pedido', isDate: true },
            { name: 'amount_untaxed', type: 'monetary', description: 'Subtotal sin impuestos', isAmount: true },
            { name: 'amount_total', type: 'monetary', description: 'Total con impuestos', isAmount: true },
            { name: 'state', type: 'selection', commonValues: ['draft', 'sent', 'sale', 'done', 'cancel'] },
            { name: 'team_id', type: 'many2one', relation: 'crm.team', description: 'Equipo de ventas' },
        ],
        tips: ['Usar user_id para vendedor, NO create_uid', 'state="sale" son confirmados']
    },
    {
        name: 'sale.order.line',
        description: 'Líneas de pedidos de venta (detalle de productos)',
        dateField: 'create_date',
        amountField: 'price_subtotal',
        stateField: 'state',
        keyFields: [
            { name: 'order_id', type: 'many2one', relation: 'sale.order', description: 'Pedido padre' },
            { name: 'product_id', type: 'many2one', relation: 'product.product', description: 'Producto vendido' },
            { name: 'product_uom_qty', type: 'float', description: 'Cantidad vendida', isAmount: true },
            { name: 'price_unit', type: 'float', description: 'Precio unitario' },
            { name: 'price_subtotal', type: 'monetary', description: 'Subtotal de línea', isAmount: true },
            { name: 'salesman_id', type: 'many2one', relation: 'res.users', description: 'Vendedor' },
        ],
        tips: ['Para "qué vendió X", usar sale.order.line con filtro en salesman_id']
    },
    {
        name: 'purchase.order',
        description: 'Órdenes de compra a proveedores',
        dateField: 'date_order',
        amountField: 'amount_total',
        stateField: 'state',
        keyFields: [
            { name: 'name', type: 'char', description: 'Número de OC', isKey: true },
            { name: 'partner_id', type: 'many2one', relation: 'res.partner', description: 'Proveedor' },
            { name: 'user_id', type: 'many2one', relation: 'res.users', description: 'Responsable' },
            { name: 'date_order', type: 'datetime', isDate: true },
            { name: 'amount_total', type: 'monetary', isAmount: true },
            { name: 'state', type: 'selection', commonValues: ['draft', 'sent', 'purchase', 'done', 'cancel'] },
        ],
        tips: ['state="purchase" son órdenes confirmadas']
    },
    {
        name: 'account.move',
        description: 'Facturas, notas de crédito y asientos contables',
        dateField: 'invoice_date',
        amountField: 'amount_total',
        stateField: 'state',
        keyFields: [
            { name: 'name', type: 'char', description: 'Número de factura', isKey: true },
            { name: 'partner_id', type: 'many2one', relation: 'res.partner', description: 'Cliente/Proveedor' },
            { name: 'invoice_user_id', type: 'many2one', relation: 'res.users', description: 'Vendedor responsable' },
            { name: 'invoice_date', type: 'date', isDate: true },
            { name: 'invoice_date_due', type: 'date', description: 'Fecha vencimiento', isDate: true },
            { name: 'amount_total', type: 'monetary', isAmount: true },
            { name: 'amount_residual', type: 'monetary', description: 'Saldo pendiente', isAmount: true },
            { name: 'state', type: 'selection', commonValues: ['draft', 'posted', 'cancel'] },
            { name: 'payment_state', type: 'selection', commonValues: ['not_paid', 'partial', 'paid'] },
            { name: 'move_type', type: 'selection', commonValues: ['out_invoice', 'out_refund', 'in_invoice', 'in_refund'] },
        ],
        tips: ['move_type="out_invoice" son facturas de cliente', 'amount_residual > 0 = deuda pendiente']
    },
    {
        name: 'account.payment',
        description: 'Pagos y cobros registrados',
        dateField: 'date',
        amountField: 'amount',
        stateField: 'state',
        keyFields: [
            { name: 'name', type: 'char', isKey: true },
            { name: 'partner_id', type: 'many2one', relation: 'res.partner' },
            { name: 'date', type: 'date', isDate: true },
            { name: 'amount', type: 'monetary', isAmount: true },
            { name: 'payment_type', type: 'selection', commonValues: ['inbound', 'outbound'] },
            { name: 'state', type: 'selection', commonValues: ['draft', 'posted', 'cancelled'] },
            { name: 'journal_id', type: 'many2one', relation: 'account.journal', description: 'Método de pago' },
        ],
        tips: ['payment_type="inbound" = cobros, "outbound" = pagos']
    },
    {
        name: 'res.partner',
        description: 'Clientes, proveedores y contactos',
        dateField: 'create_date',
        keyFields: [
            { name: 'name', type: 'char', isKey: true },
            { name: 'email', type: 'char' },
            { name: 'phone', type: 'char' },
            { name: 'city', type: 'char' },
            { name: 'state_id', type: 'many2one', relation: 'res.country.state', description: 'Provincia' },
            { name: 'customer_rank', type: 'integer', description: '>0 = es cliente' },
            { name: 'supplier_rank', type: 'integer', description: '>0 = es proveedor' },
            { name: 'user_id', type: 'many2one', relation: 'res.users', description: 'Vendedor asignado' },
            { name: 'create_date', type: 'datetime', isDate: true },
        ],
        tips: ['customer_rank > 0 para filtrar clientes']
    },
    {
        name: 'crm.lead',
        description: 'Leads y oportunidades de venta (CRM)',
        dateField: 'create_date',
        amountField: 'expected_revenue',
        stateField: 'stage_id',
        keyFields: [
            { name: 'name', type: 'char', isKey: true },
            { name: 'partner_id', type: 'many2one', relation: 'res.partner' },
            { name: 'user_id', type: 'many2one', relation: 'res.users', description: 'Vendedor' },
            { name: 'stage_id', type: 'many2one', relation: 'crm.stage', description: 'Etapa pipeline' },
            { name: 'expected_revenue', type: 'monetary', isAmount: true },
            { name: 'probability', type: 'float', description: '0-100' },
            { name: 'type', type: 'selection', commonValues: ['lead', 'opportunity'] },
            { name: 'create_date', type: 'datetime', isDate: true },
            { name: 'active', type: 'boolean', description: 'perdidas = False' },
        ],
        tips: ['probability=100 = ganadas, probability=0 + active=False = perdidas']
    },
    {
        name: 'product.product',
        description: 'Variantes de producto (SKUs)',
        dateField: 'create_date',
        amountField: 'list_price',
        keyFields: [
            { name: 'name', type: 'char', isKey: true },
            { name: 'default_code', type: 'char', description: 'SKU' },
            { name: 'list_price', type: 'float', description: 'Precio de venta' },
            { name: 'standard_price', type: 'float', description: 'Costo' },
            { name: 'qty_available', type: 'float', description: 'Stock disponible', isAmount: true },
            { name: 'categ_id', type: 'many2one', relation: 'product.category' },
            { name: 'type', type: 'selection', commonValues: ['consu', 'service', 'product'] },
        ],
        tips: ['type="product" = almacenable con stock']
    },
    {
        name: 'stock.quant',
        description: 'Stock por ubicación',
        dateField: 'in_date',
        amountField: 'quantity',
        keyFields: [
            { name: 'product_id', type: 'many2one', relation: 'product.product' },
            { name: 'location_id', type: 'many2one', relation: 'stock.location' },
            { name: 'quantity', type: 'float', isAmount: true },
            { name: 'reserved_quantity', type: 'float', isAmount: true },
            { name: 'value', type: 'monetary', description: 'Valor del stock', isAmount: true },
        ],
        tips: ['Filtrar location_id.usage="internal" para almacenes internos']
    },
    {
        name: 'stock.picking',
        description: 'Transferencias/Remitos',
        dateField: 'scheduled_date',
        stateField: 'state',
        keyFields: [
            { name: 'name', type: 'char', isKey: true },
            { name: 'partner_id', type: 'many2one', relation: 'res.partner' },
            { name: 'picking_type_id', type: 'many2one', relation: 'stock.picking.type' },
            { name: 'scheduled_date', type: 'datetime', isDate: true },
            { name: 'date_done', type: 'datetime', isDate: true },
            { name: 'origin', type: 'char', description: 'Documento origen (SO/PO)' },
            { name: 'state', type: 'selection', commonValues: ['draft', 'waiting', 'assigned', 'done', 'cancel'] },
        ],
        tips: ['state="assigned" = listas para procesar']
    },
]

// ============================================
// SCHEMA FORMATTER FOR PROMPTS
// ============================================

export function getSchemaForPrompt(): string {
    let output = '## MODELOS Y CAMPOS DISPONIBLES EN ODOO\n\n'

    for (const model of ODOO_LITE_SCHEMA) {
        output += `### ${model.name} - ${model.description}\n`
        output += `- **Fecha principal**: ${model.dateField}\n`
        if (model.amountField) output += `- **Campo monto**: ${model.amountField}\n`
        if (model.stateField) output += `- **Campo estado**: ${model.stateField}\n`

        const keyFieldNames = model.keyFields
            .filter(f => f.isKey || f.isAmount || f.type === 'many2one')
            .map(f => f.type === 'many2one' ? `${f.name} (→${f.relation})` : f.name)
        output += `- **Campos clave**: ${keyFieldNames.join(', ')}\n`

        if (model.tips && model.tips.length > 0) {
            output += `- **Tips**: ${model.tips[0]}\n`
        }
        output += '\n'
    }

    output += `### RELACIONES ÚTILES PARA DOUBLE GROUPING:\n`
    output += `- sale.order: agrupar por user_id + date_order:month (vendedor por mes)\n`
    output += `- sale.order.line: agrupar por product_id + salesman_id (producto por vendedor)\n`
    output += `- account.move: agrupar por move_type + invoice_date:month\n`
    output += `- crm.lead: agrupar por user_id + stage_id (vendedor por etapa)\n`

    return output
}

export function suggestFieldCorrection(modelName: string, wrongField: string): string | null {
    const commonCorrections: Record<string, Record<string, string>> = {
        'sale.order': {
            'seller_id': 'user_id',
            'salesperson_id': 'user_id',
            'vendedor_id': 'user_id',
            'customer_id': 'partner_id',
            'total': 'amount_total',
            'date': 'date_order',
        },
        'sale.order.line': {
            'quantity': 'product_uom_qty',
            'qty': 'product_uom_qty',
            'amount': 'price_subtotal',
            'total': 'price_subtotal',
        },
        'account.move': {
            'date': 'invoice_date',
            'due_date': 'invoice_date_due',
            'amount': 'amount_total',
            'residual': 'amount_residual',
            'type': 'move_type',
        },
    }
    return commonCorrections[modelName]?.[wrongField] || null
}

// getSupportedModels() removed - unused
