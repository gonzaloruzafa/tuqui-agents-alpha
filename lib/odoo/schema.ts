/**
 * Odoo Semantic Schema Layer
 * 
 * Este archivo define el mapeo entre conceptos de negocio en lenguaje natural
 * y los modelos técnicos de Odoo. El LLM usará esta información para:
 * 1. Entender qué datos puede consultar
 * 2. Saber qué campos están disponibles
 * 3. Conocer las relaciones entre entidades
 * 
 * IMPORTANTE: Solo exponemos los campos que queremos que el LLM pueda usar.
 * Esto evita que intente adivinar nombres de campos o tablas.
 */

export interface OdooField {
  name: string           // Nombre técnico del campo en Odoo
  label: string          // Nombre amigable para el LLM
  type: 'string' | 'integer' | 'float' | 'boolean' | 'date' | 'datetime' | 'many2one' | 'one2many' | 'selection'
  description: string    // Descripción para el LLM
  selection?: Record<string, string>  // Para campos selection: valor técnico → descripción
  relation?: string      // Para many2one/one2many: modelo relacionado
  searchable?: boolean   // Si se puede usar en domain (default: true)
  filterable?: boolean   // Si se puede filtrar (default: true)
}

export interface OdooModel {
  name: string           // Nombre técnico del modelo en Odoo (ej: 'sale.order')
  label: string          // Nombre amigable (ej: 'Orden de Venta')
  description: string    // Descripción del concepto de negocio
  fields: OdooField[]    // Campos disponibles
  commonFilters?: string[] // Filtros comunes sugeridos
}

// ============================================================================
// DEFINICIÓN DE MODELOS DE ODOO
// ============================================================================

export const ODOO_MODELS: Record<string, OdooModel> = {
  // ---------------------------------------------------------------------------
  // VENTAS
  // ---------------------------------------------------------------------------
  'sale.order': {
    name: 'sale.order',
    label: 'Orden de Venta',
    description: 'Ventas y cotizaciones. Info de cliente, productos, totales, estado.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID único' },
      { name: 'name', label: 'Número', type: 'string', description: 'Código (ej: S00001)' },
      { name: 'partner_id', label: 'Cliente', type: 'many2one', relation: 'res.partner', description: 'Cliente [id, nombre]' },
      { name: 'date_order', label: 'Fecha', type: 'datetime', description: 'Fecha creación' },
      { name: 'amount_untaxed', label: 'Subtotal', type: 'float', description: 'Sin impuestos' },
      { name: 'amount_tax', label: 'Impuestos', type: 'float', description: 'Impuestos' },
      { name: 'amount_total', label: 'Total', type: 'float', description: 'Total' },
      { name: 'state', label: 'Estado', type: 'selection', description: 'Estado', selection: {
        'draft': 'Cotización', 'sent': 'Enviada', 'sale': 'Confirmada', 'done': 'Completada', 'cancel': 'Cancelada'
      }},
      { name: 'user_id', label: 'Vendedor', type: 'many2one', relation: 'res.users', description: 'Vendedor' },
      { name: 'team_id', label: 'Equipo', type: 'many2one', relation: 'crm.team', description: 'Equipo comercial' },
      { name: 'invoice_status', label: 'Facturación', type: 'selection', description: 'Estado factura', selection: {
        'upselling': 'Upselling', 'invoiced': 'Facturado', 'to invoice': 'Por Facturar', 'no': 'N/A'
      }},
      { name: 'create_date', label: 'Creado', type: 'datetime', description: 'Fecha creación' },
      { name: 'currency_id', label: 'Moneda', type: 'many2one', relation: 'res.currency', description: 'Moneda' },
    ],
    commonFilters: [
      "Confirmadas: [['state', 'in', ['sale', 'done']]]",
      "Hoy: [['date_order', '>=', 'HOY 00:00:00']]"
    ]
  },

  'sale.order.line': {
    name: 'sale.order.line',
    label: 'Línea de Venta',
    description: 'Productos en órdenes. Cantidad, precio, descuento.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'order_id', label: 'Orden', type: 'many2one', relation: 'sale.order', description: 'Orden [id, nombre]' },
      { name: 'product_id', label: 'Producto', type: 'many2one', relation: 'product.product', description: 'Producto [id, nombre]' },
      { name: 'name', label: 'Descripción', type: 'string', description: 'Descripción' },
      { name: 'product_uom_qty', label: 'Cantidad', type: 'float', description: 'Cantidad' },
      { name: 'qty_delivered', label: 'Entregada', type: 'float', description: 'Entregada' },
      { name: 'qty_invoiced', label: 'Facturada', type: 'float', description: 'Facturada' },
      { name: 'price_unit', label: 'Precio Unit.', type: 'float', description: 'Precio unitario' },
      { name: 'discount', label: 'Descuento %', type: 'float', description: 'Descuento' },
      { name: 'price_subtotal', label: 'Subtotal', type: 'float', description: 'Subtotal' },
      { name: 'price_total', label: 'Total', type: 'float', description: 'Total' },
    ],
    commonFilters: ["Por orden: [['order_id', '=', ID]]"]
  },

  // ---------------------------------------------------------------------------
  // PRODUCTOS
  // ---------------------------------------------------------------------------
  'product.product': {
    name: 'product.product',
    label: 'Producto',
    description: 'Productos con variantes. Stock, precios, SKU, código barras.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Nombre', type: 'string', description: 'Nombre' },
      { name: 'default_code', label: 'SKU', type: 'string', description: 'SKU/Ref interna' },
      { name: 'barcode', label: 'Código Barras', type: 'string', description: 'EAN/UPC' },
      { name: 'list_price', label: 'Precio Venta', type: 'float', description: 'Precio venta' },
      { name: 'standard_price', label: 'Costo', type: 'float', description: 'Costo' },
      { name: 'qty_available', label: 'Stock', type: 'float', description: 'Stock actual' },
      { name: 'virtual_available', label: 'Stock Previsto', type: 'float', description: 'Stock previsto' },
      { name: 'categ_id', label: 'Categoría', type: 'many2one', relation: 'product.category', description: 'Categoría' },
      { name: 'type', label: 'Tipo', type: 'selection', description: 'Tipo', selection: {
        'consu': 'Consumible', 'service': 'Servicio', 'product': 'Almacenable'
      }},
      { name: 'active', label: 'Activo', type: 'boolean', description: 'Activo' },
      { name: 'sale_ok', label: 'Vendible', type: 'boolean', description: 'Se vende' },
      { name: 'purchase_ok', label: 'Comprable', type: 'boolean', description: 'Se compra' },
    ],
    commonFilters: [
      "Activos: [['active', '=', true]]",
      "Con stock: [['qty_available', '>', 0]]",
      "Por nombre: [['name', 'ilike', '%texto%']]"
    ]
  },

  'product.template': {
    name: 'product.template',
    label: 'Plantilla Producto',
    description: 'Productos base sin variantes.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Nombre', type: 'string', description: 'Nombre' },
      { name: 'default_code', label: 'SKU', type: 'string', description: 'SKU' },
      { name: 'list_price', label: 'Precio', type: 'float', description: 'Precio' },
      { name: 'standard_price', label: 'Costo', type: 'float', description: 'Costo' },
      { name: 'categ_id', label: 'Categoría', type: 'many2one', relation: 'product.category', description: 'Categoría' },
      { name: 'type', label: 'Tipo', type: 'selection', description: 'Tipo', selection: {
        'consu': 'Consumible', 'service': 'Servicio', 'product': 'Almacenable'
      }},
      { name: 'active', label: 'Activo', type: 'boolean', description: 'Activo' },
    ],
    commonFilters: ["Activos: [['active', '=', true]]"]
  },
  
  'product.category': {
    name: 'product.category',
    label: 'Categoría Producto',
    description: 'Categorías/familias de productos.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Nombre', type: 'string', description: 'Nombre categoría' },
      { name: 'parent_id', label: 'Padre', type: 'many2one', relation: 'product.category', description: 'Categoría padre' },
      { name: 'complete_name', label: 'Ruta', type: 'string', description: 'Ruta completa' },
    ],
    commonFilters: ["Raíz: [['parent_id', '=', false]]"]
  },

  // ---------------------------------------------------------------------------
  // CLIENTES / CONTACTOS
  // ---------------------------------------------------------------------------
  'res.partner': {
    name: 'res.partner',
    label: 'Cliente/Proveedor',
    description: 'Clientes, proveedores, contactos. Usar customer_rank > 0 para clientes.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Nombre', type: 'string', description: 'Nombre/Razón social' },
      { name: 'display_name', label: 'Nombre Full', type: 'string', description: 'Nombre completo' },
      { name: 'email', label: 'Email', type: 'string', description: 'Email' },
      { name: 'phone', label: 'Teléfono', type: 'string', description: 'Teléfono' },
      { name: 'mobile', label: 'Móvil', type: 'string', description: 'Móvil' },
      { name: 'vat', label: 'CUIT/NIF', type: 'string', description: 'ID fiscal' },
      { name: 'street', label: 'Calle', type: 'string', description: 'Dirección' },
      { name: 'city', label: 'Ciudad', type: 'string', description: 'Ciudad' },
      { name: 'state_id', label: 'Provincia', type: 'many2one', relation: 'res.country.state', description: 'Provincia' },
      { name: 'country_id', label: 'País', type: 'many2one', relation: 'res.country', description: 'País' },
      { name: 'customer_rank', label: 'Rank Cliente', type: 'integer', description: 'Si > 0, es cliente' },
      { name: 'supplier_rank', label: 'Rank Proveedor', type: 'integer', description: 'Si > 0, es proveedor' },
      { name: 'is_company', label: 'Es Empresa', type: 'boolean', description: 'Empresa o persona' },
      { name: 'parent_id', label: 'Empresa Padre', type: 'many2one', relation: 'res.partner', description: 'Empresa padre' },
      { name: 'user_id', label: 'Vendedor', type: 'many2one', relation: 'res.users', description: 'Vendedor' },
      { name: 'active', label: 'Activo', type: 'boolean', description: 'Activo' },
      { name: 'create_date', label: 'Creado', type: 'datetime', description: 'Fecha creación' },
    ],
    commonFilters: [
      "Clientes: [['customer_rank', '>', 0]]",
      "Proveedores: [['supplier_rank', '>', 0]]",
      "Por nombre: [['name', 'ilike', '%texto%']]"
    ]
  },

  // ---------------------------------------------------------------------------
  // FACTURACIÓN
  // ---------------------------------------------------------------------------
  'account.move': {
    name: 'account.move',
    label: 'Factura',
    description: 'Facturas cliente/proveedor, notas crédito, asientos.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Número', type: 'string', description: 'Número (INV/2025/001)' },
      { name: 'partner_id', label: 'Cliente/Proveedor', type: 'many2one', relation: 'res.partner', description: 'Cliente/Proveedor' },
      { name: 'invoice_date', label: 'Fecha', type: 'date', description: 'Fecha factura' },
      { name: 'invoice_date_due', label: 'Vencimiento', type: 'date', description: 'Vencimiento' },
      { name: 'amount_untaxed', label: 'Subtotal', type: 'float', description: 'Subtotal' },
      { name: 'amount_tax', label: 'Impuestos', type: 'float', description: 'Impuestos' },
      { name: 'amount_total', label: 'Total', type: 'float', description: 'Total' },
      { name: 'amount_residual', label: 'Saldo', type: 'float', description: 'Saldo pendiente' },
      { name: 'state', label: 'Estado', type: 'selection', description: 'Estado', selection: {
        'draft': 'Borrador', 'posted': 'Validada', 'cancel': 'Cancelada'
      }},
      { name: 'payment_state', label: 'Pago', type: 'selection', description: 'Estado pago', selection: {
        'not_paid': 'Impaga', 'in_payment': 'En pago', 'paid': 'Pagada', 'partial': 'Parcial'
      }},
      { name: 'move_type', label: 'Tipo', type: 'selection', description: 'Tipo doc', selection: {
        'entry': 'Asiento', 'out_invoice': 'Fact. Cliente', 'out_refund': 'NC Cliente', 
        'in_invoice': 'Fact. Proveedor', 'in_refund': 'NC Proveedor'
      }},
      { name: 'invoice_origin', label: 'Origen', type: 'string', description: 'Doc origen' },
      { name: 'user_id', label: 'Usuario', type: 'many2one', relation: 'res.users', description: 'Usuario' },
      { name: 'currency_id', label: 'Moneda', type: 'many2one', relation: 'res.currency', description: 'Moneda' },
    ],
    commonFilters: [
      "Cliente validadas: [['move_type', '=', 'out_invoice'], ['state', '=', 'posted']]",
      "Impagas: [['payment_state', 'in', ['not_paid', 'partial']]]"
    ]
  },
  
  'account.payment': {
    name: 'account.payment',
    label: 'Pago',
    description: 'Pagos recibidos/realizados. Cobros y pagos.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Número', type: 'string', description: 'Número' },
      { name: 'partner_id', label: 'Contacto', type: 'many2one', relation: 'res.partner', description: 'Cliente/Prov' },
      { name: 'amount', label: 'Monto', type: 'float', description: 'Monto' },
      { name: 'payment_date', label: 'Fecha', type: 'date', description: 'Fecha pago' },
      { name: 'payment_type', label: 'Tipo', type: 'selection', description: 'Tipo', selection: {
        'inbound': 'Cobro', 'outbound': 'Pago'
      }},
      { name: 'partner_type', label: 'Tipo Contacto', type: 'selection', description: 'Contacto', selection: {
        'customer': 'Cliente', 'supplier': 'Proveedor'
      }},
      { name: 'state', label: 'Estado', type: 'selection', description: 'Estado', selection: {
        'draft': 'Borrador', 'posted': 'Validado', 'cancel': 'Cancelado'
      }},
      { name: 'journal_id', label: 'Diario', type: 'many2one', relation: 'account.journal', description: 'Diario' },
      { name: 'currency_id', label: 'Moneda', type: 'many2one', relation: 'res.currency', description: 'Moneda' },
    ],
    commonFilters: [
      "Cobros: [['payment_type', '=', 'inbound']]",
      "Validados: [['state', '=', 'posted']]"
    ]
  },

  // ---------------------------------------------------------------------------
  // INVENTARIO
  // ---------------------------------------------------------------------------
  'stock.quant': {
    name: 'stock.quant',
    label: 'Stock',
    description: 'Stock por producto y ubicación. Disponible, reservado.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'product_id', label: 'Producto', type: 'many2one', relation: 'product.product', description: 'Producto' },
      { name: 'location_id', label: 'Ubicación', type: 'many2one', relation: 'stock.location', description: 'Ubicación' },
      { name: 'quantity', label: 'Cantidad', type: 'float', description: 'Cantidad' },
      { name: 'reserved_quantity', label: 'Reservado', type: 'float', description: 'Reservado' },
      { name: 'available_quantity', label: 'Disponible', type: 'float', description: 'Disponible' },
      { name: 'lot_id', label: 'Lote', type: 'many2one', relation: 'stock.lot', description: 'Lote/Serie' },
    ],
    commonFilters: [
      "Por producto: [['product_id', '=', ID]]",
      "Con stock: [['quantity', '>', 0]]"
    ]
  },

  'stock.picking': {
    name: 'stock.picking',
    label: 'Transferencia',
    description: 'Movimientos: recepciones, entregas, transferencias.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Referencia', type: 'string', description: 'Código' },
      { name: 'partner_id', label: 'Contacto', type: 'many2one', relation: 'res.partner', description: 'Cliente/Prov' },
      { name: 'scheduled_date', label: 'Fecha Prog.', type: 'datetime', description: 'Fecha prevista' },
      { name: 'date_done', label: 'Fecha Real', type: 'datetime', description: 'Fecha efectiva' },
      { name: 'origin', label: 'Origen', type: 'string', description: 'Doc origen' },
      { name: 'state', label: 'Estado', type: 'selection', description: 'Estado', selection: {
        'draft': 'Borrador', 'waiting': 'Esperando', 'confirmed': 'Confirmado', 
        'assigned': 'Listo', 'done': 'Hecho', 'cancel': 'Cancelado'
      }},
      { name: 'picking_type_id', label: 'Tipo Op', type: 'many2one', relation: 'stock.picking.type', description: 'Tipo operación' },
    ],
    commonFilters: [
      "Entregas pendientes: [['state', 'not in', ['done', 'cancel']]]",
      "Hechas: [['state', '=', 'done']]"
    ]
  },
  
  'stock.move': {
    name: 'stock.move',
    label: 'Movimiento Stock',
    description: 'Movimientos individuales de productos.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Descripción', type: 'string', description: 'Descripción' },
      { name: 'product_id', label: 'Producto', type: 'many2one', relation: 'product.product', description: 'Producto' },
      { name: 'product_uom_qty', label: 'Cantidad', type: 'float', description: 'Cantidad' },
      { name: 'quantity_done', label: 'Cant. Hecha', type: 'float', description: 'Cantidad procesada' },
      { name: 'location_id', label: 'Desde', type: 'many2one', relation: 'stock.location', description: 'Ubicación origen' },
      { name: 'location_dest_id', label: 'Hasta', type: 'many2one', relation: 'stock.location', description: 'Ubicación destino' },
      { name: 'picking_id', label: 'Transferencia', type: 'many2one', relation: 'stock.picking', description: 'Transferencia' },
      { name: 'state', label: 'Estado', type: 'selection', description: 'Estado', selection: {
        'draft': 'Borrador', 'waiting': 'Esperando', 'confirmed': 'Disponible',
        'assigned': 'Reservado', 'done': 'Hecho', 'cancel': 'Cancelado'
      }},
      { name: 'date', label: 'Fecha', type: 'datetime', description: 'Fecha' },
    ],
    commonFilters: ["Por producto: [['product_id', '=', ID]]"]
  },
  
  'stock.location': {
    name: 'stock.location',
    label: 'Ubicación',
    description: 'Ubicaciones físicas del almacén.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Nombre', type: 'string', description: 'Nombre' },
      { name: 'complete_name', label: 'Ruta', type: 'string', description: 'Ruta completa' },
      { name: 'location_id', label: 'Padre', type: 'many2one', relation: 'stock.location', description: 'Ubicación padre' },
      { name: 'usage', label: 'Tipo', type: 'selection', description: 'Tipo ubicación', selection: {
        'supplier': 'Proveedor', 'view': 'Vista', 'internal': 'Interna',
        'customer': 'Cliente', 'inventory': 'Inventario', 'production': 'Producción', 'transit': 'Tránsito'
      }},
    ],
    commonFilters: ["Internas: [['usage', '=', 'internal']]"]
  },

  // ---------------------------------------------------------------------------
  // COMPRAS
  // ---------------------------------------------------------------------------
  'purchase.order': {
    name: 'purchase.order',
    label: 'Orden Compra',
    description: 'Órdenes compra a proveedores. RFQs.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Número', type: 'string', description: 'Código OC' },
      { name: 'partner_id', label: 'Proveedor', type: 'many2one', relation: 'res.partner', description: 'Proveedor' },
      { name: 'date_order', label: 'Fecha', type: 'datetime', description: 'Fecha' },
      { name: 'date_planned', label: 'Recepción', type: 'datetime', description: 'Fecha recepción' },
      { name: 'amount_untaxed', label: 'Subtotal', type: 'float', description: 'Subtotal' },
      { name: 'amount_total', label: 'Total', type: 'float', description: 'Total' },
      { name: 'state', label: 'Estado', type: 'selection', description: 'Estado', selection: {
        'draft': 'RFQ', 'sent': 'Enviada', 'to approve': 'Aprobar', 
        'purchase': 'OC', 'done': 'Hecha', 'cancel': 'Cancelada'
      }},
      { name: 'user_id', label: 'Comprador', type: 'many2one', relation: 'res.users', description: 'Comprador' },
    ],
    commonFilters: ["Confirmadas: [['state', '=', 'purchase']]"]
  },
  
  'purchase.order.line': {
    name: 'purchase.order.line',
    label: 'Línea Compra',
    description: 'Productos en OCs. Cantidad, precio.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'order_id', label: 'OC', type: 'many2one', relation: 'purchase.order', description: 'Orden compra' },
      { name: 'product_id', label: 'Producto', type: 'many2one', relation: 'product.product', description: 'Producto' },
      { name: 'name', label: 'Descripción', type: 'string', description: 'Descripción' },
      { name: 'product_qty', label: 'Cantidad', type: 'float', description: 'Cantidad' },
      { name: 'qty_received', label: 'Recibida', type: 'float', description: 'Cantidad recibida' },
      { name: 'price_unit', label: 'Precio', type: 'float', description: 'Precio unitario' },
      { name: 'price_subtotal', label: 'Subtotal', type: 'float', description: 'Subtotal' },
    ],
    commonFilters: ["Por OC: [['order_id', '=', ID]]"]
  },

  // ---------------------------------------------------------------------------
  // CRM
  // ---------------------------------------------------------------------------
  'crm.lead': {
    name: 'crm.lead',
    label: 'Oportunidad/Lead',
    description: 'Oportunidades venta, leads, pipeline.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Nombre', type: 'string', description: 'Nombre' },
      { name: 'partner_id', label: 'Cliente', type: 'many2one', relation: 'res.partner', description: 'Cliente' },
      { name: 'email_from', label: 'Email', type: 'string', description: 'Email' },
      { name: 'phone', label: 'Teléfono', type: 'string', description: 'Teléfono' },
      { name: 'expected_revenue', label: 'Ingreso Esperado', type: 'float', description: 'Monto esperado' },
      { name: 'probability', label: 'Probabilidad', type: 'float', description: 'Probabilidad %' },
      { name: 'stage_id', label: 'Etapa', type: 'many2one', relation: 'crm.stage', description: 'Etapa' },
      { name: 'user_id', label: 'Vendedor', type: 'many2one', relation: 'res.users', description: 'Vendedor' },
      { name: 'team_id', label: 'Equipo', type: 'many2one', relation: 'crm.team', description: 'Equipo' },
      { name: 'type', label: 'Tipo', type: 'selection', description: 'Tipo', selection: {
        'lead': 'Lead', 'opportunity': 'Oportunidad'
      }},
      { name: 'active', label: 'Activo', type: 'boolean', description: 'Activo' },
      { name: 'date_deadline', label: 'Cierre', type: 'date', description: 'Fecha cierre' },
      { name: 'create_date', label: 'Creado', type: 'datetime', description: 'Creado' },
    ],
    commonFilters: ["Oportunidades: [['type', '=', 'opportunity'], ['active', '=', true]]"]
  },
  
  // ---------------------------------------------------------------------------
  // EMPLEADOS Y RECURSOS HUMANOS
  // ---------------------------------------------------------------------------
  'hr.employee': {
    name: 'hr.employee',
    label: 'Empleado',
    description: 'Empleados de la empresa.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Nombre', type: 'string', description: 'Nombre' },
      { name: 'work_email', label: 'Email', type: 'string', description: 'Email laboral' },
      { name: 'work_phone', label: 'Teléfono', type: 'string', description: 'Teléfono' },
      { name: 'job_id', label: 'Puesto', type: 'many2one', relation: 'hr.job', description: 'Puesto trabajo' },
      { name: 'department_id', label: 'Departamento', type: 'many2one', relation: 'hr.department', description: 'Departamento' },
      { name: 'parent_id', label: 'Manager', type: 'many2one', relation: 'hr.employee', description: 'Manager' },
      { name: 'active', label: 'Activo', type: 'boolean', description: 'Activo' },
    ],
    commonFilters: ["Activos: [['active', '=', true]]"]
  },
  
  'hr.attendance': {
    name: 'hr.attendance',
    label: 'Asistencia',
    description: 'Registro horario empleados.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'employee_id', label: 'Empleado', type: 'many2one', relation: 'hr.employee', description: 'Empleado' },
      { name: 'check_in', label: 'Entrada', type: 'datetime', description: 'Hora entrada' },
      { name: 'check_out', label: 'Salida', type: 'datetime', description: 'Hora salida' },
      { name: 'worked_hours', label: 'Horas', type: 'float', description: 'Horas trabajadas' },
    ],
    commonFilters: ["Hoy: [['check_in', '>=', 'HOY 00:00:00']]"]
  },
  
  'hr.leave': {
    name: 'hr.leave',
    label: 'Ausencias',
    description: 'Vacaciones, licencias, ausencias.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'employee_id', label: 'Empleado', type: 'many2one', relation: 'hr.employee', description: 'Empleado' },
      { name: 'holiday_status_id', label: 'Tipo', type: 'many2one', relation: 'hr.leave.type', description: 'Tipo ausencia' },
      { name: 'request_date_from', label: 'Desde', type: 'date', description: 'Desde' },
      { name: 'request_date_to', label: 'Hasta', type: 'date', description: 'Hasta' },
      { name: 'number_of_days', label: 'Días', type: 'float', description: 'Días' },
      { name: 'state', label: 'Estado', type: 'selection', description: 'Estado', selection: {
        'draft': 'Borrador', 'confirm': 'Solicitud', 'refuse': 'Rechazada', 'validate': 'Aprobada', 'cancel': 'Cancelada'
      }},
    ],
    commonFilters: ["Aprobadas: [['state', '=', 'validate']]"]
  },
  
  // ---------------------------------------------------------------------------
  // PROYECTOS Y TAREAS
  // ---------------------------------------------------------------------------
  'project.project': {
    name: 'project.project',
    label: 'Proyecto',
    description: 'Proyectos de la empresa.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Nombre', type: 'string', description: 'Nombre' },
      { name: 'partner_id', label: 'Cliente', type: 'many2one', relation: 'res.partner', description: 'Cliente' },
      { name: 'user_id', label: 'Manager', type: 'many2one', relation: 'res.users', description: 'Project manager' },
      { name: 'date_start', label: 'Inicio', type: 'date', description: 'Fecha inicio' },
      { name: 'date', label: 'Fin', type: 'date', description: 'Fecha fin' },
      { name: 'active', label: 'Activo', type: 'boolean', description: 'Activo' },
    ],
    commonFilters: ["Activos: [['active', '=', true]]"]
  },
  
  'project.task': {
    name: 'project.task',
    label: 'Tarea',
    description: 'Tareas de proyectos.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Nombre', type: 'string', description: 'Nombre' },
      { name: 'project_id', label: 'Proyecto', type: 'many2one', relation: 'project.project', description: 'Proyecto' },
      { name: 'user_ids', label: 'Asignados', type: 'one2many', relation: 'res.users', description: 'Usuarios asignados', searchable: false },
      { name: 'date_deadline', label: 'Vencimiento', type: 'date', description: 'Fecha límite' },
      { name: 'stage_id', label: 'Etapa', type: 'many2one', relation: 'project.task.type', description: 'Etapa' },
      { name: 'priority', label: 'Prioridad', type: 'selection', description: 'Prioridad', selection: {
        '0': 'Normal', '1': 'Alta'
      }},
      { name: 'active', label: 'Activa', type: 'boolean', description: 'Activa' },
    ],
    commonFilters: ["Por proyecto: [['project_id', '=', ID]]"]
  },
  
  // ---------------------------------------------------------------------------
  // HELPDESK / SOPORTE
  // ---------------------------------------------------------------------------
  'helpdesk.ticket': {
    name: 'helpdesk.ticket',
    label: 'Ticket Soporte',
    description: 'Tickets de soporte, casos de ayuda.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Asunto', type: 'string', description: 'Asunto' },
      { name: 'partner_id', label: 'Cliente', type: 'many2one', relation: 'res.partner', description: 'Cliente' },
      { name: 'team_id', label: 'Equipo', type: 'many2one', relation: 'helpdesk.team', description: 'Equipo' },
      { name: 'user_id', label: 'Asignado', type: 'many2one', relation: 'res.users', description: 'Usuario asignado' },
      { name: 'stage_id', label: 'Etapa', type: 'many2one', relation: 'helpdesk.stage', description: 'Etapa' },
      { name: 'priority', label: 'Prioridad', type: 'selection', description: 'Prioridad', selection: {
        '0': 'Baja', '1': 'Media', '2': 'Alta', '3': 'Urgente'
      }},
      { name: 'create_date', label: 'Creado', type: 'datetime', description: 'Fecha creación' },
      { name: 'close_date', label: 'Cerrado', type: 'datetime', description: 'Fecha cierre' },
    ],
    commonFilters: ["Abiertos: [['close_date', '=', false]]"]
  },
  
  // ---------------------------------------------------------------------------
  // MANUFACTURA / PRODUCCIÓN
  // ---------------------------------------------------------------------------
  'mrp.production': {
    name: 'mrp.production',
    label: 'Orden Producción',
    description: 'Órdenes de fabricación/manufactura.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Referencia', type: 'string', description: 'Referencia' },
      { name: 'product_id', label: 'Producto', type: 'many2one', relation: 'product.product', description: 'Producto a fabricar' },
      { name: 'product_qty', label: 'Cantidad', type: 'float', description: 'Cantidad' },
      { name: 'date_planned_start', label: 'Inicio', type: 'datetime', description: 'Fecha inicio' },
      { name: 'date_planned_finished', label: 'Fin', type: 'datetime', description: 'Fecha fin' },
      { name: 'state', label: 'Estado', type: 'selection', description: 'Estado', selection: {
        'draft': 'Borrador', 'confirmed': 'Confirmada', 'progress': 'En Progreso', 'done': 'Hecha', 'cancel': 'Cancelada'
      }},
      { name: 'user_id', label: 'Responsable', type: 'many2one', relation: 'res.users', description: 'Responsable' },
    ],
    commonFilters: ["En progreso: [['state', '=', 'progress']]"]
  },
  
  'mrp.bom': {
    name: 'mrp.bom',
    label: 'Lista Materiales (BOM)',
    description: 'Recetas, listas de materiales para producción.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'code', label: 'Código', type: 'string', description: 'Código' },
      { name: 'product_tmpl_id', label: 'Producto', type: 'many2one', relation: 'product.template', description: 'Producto' },
      { name: 'product_qty', label: 'Cantidad', type: 'float', description: 'Cantidad' },
      { name: 'type', label: 'Tipo', type: 'selection', description: 'Tipo', selection: {
        'normal': 'Fabricar', 'phantom': 'Kit'
      }},
      { name: 'active', label: 'Activo', type: 'boolean', description: 'Activo' },
    ],
    commonFilters: ["Activos: [['active', '=', true]]"]
  },
  
  // ---------------------------------------------------------------------------
  // CONTABILIDAD ADICIONAL
  // ---------------------------------------------------------------------------
  'account.analytic.account': {
    name: 'account.analytic.account',
    label: 'Cuenta Analítica',
    description: 'Cuentas analíticas para seguimiento de costos por proyecto/departamento.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Nombre', type: 'string', description: 'Nombre' },
      { name: 'code', label: 'Código', type: 'string', description: 'Código' },
      { name: 'partner_id', label: 'Cliente', type: 'many2one', relation: 'res.partner', description: 'Cliente' },
      { name: 'active', label: 'Activo', type: 'boolean', description: 'Activo' },
    ],
    commonFilters: ["Activas: [['active', '=', true]]"]
  },
  
  'account.move.line': {
    name: 'account.move.line',
    label: 'Línea Asiento',
    description: 'Líneas de facturas/asientos contables. Apuntes contables.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'move_id', label: 'Asiento', type: 'many2one', relation: 'account.move', description: 'Factura/Asiento' },
      { name: 'product_id', label: 'Producto', type: 'many2one', relation: 'product.product', description: 'Producto' },
      { name: 'name', label: 'Descripción', type: 'string', description: 'Descripción' },
      { name: 'account_id', label: 'Cuenta', type: 'many2one', relation: 'account.account', description: 'Cuenta contable' },
      { name: 'debit', label: 'Debe', type: 'float', description: 'Debe' },
      { name: 'credit', label: 'Haber', type: 'float', description: 'Haber' },
      { name: 'balance', label: 'Balance', type: 'float', description: 'Balance (debe-haber)' },
      { name: 'quantity', label: 'Cantidad', type: 'float', description: 'Cantidad' },
      { name: 'price_unit', label: 'Precio', type: 'float', description: 'Precio unitario' },
      { name: 'price_subtotal', label: 'Subtotal', type: 'float', description: 'Subtotal' },
    ],
    commonFilters: ["Por factura: [['move_id', '=', ID]]"]
  },
  
  // ---------------------------------------------------------------------------
  // GASTOS Y VIAJES
  // ---------------------------------------------------------------------------
  'hr.expense': {
    name: 'hr.expense',
    label: 'Gasto',
    description: 'Gastos de empleados, viáticos, reembolsos.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Descripción', type: 'string', description: 'Descripción' },
      { name: 'employee_id', label: 'Empleado', type: 'many2one', relation: 'hr.employee', description: 'Empleado' },
      { name: 'product_id', label: 'Categoría', type: 'many2one', relation: 'product.product', description: 'Categoría gasto' },
      { name: 'unit_amount', label: 'Monto Unit.', type: 'float', description: 'Precio unitario' },
      { name: 'quantity', label: 'Cantidad', type: 'float', description: 'Cantidad' },
      { name: 'total_amount', label: 'Total', type: 'float', description: 'Total' },
      { name: 'date', label: 'Fecha', type: 'date', description: 'Fecha' },
      { name: 'state', label: 'Estado', type: 'selection', description: 'Estado', selection: {
        'draft': 'Borrador', 'reported': 'Reportado', 'approved': 'Aprobado', 'done': 'Pagado', 'refused': 'Rechazado'
      }},
    ],
    commonFilters: ["Por aprobar: [['state', '=', 'reported']]"]
  },
  
  // ---------------------------------------------------------------------------
  // SUSCRIPCIONES Y CONTRATOS
  // ---------------------------------------------------------------------------
  'sale.subscription': {
    name: 'sale.subscription',
    label: 'Suscripción',
    description: 'Contratos recurrentes, suscripciones.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'code', label: 'Referencia', type: 'string', description: 'Código' },
      { name: 'partner_id', label: 'Cliente', type: 'many2one', relation: 'res.partner', description: 'Cliente' },
      { name: 'date_start', label: 'Inicio', type: 'date', description: 'Fecha inicio' },
      { name: 'date', label: 'Fin', type: 'date', description: 'Fecha fin' },
      { name: 'recurring_amount_total', label: 'Monto Recurrente', type: 'float', description: 'Monto recurrente' },
      { name: 'stage_id', label: 'Etapa', type: 'many2one', relation: 'sale.subscription.stage', description: 'Etapa' },
      { name: 'user_id', label: 'Vendedor', type: 'many2one', relation: 'res.users', description: 'Vendedor' },
    ],
    commonFilters: ["Activas: [['stage_id.in_progress', '=', true]]"]
  },
  
  // ---------------------------------------------------------------------------
  // PUNTO DE VENTA (POS)
  // ---------------------------------------------------------------------------
  'pos.order': {
    name: 'pos.order',
    label: 'Venta POS',
    description: 'Ventas de punto de venta (TPV).',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Orden', type: 'string', description: 'Número orden' },
      { name: 'pos_reference', label: 'Ticket', type: 'string', description: 'Número ticket' },
      { name: 'partner_id', label: 'Cliente', type: 'many2one', relation: 'res.partner', description: 'Cliente' },
      { name: 'date_order', label: 'Fecha', type: 'datetime', description: 'Fecha' },
      { name: 'amount_total', label: 'Total', type: 'float', description: 'Total' },
      { name: 'amount_paid', label: 'Pagado', type: 'float', description: 'Pagado' },
      { name: 'amount_return', label: 'Cambio', type: 'float', description: 'Cambio' },
      { name: 'state', label: 'Estado', type: 'selection', description: 'Estado', selection: {
        'draft': 'Nuevo', 'paid': 'Pagado', 'done': 'Validado', 'invoiced': 'Facturado', 'cancel': 'Cancelado'
      }},
      { name: 'session_id', label: 'Sesión', type: 'many2one', relation: 'pos.session', description: 'Sesión POS' },
      { name: 'user_id', label: 'Cajero', type: 'many2one', relation: 'res.users', description: 'Cajero' },
    ],
    commonFilters: ["Hoy: [['date_order', '>=', 'HOY 00:00:00']]"]
  },
  
  'pos.session': {
    name: 'pos.session',
    label: 'Sesión POS',
    description: 'Sesiones de caja, turnos de punto de venta.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Nombre', type: 'string', description: 'Nombre' },
      { name: 'user_id', label: 'Cajero', type: 'many2one', relation: 'res.users', description: 'Cajero' },
      { name: 'start_at', label: 'Apertura', type: 'datetime', description: 'Fecha apertura' },
      { name: 'stop_at', label: 'Cierre', type: 'datetime', description: 'Fecha cierre' },
      { name: 'state', label: 'Estado', type: 'selection', description: 'Estado', selection: {
        'opening_control': 'Abriendo', 'opened': 'Abierta', 'closing_control': 'Cerrando', 'closed': 'Cerrada'
      }},
      { name: 'cash_register_balance_start', label: 'Efectivo Inicial', type: 'float', description: 'Efectivo inicial' },
      { name: 'cash_register_balance_end_real', label: 'Efectivo Final', type: 'float', description: 'Efectivo final' },
    ],
    commonFilters: ["Abiertas: [['state', '=', 'opened']]"]
  },
  
  // ---------------------------------------------------------------------------
  // MARKETING Y CAMPAÑAS
  // ---------------------------------------------------------------------------
  'mailing.mailing': {
    name: 'mailing.mailing',
    label: 'Campaña Email',
    description: 'Campañas de email marketing, newsletters.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'subject', label: 'Asunto', type: 'string', description: 'Asunto' },
      { name: 'mailing_model_id', label: 'Destinatarios', type: 'many2one', relation: 'ir.model', description: 'Modelo destinatarios' },
      { name: 'sent_date', label: 'Enviado', type: 'datetime', description: 'Fecha envío' },
      { name: 'sent', label: 'Cantidad Enviados', type: 'integer', description: 'Enviados' },
      { name: 'delivered', label: 'Entregados', type: 'integer', description: 'Entregados' },
      { name: 'opened', label: 'Abiertos', type: 'integer', description: 'Abiertos' },
      { name: 'clicked', label: 'Clicks', type: 'integer', description: 'Clicks' },
      { name: 'state', label: 'Estado', type: 'selection', description: 'Estado', selection: {
        'draft': 'Borrador', 'in_queue': 'En Cola', 'sending': 'Enviando', 'done': 'Enviado'
      }},
    ],
    commonFilters: ["Enviadas: [['state', '=', 'done']]"]
  },
  
  // ---------------------------------------------------------------------------
  // ACTIVOS FIJOS
  // ---------------------------------------------------------------------------
  'account.asset': {
    name: 'account.asset',
    label: 'Activo Fijo',
    description: 'Activos fijos, bienes de uso, amortizaciones.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Nombre', type: 'string', description: 'Nombre' },
      { name: 'original_value', label: 'Valor Original', type: 'float', description: 'Valor original' },
      { name: 'salvage_value', label: 'Valor Residual', type: 'float', description: 'Valor residual' },
      { name: 'book_value', label: 'Valor Libro', type: 'float', description: 'Valor en libros' },
      { name: 'acquisition_date', label: 'Fecha Adquisición', type: 'date', description: 'Fecha compra' },
      { name: 'first_depreciation_date', label: 'Inicio Amortización', type: 'date', description: 'Inicio amortización' },
      { name: 'method_number', label: 'Períodos', type: 'integer', description: 'Número períodos' },
      { name: 'state', label: 'Estado', type: 'selection', description: 'Estado', selection: {
        'draft': 'Borrador', 'open': 'En Curso', 'close': 'Cerrado'
      }},
    ],
    commonFilters: ["En uso: [['state', '=', 'open']]"]
  },
  
  // ---------------------------------------------------------------------------
  // MANTENIMIENTO
  // ---------------------------------------------------------------------------
  'maintenance.equipment': {
    name: 'maintenance.equipment',
    label: 'Equipo',
    description: 'Equipos, máquinas, activos para mantenimiento.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Nombre', type: 'string', description: 'Nombre' },
      { name: 'equipment_assign_to', label: 'Asignado a', type: 'selection', description: 'Tipo asignación', selection: {
        'employee': 'Empleado', 'department': 'Departamento', 'other': 'Otro'
      }},
      { name: 'employee_id', label: 'Empleado', type: 'many2one', relation: 'hr.employee', description: 'Empleado' },
      { name: 'department_id', label: 'Departamento', type: 'many2one', relation: 'hr.department', description: 'Departamento' },
      { name: 'category_id', label: 'Categoría', type: 'many2one', relation: 'maintenance.equipment.category', description: 'Categoría' },
      { name: 'active', label: 'Activo', type: 'boolean', description: 'Activo' },
    ],
    commonFilters: ["Activos: [['active', '=', true]]"]
  },
  
  'maintenance.request': {
    name: 'maintenance.request',
    label: 'Solicitud Mantenimiento',
    description: 'Solicitudes de mantenimiento, reparaciones.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Asunto', type: 'string', description: 'Asunto' },
      { name: 'equipment_id', label: 'Equipo', type: 'many2one', relation: 'maintenance.equipment', description: 'Equipo' },
      { name: 'user_id', label: 'Técnico', type: 'many2one', relation: 'res.users', description: 'Técnico asignado' },
      { name: 'owner_user_id', label: 'Solicitante', type: 'many2one', relation: 'res.users', description: 'Solicitante' },
      { name: 'request_date', label: 'Fecha', type: 'date', description: 'Fecha solicitud' },
      { name: 'schedule_date', label: 'Programado', type: 'datetime', description: 'Fecha programada' },
      { name: 'close_date', label: 'Cerrado', type: 'datetime', description: 'Fecha cierre' },
      { name: 'stage_id', label: 'Etapa', type: 'many2one', relation: 'maintenance.stage', description: 'Etapa' },
      { name: 'priority', label: 'Prioridad', type: 'selection', description: 'Prioridad', selection: {
        '0': 'Baja', '1': 'Normal', '2': 'Alta', '3': 'Urgente'
      }},
    ],
    commonFilters: ["Abiertas: [['close_date', '=', false]]"]
  },
  
  // ---------------------------------------------------------------------------
  // FLOTA Y VEHÍCULOS
  // ---------------------------------------------------------------------------
  'fleet.vehicle': {
    name: 'fleet.vehicle',
    label: 'Vehículo',
    description: 'Vehículos de la empresa, flota.',
    fields: [
      { name: 'id', label: 'ID', type: 'integer', description: 'ID' },
      { name: 'name', label: 'Nombre', type: 'string', description: 'Nombre' },
      { name: 'license_plate', label: 'Patente', type: 'string', description: 'Patente' },
      { name: 'model_id', label: 'Modelo', type: 'many2one', relation: 'fleet.vehicle.model', description: 'Modelo' },
      { name: 'driver_id', label: 'Conductor', type: 'many2one', relation: 'res.partner', description: 'Conductor' },
      { name: 'odometer', label: 'Odómetro', type: 'float', description: 'Km' },
      { name: 'acquisition_date', label: 'Fecha Compra', type: 'date', description: 'Fecha compra' },
      { name: 'active', label: 'Activo', type: 'boolean', description: 'Activo' },
    ],
    commonFilters: ["Activos: [['active', '=', true]]"]
  },
}

// ============================================================================
// FUNCIONES DE UTILIDAD
// ============================================================================

/**
 * Genera documentación CONCISA de modelos (optimizada para no exceder límites de tokens)
 */
export function generateSchemaDocumentation(): string {
  let doc = `## MODELOS ODOO (${Object.keys(ODOO_MODELS).length} disponibles)\n\n`
  
  // Agrupar por categoría
  const categories = {
    'Ventas': ['sale.order', 'sale.order.line', 'sale.subscription', 'pos.order', 'pos.session'],
    'Productos': ['product.product', 'product.template', 'product.category'],
    'Clientes': ['res.partner'],
    'Contabilidad': ['account.move', 'account.move.line', 'account.payment', 'account.analytic.account', 'account.asset'],
    'Inventario': ['stock.quant', 'stock.picking', 'stock.move', 'stock.location'],
    'Compras': ['purchase.order', 'purchase.order.line'],
    'CRM': ['crm.lead'],
    'RRHH': ['hr.employee', 'hr.attendance', 'hr.leave', 'hr.expense'],
    'Proyectos': ['project.project', 'project.task'],
    'Soporte': ['helpdesk.ticket'],
    'Producción': ['mrp.production', 'mrp.bom'],
    'Marketing': ['mailing.mailing'],
    'Mantenimiento': ['maintenance.equipment', 'maintenance.request'],
    'Flota': ['fleet.vehicle']
  }
  
  for (const [category, modelNames] of Object.entries(categories)) {
    const models = modelNames.map(name => ODOO_MODELS[name]).filter(Boolean)
    if (models.length === 0) continue
    
    doc += `**${category}:**\n`
    for (const model of models) {
      // Solo nombre, descripción y campos principales (primeros 8)
      const mainFields = model.fields.slice(0, 8).map(f => `\`${f.name}\``).join(', ')
      doc += `- \`${model.name}\`: ${model.description} Campos: ${mainFields}${model.fields.length > 8 ? '...' : ''}\n`
    }
    doc += '\n'
  }
  
  // Referencia rápida de filtros comunes
  doc += `**Filtros importantes:**\n`
  doc += `- Ventas: \`[['state','in',['sale','done']]]\`\n`
  doc += `- Clientes: \`[['customer_rank','>',0]]\`\n`
  doc += `- Productos: \`[['name','ilike','%texto%']]\`, \`[['qty_available','>',0]]\`\n`
  doc += `- Facturas: \`[['move_type','=','out_invoice'],['state','=','posted']]\`\n`
  doc += `- Fechas: \`[['date','>=','2025-12-01']]\`\n\n`
  
  return doc
}

/**
 * Genera documentación COMPLETA de un modelo específico (para debugging)
 */
export function generateModelDocumentation(modelName: string): string {
  const model = ODOO_MODELS[modelName]
  if (!model) return `Modelo ${modelName} no encontrado`
  
  let doc = `### ${model.label} (\`${model.name}\`)\n${model.description}\n\n**Campos:**\n`
  
  for (const field of model.fields) {
    doc += `- \`${field.name}\` (${field.type}): ${field.description}`
    if (field.selection) {
      const opts = Object.entries(field.selection).map(([k,v]) => `'${k}'=${v}`).join(', ')
      doc += ` [${opts}]`
    }
    doc += '\n'
  }
  
  if (model.commonFilters?.length) {
    doc += `\n**Filtros:** ${model.commonFilters.join(' | ')}\n`
  }
  
  return doc
}

/**
 * Obtiene un modelo específico por su nombre técnico
 */
export function getModel(modelName: string): OdooModel | undefined {
  return ODOO_MODELS[modelName]
}

/**
 * Valida si un modelo existe en el schema
 */
export function isValidModel(modelName: string): boolean {
  return modelName in ODOO_MODELS
}

/**
 * Obtiene los campos válidos para un modelo
 */
export function getValidFields(modelName: string): string[] {
  const model = ODOO_MODELS[modelName]
  if (!model) return []
  return model.fields.map(f => f.name)
}

/**
 * Lista resumida de modelos para referencia rápida
 */
export function getModelList(): Array<{ name: string; label: string; description: string }> {
  return Object.values(ODOO_MODELS).map(m => ({
    name: m.name,
    label: m.label,
    description: m.description
  }))
}
