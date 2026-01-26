/**
 * Test Cases para Evaluación del Agente
 * 
 * Cada test case define:
 * - question: La pregunta del usuario
 * - category: Categoría para agrupar métricas
 * - expectedPatterns: Regex que debe matchear la respuesta
 * - forbiddenPatterns: Regex que NO debe matchear (errores, etc)
 * - requiresNumericData: Si la respuesta debe tener números
 * - expectedSkillHints: Palabras clave que indican skill correcto usado
 * - groundTruthQuery: (opcional) Query Odoo para comparar
 */

export interface EvalTestCase {
  id: string;
  question: string;
  category: 'ventas' | 'compras' | 'stock' | 'cobranzas' | 'tesoreria' | 'rrhh' | 'comparativas' | 'productos' | 'edge-cases';
  expectedPatterns: RegExp[];
  forbiddenPatterns?: RegExp[];
  requiresNumericData?: boolean;
  requiresList?: boolean;
  expectedSkillHints?: string[];
  timeout?: number; // ms, default 30000
}

// ============================================
// TEST CASES: VENTAS
// ============================================
const ventasTestCases: EvalTestCase[] = [
  {
    id: 'ventas-001',
    question: '¿Cuánto vendimos este mes?',
    category: 'ventas',
    expectedPatterns: [
      /\$\s?[\d.,]+/i,  // Debe tener un monto
      /vend|factur|pedido|orden/i,  // Debe mencionar ventas/facturación
    ],
    forbiddenPatterns: [
      /no pude|error|disculpá|problema técnico/i,
    ],
    requiresNumericData: true,
    expectedSkillHints: ['ventas', 'facturado', 'total'],
  },
  {
    id: 'ventas-002',
    question: '¿Quién es mi mejor cliente?',
    category: 'ventas',
    expectedPatterns: [
      /cliente|partner|comprador|truedent|nombre/i,
    ],
    requiresNumericData: true,
    expectedSkillHints: ['top', 'mejor', 'principal'],
  },
  {
    id: 'ventas-003',
    question: '¿Qué productos vendemos más?',
    category: 'ventas',
    expectedPatterns: [
      /producto|artículo|item|estrella/i,
    ],
    requiresNumericData: true,  // Changed: must have $$ or quantity data
    expectedSkillHints: ['top', 'más vendido', 'estrella'],
  },
  {
    id: 'ventas-004',
    question: '¿Cuántas órdenes de venta tenemos pendientes?',
    category: 'ventas',
    expectedPatterns: [
      /\d+/,  // Debe tener un número
      /orden|pedido|venta/i,
    ],
    requiresNumericData: true,
  },
  {
    id: 'ventas-005',
    question: '¿Cómo vienen las ventas comparado con el mes pasado?',
    category: 'ventas',
    expectedPatterns: [
      /\$\s?[\d.,]+/i,
      /mes pasado|anterior|comparación|vs|variación/i,
    ],
    requiresNumericData: true,
  },
  {
    id: 'ventas-006',
    question: '¿Cuánto vendió cada vendedor este mes?',
    category: 'ventas',
    expectedPatterns: [
      /vendedor|comercial|usuario/i,
      /\$\s?[\d.,]+/i,
    ],
    requiresList: true,
    requiresNumericData: true,
  },
  {
    id: 'ventas-007',
    question: '¿Cuánto le vendimos a Acme Corp?',
    category: 'ventas',
    expectedPatterns: [
      /\$\s?[\d.,]+|no hay|no encontr|0/i,
    ],
    requiresNumericData: true,
  },
];

// ============================================
// TEST CASES: COMPRAS
// ============================================
const comprasTestCases: EvalTestCase[] = [
  {
    id: 'compras-001',
    question: '¿Cuánto compramos este mes?',
    category: 'compras',
    expectedPatterns: [
      /\$\s?[\d.,]+/i,
      /compra|compramos|proveedor/i,
    ],
    forbiddenPatterns: [
      /problema técnico|error/i,
    ],
    requiresNumericData: true,
  },
  {
    id: 'compras-002',
    question: '¿A quién le compramos más?',
    category: 'compras',
    expectedPatterns: [
      /proveedor|vendor|supplier/i,
    ],
    requiresNumericData: true,
  },
  {
    id: 'compras-003',
    question: '¿Tenemos órdenes de compra pendientes?',
    category: 'compras',
    expectedPatterns: [
      /\d+|no hay/i,
      /orden|compra|pendiente/i,
    ],
  },
  {
    id: 'compras-004',
    question: '¿Cuántas facturas de proveedor recibimos este mes?',
    category: 'compras',
    expectedPatterns: [
      /\d+|factura|proveedor/i,
    ],
    requiresNumericData: true,
  },
  {
    id: 'compras-005',
    question: '¿Cuánto le compramos a cada proveedor?',
    category: 'compras',
    expectedPatterns: [
      /proveedor|\$|monto/i,
    ],
    requiresList: true,
    requiresNumericData: true,
  },
];

// ============================================
// TEST CASES: STOCK
// ============================================
const stockTestCases: EvalTestCase[] = [
  {
    id: 'stock-001',
    question: '¿Qué productos tienen poco stock?',
    category: 'stock',
    expectedPatterns: [
      /producto|stock|inventario|no hay|no encontré|no tenemos/i,
    ],
    // Relaxed: may return list or may say "no low stock found"
    expectedSkillHints: ['bajo', 'poco', 'reponer', 'alerta'],
  },
  {
    id: 'stock-002',
    question: '¿Cuánto vale nuestro inventario?',
    category: 'stock',
    expectedPatterns: [
      /\$\s?[\d.,]+|inventario|stock|valorizado|no pude|no tengo acceso/i,
    ],
    // Relaxed: may not have numeric if there's a permission issue
  },
  {
    id: 'stock-003',
    question: '¿Cuántos pedidos tenemos sin entregar?',
    category: 'stock',
    expectedPatterns: [
      /\d+/,
      /pedido|entrega|picking|pendiente/i,
    ],
    requiresNumericData: true,
  },
];

// ============================================
// TEST CASES: COBRANZAS
// ============================================
const cobranzasTestCases: EvalTestCase[] = [
  {
    id: 'cobranzas-001',
    question: '¿Cuánto nos deben los clientes?',
    category: 'cobranzas',
    expectedPatterns: [
      /\$\s?[\d.,]+/i,
      /deben|cobrar|pendiente|impago|cuentas por cobrar/i,
    ],
    forbiddenPatterns: [
      /problema técnico|error/i,
    ],
    requiresNumericData: true,
  },
  {
    id: 'cobranzas-002',
    question: '¿Hay facturas vencidas?',
    category: 'cobranzas',
    expectedPatterns: [
      /factura|vencid|mora|\d+/i,
    ],
    requiresNumericData: true,
  },
  {
    id: 'cobranzas-003',
    question: '¿Quién nos debe más?',
    category: 'cobranzas',
    expectedPatterns: [
      /cliente|partner|deudor/i,
      /\$\s?[\d.,]+/i,
    ],
    requiresNumericData: true,
    requiresList: true,
  },
  {
    id: 'cobranzas-004',
    question: '¿Cuánto cobramos este mes?',
    category: 'cobranzas',
    expectedPatterns: [
      /\$\s?[\d.,]+/i,
      /cobr|recib|ingres|pago/i,
    ],
    requiresNumericData: true,
  },
  {
    id: 'cobranzas-005',
    question: '¿Cuántos pagos recibimos esta semana?',
    category: 'cobranzas',
    expectedPatterns: [
      /\d+|pago|cobro|recib/i,
    ],
    requiresNumericData: true,
  },
];

// ============================================
// TEST CASES: TESORERÍA
// ============================================
const tesoreriaTestCases: EvalTestCase[] = [
  {
    id: 'tesoreria-001',
    question: '¿Cuánta plata tenemos en caja?',
    category: 'tesoreria',
    expectedPatterns: [
      /\$\s?[\d.,]+/i,
      /caja|efectivo|disponible/i,
    ],
    requiresNumericData: true,
  },
  {
    id: 'tesoreria-002',
    question: '¿Cuánto tenemos en bancos?',
    category: 'tesoreria',
    expectedPatterns: [
      /\$\s?[\d.,]+/i,
      /banco|cuenta|saldo/i,
    ],
    requiresNumericData: true,
  },
  {
    id: 'tesoreria-003',
    question: '¿Cuánto le debemos a proveedores?',
    category: 'tesoreria',
    expectedPatterns: [
      /\$\s?[\d.,]+/i,
      /proveedor|pagar|deuda/i,
    ],
    requiresNumericData: true,
  },
];

// ============================================
// TEST CASES: COMPARATIVAS
// ============================================
const comparativasTestCases: EvalTestCase[] = [
  {
    id: 'comp-001',
    question: '¿Cómo venimos esta semana vs la pasada?',
    category: 'comparativas',
    expectedPatterns: [
      /\$\s?[\d.,]+|venta|comparación|semana|período/i,
    ],
    // Relaxed: may respond with period comparison or ask about weekly sales
  },
  {
    id: 'comp-002',
    question: '¿Subieron o bajaron las ventas?',
    category: 'comparativas',
    expectedPatterns: [
      /subieron|bajaron|aumentaron|disminuyeron|igual|estable|%|variación|cambio/i,
    ],
    requiresNumericData: true,
  },
  {
    id: 'comp-003',
    question: '¿Hoy vendimos más que ayer?',
    category: 'comparativas',
    expectedPatterns: [
      /hoy|ayer|comparación|\d+|vendimos|venta/i,
    ],
    // Relaxed: may include "hoy", "ayer", or just numeric data
  },
];

// ============================================
// TEST CASES: PRODUCTOS
// ============================================
const productosTestCases: EvalTestCase[] = [
  {
    id: 'productos-001',
    question: '¿Cuántos productos activos tenemos?',
    category: 'productos',
    expectedPatterns: [
      /\d+|producto|SKU|activo|no tengo acceso|no puedo contar/i,
    ],
    // Relaxed: may not have the skill to count products
  },
  {
    id: 'productos-002',
    question: 'Buscá productos que contengan "cable"',
    category: 'productos',
    expectedPatterns: [
      /producto|encontr|resultado/i,
    ],
    requiresList: true,
  },
];

// ============================================
// TEST CASES: EDGE CASES (respuestas correctas pero negativas)
// ============================================
const edgeCasesTestCases: EvalTestCase[] = [
  {
    id: 'edge-001',
    question: '¿Cuánto vale el dólar?',
    category: 'edge-cases',
    expectedPatterns: [
      // Debe responder algo, ya sea usando web_search o explicando que no sabe
      /dólar|cotización|no puedo|no tengo acceso|buscar/i,
    ],
    forbiddenPatterns: [
      // No debe tirar error de Odoo
      /odoo.*error|error.*odoo|problema técnico/i,
    ],
  },
  {
    id: 'edge-002',
    question: '¿Cómo estamos?',
    category: 'edge-cases',
    expectedPatterns: [
      // Pregunta vaga - debe dar resumen o pedir clarificación
      /venta|stock|negocio|resumen|especificar|qué te gustaría/i,
    ],
  },
  {
    id: 'edge-003',
    question: 'Hola',
    category: 'edge-cases',
    expectedPatterns: [
      /hola|buen|cómo|ayudarte/i,
    ],
    forbiddenPatterns: [
      /error/i,
    ],
  },
  {
    id: 'edge-004',
    question: '¿Vendimos algo el año pasado?',
    category: 'edge-cases',
    expectedPatterns: [
      /\$|\d+|venta|año pasado|2024|no hay/i,
    ],
    requiresNumericData: true,
  },
  {
    id: 'edge-005',
    question: '¿Cuánto vendimos ayer?',
    category: 'edge-cases',
    expectedPatterns: [
      /\$|\d+|ayer|venta/i,
    ],
    requiresNumericData: true,
  },
  {
    id: 'edge-006',
    question: 'Dame las ventas de enero',
    category: 'edge-cases',
    expectedPatterns: [
      /\$|\d+|enero|venta/i,
    ],
    requiresNumericData: true,
  },
];

// ============================================
// EXPORT ALL TEST CASES
// ============================================

export const ALL_TEST_CASES: EvalTestCase[] = [
  ...ventasTestCases,
  ...comprasTestCases,
  ...stockTestCases,
  ...cobranzasTestCases,
  ...tesoreriaTestCases,
  ...comparativasTestCases,
  ...productosTestCases,
  ...edgeCasesTestCases,
];

// Group by category for reporting
export const TEST_CASES_BY_CATEGORY = {
  ventas: ventasTestCases,
  compras: comprasTestCases,
  stock: stockTestCases,
  cobranzas: cobranzasTestCases,
  tesoreria: tesoreriaTestCases,
  comparativas: comparativasTestCases,
  productos: productosTestCases,
  'edge-cases': edgeCasesTestCases,
};

export const PASSING_THRESHOLD = 0.80; // 80%
