/**
 * 200 Preguntas de Usuario para Testing del Agente BI
 * 
 * Preguntas reales como las haría un usuario de negocio,
 * sin tecnicismos ni jerga de programación.
 * 
 * 20 categorías × 10 preguntas = 200 preguntas
 */

export interface UserQuestion {
    id: number
    category: string
    question: string
}

export const USER_QUESTIONS: UserQuestion[] = [
    // ========================================
    // 1. CLIENTES INACTIVOS / PERDIDOS (10)
    // ========================================
    { id: 1, category: 'Clientes Inactivos', question: '¿Qué clientes me compraban y dejaron de comprar?' },
    { id: 2, category: 'Clientes Inactivos', question: '¿Cuántos clientes no nos compran hace más de 3 meses?' },
    { id: 3, category: 'Clientes Inactivos', question: '¿Quién fue el último cliente que perdimos?' },
    { id: 4, category: 'Clientes Inactivos', question: 'Dame los clientes que compraron en 2024 pero no en 2025' },
    { id: 5, category: 'Clientes Inactivos', question: '¿Cuánto facturábamos a los clientes que perdimos?' },
    { id: 6, category: 'Clientes Inactivos', question: '¿Hay clientes importantes que no compran hace tiempo?' },
    { id: 7, category: 'Clientes Inactivos', question: '¿Cuáles son los clientes dormidos del último semestre?' },
    { id: 8, category: 'Clientes Inactivos', question: 'Mostrame clientes con más de 60 días sin actividad' },
    { id: 9, category: 'Clientes Inactivos', question: '¿Qué vendedor tiene más clientes inactivos?' },
    { id: 10, category: 'Clientes Inactivos', question: '¿Cuánto dejamos de facturar por clientes perdidos?' },

    // ========================================
    // 2. PRODUCTOS SIN MOVIMIENTO (10)
    // ========================================
    { id: 11, category: 'Productos Sin Movimiento', question: '¿Qué productos no se venden hace mucho?' },
    { id: 12, category: 'Productos Sin Movimiento', question: '¿Cuánto hace que no vendemos el producto X?' },
    { id: 13, category: 'Productos Sin Movimiento', question: 'Dame los productos sin movimiento en los últimos 90 días' },
    { id: 14, category: 'Productos Sin Movimiento', question: '¿Qué productos tenemos en stock pero no se venden?' },
    { id: 15, category: 'Productos Sin Movimiento', question: '¿Cuál es el producto más tiempo sin venderse?' },
    { id: 16, category: 'Productos Sin Movimiento', question: '¿Tenemos productos obsoletos en inventario?' },
    { id: 17, category: 'Productos Sin Movimiento', question: '¿Cuánto dinero tenemos parado en productos sin rotar?' },
    { id: 18, category: 'Productos Sin Movimiento', question: '¿Qué categoría de productos tiene menos rotación?' },
    { id: 19, category: 'Productos Sin Movimiento', question: 'Mostrame productos que antes se vendían bien y ahora no' },
    { id: 20, category: 'Productos Sin Movimiento', question: '¿Hay productos que deberíamos discontinuar?' },

    // ========================================
    // 3. DEUDA Y COBRANZAS (10)
    // ========================================
    { id: 21, category: 'Deuda y Cobranzas', question: '¿Cuánta deuda tenemos de clientes?' },
    { id: 22, category: 'Deuda y Cobranzas', question: '¿Quién nos debe más plata?' },
    { id: 23, category: 'Deuda y Cobranzas', question: '¿Tenemos mucha deuda de más de 60 días?' },
    { id: 24, category: 'Deuda y Cobranzas', question: '¿Cuántas facturas vencidas tenemos?' },
    { id: 25, category: 'Deuda y Cobranzas', question: 'Dame el top 10 de clientes morosos' },
    { id: 26, category: 'Deuda y Cobranzas', question: '¿Cuál es la antigüedad promedio de la deuda?' },
    { id: 27, category: 'Deuda y Cobranzas', question: '¿Qué porcentaje de ventas está pendiente de cobro?' },
    { id: 28, category: 'Deuda y Cobranzas', question: '¿Hay clientes con deuda mayor a su límite de crédito?' },
    { id: 29, category: 'Deuda y Cobranzas', question: '¿Cuánto cobramos este mes vs el anterior?' },
    { id: 30, category: 'Deuda y Cobranzas', question: '¿Qué facturas vencen esta semana?' },

    // ========================================
    // 4. PEDIDOS Y ENTREGAS PENDIENTES (10)
    // ========================================
    { id: 31, category: 'Pedidos Pendientes', question: '¿Qué pedidos tenemos pendientes de entregar?' },
    { id: 32, category: 'Pedidos Pendientes', question: '¿Cuándo llega el pedido del cliente X?' },
    { id: 33, category: 'Pedidos Pendientes', question: '¿Hay pedidos atrasados?' },
    { id: 34, category: 'Pedidos Pendientes', question: '¿Cuántos pedidos tenemos en preparación?' },
    { id: 35, category: 'Pedidos Pendientes', question: '¿Qué pedidos se entregan hoy?' },
    { id: 36, category: 'Pedidos Pendientes', question: '¿Cuál es el pedido más antiguo sin entregar?' },
    { id: 37, category: 'Pedidos Pendientes', question: '¿Cuánto dinero tenemos en pedidos sin facturar?' },
    { id: 38, category: 'Pedidos Pendientes', question: '¿Qué cliente tiene más pedidos pendientes?' },
    { id: 39, category: 'Pedidos Pendientes', question: '¿Hay pedidos esperando stock?' },
    { id: 40, category: 'Pedidos Pendientes', question: '¿Cuántos días demora en promedio una entrega?' },

    // ========================================
    // 5. COMPRAS Y PROVEEDORES (10)
    // ========================================
    { id: 41, category: 'Compras y Proveedores', question: '¿Qué compras tenemos pendientes de recibir?' },
    { id: 42, category: 'Compras y Proveedores', question: '¿Cuándo llega el producto que pedimos?' },
    { id: 43, category: 'Compras y Proveedores', question: '¿Ya pedimos el producto X que está por agotarse?' },
    { id: 44, category: 'Compras y Proveedores', question: '¿Cuánto le compramos a cada proveedor este año?' },
    { id: 45, category: 'Compras y Proveedores', question: '¿Quién es nuestro proveedor principal?' },
    { id: 46, category: 'Compras y Proveedores', question: '¿Tenemos órdenes de compra vencidas?' },
    { id: 47, category: 'Compras y Proveedores', question: '¿Cuánto gastamos en compras el mes pasado?' },
    { id: 48, category: 'Compras y Proveedores', question: '¿Qué proveedor tiene mejores precios para el producto X?' },
    { id: 49, category: 'Compras y Proveedores', question: '¿Hay productos que necesitamos reponer urgente?' },
    { id: 50, category: 'Compras y Proveedores', question: '¿Cuánto debemos a proveedores?' },

    // ========================================
    // 6. VENTAS Y FACTURACIÓN (10)
    // ========================================
    { id: 51, category: 'Ventas y Facturación', question: '¿Cuánto vendimos este mes?' },
    { id: 52, category: 'Ventas y Facturación', question: '¿Cuánto facturamos en abril 2025?' },
    { id: 53, category: 'Ventas y Facturación', question: 'Dame las ventas de la última semana' },
    { id: 54, category: 'Ventas y Facturación', question: '¿Cómo vamos comparado con el mes pasado?' },
    { id: 55, category: 'Ventas y Facturación', question: '¿Cuál fue nuestro mejor mes de ventas?' },
    { id: 56, category: 'Ventas y Facturación', question: '¿Cuántas ventas hicimos hoy?' },
    { id: 57, category: 'Ventas y Facturación', question: '¿Cuál es el ticket promedio?' },
    { id: 58, category: 'Ventas y Facturación', question: '¿Qué día de la semana vendemos más?' },
    { id: 59, category: 'Ventas y Facturación', question: '¿Cuánto falta para llegar al objetivo del mes?' },
    { id: 60, category: 'Ventas y Facturación', question: '¿Cuáles son las últimas 10 ventas?' },

    // ========================================
    // 7. TOP CLIENTES (10)
    // ========================================
    { id: 61, category: 'Top Clientes', question: '¿Quiénes son nuestros mejores clientes?' },
    { id: 62, category: 'Top Clientes', question: 'Dame el top 10 clientes por facturación' },
    { id: 63, category: 'Top Clientes', question: '¿Qué clientes compraron más este año?' },
    { id: 64, category: 'Top Clientes', question: '¿Cuánto representa el top 20% de clientes?' },
    { id: 65, category: 'Top Clientes', question: '¿Quién es nuestro cliente más antiguo?' },
    { id: 66, category: 'Top Clientes', question: '¿Qué clientes tienen más pedidos este mes?' },
    { id: 67, category: 'Top Clientes', question: '¿Cuáles son los clientes nuevos de este mes?' },
    { id: 68, category: 'Top Clientes', question: '¿Qué cliente tuvo mayor crecimiento vs año pasado?' },
    { id: 69, category: 'Top Clientes', question: '¿Cuántos clientes activos tenemos?' },
    { id: 70, category: 'Top Clientes', question: '¿Qué clientes compraron más de $100.000 este mes?' },

    // ========================================
    // 8. TOP PRODUCTOS (10)
    // ========================================
    { id: 71, category: 'Top Productos', question: '¿Cuáles son los productos más vendidos?' },
    { id: 72, category: 'Top Productos', question: 'Dame el top 10 productos por cantidad' },
    { id: 73, category: 'Top Productos', question: '¿Qué producto factura más?' },
    { id: 74, category: 'Top Productos', question: '¿Cuáles son los productos estrella de este mes?' },
    { id: 75, category: 'Top Productos', question: '¿Qué categoría de productos se vende más?' },
    { id: 76, category: 'Top Productos', question: '¿Cuál es el producto con mejor margen?' },
    { id: 77, category: 'Top Productos', question: '¿Qué productos nuevos se están vendiendo bien?' },
    { id: 78, category: 'Top Productos', question: '¿Cuántos productos diferentes vendemos?' },
    { id: 79, category: 'Top Productos', question: '¿Qué producto se vende más al cliente X?' },
    { id: 80, category: 'Top Productos', question: '¿Cuáles son los productos menos rentables?' },

    // ========================================
    // 9. VENDEDORES Y EQUIPOS (10)
    // ========================================
    { id: 81, category: 'Vendedores', question: '¿Quién es el vendedor que más vende?' },
    { id: 82, category: 'Vendedores', question: 'Dame el ranking de vendedores del mes' },
    { id: 83, category: 'Vendedores', question: '¿Cómo le va a cada vendedor vs su objetivo?' },
    { id: 84, category: 'Vendedores', question: '¿Qué vendedor tiene más clientes?' },
    { id: 85, category: 'Vendedores', question: '¿Cuántas ventas hizo Juan este mes?' },
    { id: 86, category: 'Vendedores', question: '¿Qué vendedor cierra más rápido las ventas?' },
    { id: 87, category: 'Vendedores', question: '¿Quién tiene el ticket promedio más alto?' },
    { id: 88, category: 'Vendedores', question: '¿Qué vendedor trajo más clientes nuevos?' },
    { id: 89, category: 'Vendedores', question: '¿Cuántos vendedores tenemos activos?' },
    { id: 90, category: 'Vendedores', question: '¿Qué equipo de ventas va mejor?' },

    // ========================================
    // 10. STOCK E INVENTARIO (10)
    // ========================================
    { id: 91, category: 'Stock', question: '¿Qué productos están por agotarse?' },
    { id: 92, category: 'Stock', question: '¿Cuánto stock tenemos del producto X?' },
    { id: 93, category: 'Stock', question: '¿Tenemos productos con sobrestock?' },
    { id: 94, category: 'Stock', question: '¿Cuánto vale nuestro inventario total?' },
    { id: 95, category: 'Stock', question: '¿Qué productos están en negativo?' },
    { id: 96, category: 'Stock', question: '¿Cuál es la rotación de inventario?' },
    { id: 97, category: 'Stock', question: '¿Qué productos tienen stock reservado?' },
    { id: 98, category: 'Stock', question: '¿Cuántos productos distintos tenemos en stock?' },
    { id: 99, category: 'Stock', question: '¿Hay diferencias de inventario?' },
    { id: 100, category: 'Stock', question: '¿Qué productos necesitan reposición?' },

    // ========================================
    // 11. COMPARACIONES TEMPORALES (10)
    // ========================================
    { id: 101, category: 'Comparaciones', question: '¿Vendimos más este mes que el anterior?' },
    { id: 102, category: 'Comparaciones', question: '¿Cómo estamos vs el mismo mes del año pasado?' },
    { id: 103, category: 'Comparaciones', question: '¿Subieron o bajaron las ventas este trimestre?' },
    { id: 104, category: 'Comparaciones', question: '¿Cuánto crecimos respecto al año pasado?' },
    { id: 105, category: 'Comparaciones', question: 'Comparame las ventas de enero vs febrero' },
    { id: 106, category: 'Comparaciones', question: '¿El cliente X nos compra más o menos que antes?' },
    { id: 107, category: 'Comparaciones', question: '¿Mejoró o empeoró la cobranza este mes?' },
    { id: 108, category: 'Comparaciones', question: '¿Qué producto creció más en ventas?' },
    { id: 109, category: 'Comparaciones', question: '¿Cómo evolucionó la deuda en el último año?' },
    { id: 110, category: 'Comparaciones', question: '¿Qué vendedor mejoró más su rendimiento?' },

    // ========================================
    // 12. TENDENCIAS (10)
    // ========================================
    { id: 111, category: 'Tendencias', question: '¿Las ventas están subiendo o bajando?' },
    { id: 112, category: 'Tendencias', question: '¿Cuál es la tendencia de facturación este año?' },
    { id: 113, category: 'Tendencias', question: '¿Estamos ganando o perdiendo clientes?' },
    { id: 114, category: 'Tendencias', question: '¿El ticket promedio está subiendo?' },
    { id: 115, category: 'Tendencias', question: '¿Cómo viene la evolución de la deuda?' },
    { id: 116, category: 'Tendencias', question: '¿Qué productos están en alza?' },
    { id: 117, category: 'Tendencias', question: '¿Hay estacionalidad en nuestras ventas?' },
    { id: 118, category: 'Tendencias', question: '¿En qué época del año vendemos más?' },
    { id: 119, category: 'Tendencias', question: '¿Cómo viene el año comparado con el anterior?' },
    { id: 120, category: 'Tendencias', question: '¿Qué categoría de productos está creciendo?' },

    // ========================================
    // 13. USUARIOS Y ACTIVIDAD (10)
    // ========================================
    { id: 121, category: 'Usuarios', question: '¿Qué usuarios se conectaron hoy?' },
    { id: 122, category: 'Usuarios', question: '¿Quién fue el último en conectarse?' },
    { id: 123, category: 'Usuarios', question: '¿Hay usuarios que no se conectan hace mucho?' },
    { id: 124, category: 'Usuarios', question: '¿Qué usuario tiene más actividad?' },
    { id: 125, category: 'Usuarios', question: '¿Cuántos usuarios activos tenemos?' },
    { id: 126, category: 'Usuarios', question: '¿Quién cargó más pedidos esta semana?' },
    { id: 127, category: 'Usuarios', question: '¿Qué usuarios se conectaron en abril?' },
    { id: 128, category: 'Usuarios', question: '¿Hay usuarios sin actividad en 30 días?' },
    { id: 129, category: 'Usuarios', question: '¿Quién creó el último pedido?' },
    { id: 130, category: 'Usuarios', question: '¿Qué usuario modificó el cliente X?' },

    // ========================================
    // 14. CRM Y OPORTUNIDADES (10)
    // ========================================
    { id: 131, category: 'CRM', question: '¿Cuántas oportunidades tenemos abiertas?' },
    { id: 132, category: 'CRM', question: '¿Cuánto dinero hay en el pipeline?' },
    { id: 133, category: 'CRM', question: '¿Qué oportunidades están por cerrar?' },
    { id: 134, category: 'CRM', question: '¿Cuántas oportunidades ganamos este mes?' },
    { id: 135, category: 'CRM', question: '¿Cuántas oportunidades perdimos?' },
    { id: 136, category: 'CRM', question: '¿Cuál es la tasa de conversión?' },
    { id: 137, category: 'CRM', question: '¿Qué vendedor tiene más oportunidades?' },
    { id: 138, category: 'CRM', question: '¿Cuánto tiempo promedio tarda en cerrar una venta?' },
    { id: 139, category: 'CRM', question: '¿Hay oportunidades estancadas?' },
    { id: 140, category: 'CRM', question: '¿De dónde vienen la mayoría de los leads?' },

    // ========================================
    // 15. ÚLTIMA ACTIVIDAD (10)
    // ========================================
    { id: 141, category: 'Última Actividad', question: '¿Cuándo fue la última compra del cliente X?' },
    { id: 142, category: 'Última Actividad', question: '¿Cuándo fue la última venta del producto Y?' },
    { id: 143, category: 'Última Actividad', question: '¿Cuál fue la última factura que hicimos?' },
    { id: 144, category: 'Última Actividad', question: '¿Cuándo fue el último pago que recibimos?' },
    { id: 145, category: 'Última Actividad', question: '¿Cuál fue el último pedido del día?' },
    { id: 146, category: 'Última Actividad', question: '¿Cuándo actualizamos los precios por última vez?' },
    { id: 147, category: 'Última Actividad', question: '¿Cuál fue la última compra a proveedores?' },
    { id: 148, category: 'Última Actividad', question: '¿Cuándo fue la última entrega?' },
    { id: 149, category: 'Última Actividad', question: '¿Hasta cuándo tenemos ventas cargadas?' },
    { id: 150, category: 'Última Actividad', question: '¿Cuál fue la última devolución?' },

    // ========================================
    // 16. CONTABILIDAD (10)
    // ========================================
    { id: 151, category: 'Contabilidad', question: '¿Cuánto cobramos este mes?' },
    { id: 152, category: 'Contabilidad', question: '¿Cuánto pagamos a proveedores?' },
    { id: 153, category: 'Contabilidad', question: '¿Cuál es el saldo de caja?' },
    { id: 154, category: 'Contabilidad', question: '¿Cuántas notas de crédito emitimos?' },
    { id: 155, category: 'Contabilidad', question: '¿Cuánto fue la facturación total del año?' },
    { id: 156, category: 'Contabilidad', question: '¿Tenemos facturas pendientes de contabilizar?' },
    { id: 157, category: 'Contabilidad', question: '¿Cuántos pagos recibimos hoy?' },
    { id: 158, category: 'Contabilidad', question: '¿Hay diferencias en conciliación bancaria?' },
    { id: 159, category: 'Contabilidad', question: '¿Cuánto es el IVA del mes?' },
    { id: 160, category: 'Contabilidad', question: '¿Cuáles son los gastos del mes?' },

    // ========================================
    // 17. BÚSQUEDAS ESPECÍFICAS (10)
    // ========================================
    { id: 161, category: 'Búsquedas', question: '¿Tenemos un cliente que se llama García?' },
    { id: 162, category: 'Búsquedas', question: 'Buscame el pedido SO12345' },
    { id: 163, category: 'Búsquedas', question: '¿Existe el producto con código ABC123?' },
    { id: 164, category: 'Búsquedas', question: 'Dame los datos del cliente Acme SA' },
    { id: 165, category: 'Búsquedas', question: '¿Tenemos la factura FAC-001234?' },
    { id: 166, category: 'Búsquedas', question: 'Buscame todos los productos que contengan "dental"' },
    { id: 167, category: 'Búsquedas', question: '¿Qué clientes son de Rosario?' },
    { id: 168, category: 'Búsquedas', question: 'Dame el teléfono del cliente X' },
    { id: 169, category: 'Búsquedas', question: '¿Cuál es el email del proveedor Y?' },
    { id: 170, category: 'Búsquedas', question: 'Buscame las facturas del cliente con CUIT 30-12345678-9' },

    // ========================================
    // 18. ALERTAS Y PROBLEMAS (10)
    // ========================================
    { id: 171, category: 'Alertas', question: '¿Hay algún problema que deba atender urgente?' },
    { id: 172, category: 'Alertas', question: '¿Tenemos pedidos con problemas?' },
    { id: 173, category: 'Alertas', question: '¿Hay clientes que necesitan atención?' },
    { id: 174, category: 'Alertas', question: '¿Hay facturas con errores?' },
    { id: 175, category: 'Alertas', question: '¿Tenemos productos con stock crítico?' },
    { id: 176, category: 'Alertas', question: '¿Hay pagos rechazados?' },
    { id: 177, category: 'Alertas', question: '¿Tenemos entregas demoradas?' },
    { id: 178, category: 'Alertas', question: '¿Hay presupuestos por vencer?' },
    { id: 179, category: 'Alertas', question: '¿Tenemos tareas pendientes vencidas?' },
    { id: 180, category: 'Alertas', question: '¿Hay algo fuera de lo normal hoy?' },

    // ========================================
    // 19. RESÚMENES GENERALES (10)
    // ========================================
    { id: 181, category: 'Resúmenes', question: 'Dame un resumen del día de hoy' },
    { id: 182, category: 'Resúmenes', question: '¿Cómo estuvo la semana?' },
    { id: 183, category: 'Resúmenes', question: 'Dame un resumen del mes' },
    { id: 184, category: 'Resúmenes', question: '¿Cómo viene el año?' },
    { id: 185, category: 'Resúmenes', question: 'Dame las métricas principales del negocio' },
    { id: 186, category: 'Resúmenes', question: '¿Cuál es el estado general de la empresa?' },
    { id: 187, category: 'Resúmenes', question: 'Dame un dashboard rápido' },
    { id: 188, category: 'Resúmenes', question: '¿Qué pasó de importante esta semana?' },
    { id: 189, category: 'Resúmenes', question: 'Haceme un cierre del mes' },
    { id: 190, category: 'Resúmenes', question: '¿Cómo estamos en general?' },

    // ========================================
    // 20. PREGUNTAS COMPLEJAS / MULTI-PASO (10)
    // ========================================
    { id: 191, category: 'Complejas', question: '¿Los clientes que más compran son los que mejor pagan?' },
    { id: 192, category: 'Complejas', question: '¿Qué productos compran los clientes que dejaron de comprar?' },
    { id: 193, category: 'Complejas', question: '¿Los productos más vendidos son los más rentables?' },
    { id: 194, category: 'Complejas', question: '¿Qué vendedor tiene mejor ratio de cobranza?' },
    { id: 195, category: 'Complejas', question: '¿Los clientes nuevos compran más que los viejos?' },
    { id: 196, category: 'Complejas', question: '¿Qué proveedor tiene mejor relación precio-calidad?' },
    { id: 197, category: 'Complejas', question: '¿Conviene hacer promoción del producto X?' },
    { id: 198, category: 'Complejas', question: '¿Deberíamos expandir la línea de productos Y?' },
    { id: 199, category: 'Complejas', question: '¿Estamos dependiendo mucho de pocos clientes?' },
    { id: 200, category: 'Complejas', question: '¿Cuál es nuestro cliente ideal según los datos?' },
]

// Helper para obtener categorías únicas
export const CATEGORIES = [...new Set(USER_QUESTIONS.map(q => q.category))]

// Helper para obtener preguntas por categoría
export function getQuestionsByCategory(category: string): UserQuestion[] {
    return USER_QUESTIONS.filter(q => q.category === category)
}

// Helper para obtener una pregunta aleatoria
export function getRandomQuestion(): UserQuestion {
    return USER_QUESTIONS[Math.floor(Math.random() * USER_QUESTIONS.length)]
}

// Helper para obtener N preguntas aleatorias
export function getRandomQuestions(n: number): UserQuestion[] {
    const shuffled = [...USER_QUESTIONS].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, n)
}
