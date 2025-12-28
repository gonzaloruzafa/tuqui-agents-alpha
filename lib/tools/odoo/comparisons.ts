/**
 * Odoo Comparisons - Temporal comparison utilities
 * Supports month-over-month (MoM) and year-over-year (YoY) comparisons
 */

// ============================================
// TYPES
// ============================================

export interface DatePeriod {
    start: string  // YYYY-MM-DD
    end: string    // YYYY-MM-DD
    label: string  // Human readable label
}

export interface ComparisonPeriods {
    current: DatePeriod
    previous: DatePeriod
    type: 'mom' | 'yoy'
}

export interface Variation {
    value: number      // Absolute difference (current - previous)
    percent: number    // Percentage change
    trend: '📈' | '📉' | '➡️'  // Visual indicator
    label: string      // Human readable description
}

export interface ComparisonResult<T = any> {
    current: T
    previous: T
    variation: Variation
}

export interface DecreasingItem {
    name: string
    currentValue: number
    previousValue: number
    variation: Variation
}

// ============================================
// PERIOD GENERATORS
// ============================================

/**
 * Get comparison periods based on a reference date and comparison type
 */
export function getComparisonPeriods(
    baseDate: Date = new Date(),
    type: 'mom' | 'yoy' = 'mom'
): ComparisonPeriods {
    const year = baseDate.getFullYear()
    const month = baseDate.getMonth() + 1
    
    let current: DatePeriod
    let previous: DatePeriod
    
    if (type === 'mom') {
        // Month-over-month: current month vs previous month
        const currentStart = `${year}-${String(month).padStart(2, '0')}-01`
        const currentEndDay = new Date(year, month, 0).getDate()
        const currentEnd = `${year}-${String(month).padStart(2, '0')}-${currentEndDay}`
        
        const prevMonth = month === 1 ? 12 : month - 1
        const prevYear = month === 1 ? year - 1 : year
        const prevStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`
        const prevEndDay = new Date(prevYear, prevMonth, 0).getDate()
        const prevEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${prevEndDay}`
        
        const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
        
        current = { start: currentStart, end: currentEnd, label: `${monthNames[month]} ${year}` }
        previous = { start: prevStart, end: prevEnd, label: `${monthNames[prevMonth]} ${prevYear}` }
    } else {
        // Year-over-year: same month this year vs same month last year
        const currentStart = `${year}-${String(month).padStart(2, '0')}-01`
        const currentEndDay = new Date(year, month, 0).getDate()
        const currentEnd = `${year}-${String(month).padStart(2, '0')}-${currentEndDay}`
        
        const prevYear = year - 1
        const prevStart = `${prevYear}-${String(month).padStart(2, '0')}-01`
        const prevEndDay = new Date(prevYear, month, 0).getDate()
        const prevEnd = `${prevYear}-${String(month).padStart(2, '0')}-${prevEndDay}`
        
        const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
        
        current = { start: currentStart, end: currentEnd, label: `${monthNames[month]} ${year}` }
        previous = { start: prevStart, end: prevEnd, label: `${monthNames[month]} ${prevYear}` }
    }
    
    return { current, previous, type }
}

/**
 * Get domain filters for a specific period
 */
export function getPeriodDomain(period: DatePeriod, dateField: string): any[] {
    return [
        [dateField, '>=', period.start],
        [dateField, '<=', period.end]
    ]
}

// ============================================
// VARIATION CALCULATIONS
// ============================================

/**
 * Calculate variation between current and previous values
 */
export function calculateVariation(current: number, previous: number): Variation {
    const value = current - previous
    const percent = previous !== 0 ? ((current - previous) / previous) * 100 : (current > 0 ? 100 : 0)
    
    let trend: '📈' | '📉' | '➡️'
    if (Math.abs(percent) < 1) {
        trend = '➡️'
    } else if (percent > 0) {
        trend = '📈'
    } else {
        trend = '📉'
    }
    
    const absPercent = Math.abs(percent).toFixed(1)
    let label: string
    
    if (Math.abs(percent) < 1) {
        label = 'sin cambios significativos'
    } else if (percent > 0) {
        label = `subió ${absPercent}%`
    } else {
        label = `bajó ${absPercent}%`
    }
    
    return { value, percent, trend, label }
}

/**
 * Compare two grouped datasets and return variation per group
 */
export function compareGroupedData(
    currentData: Record<string, { count: number; total: number }>,
    previousData: Record<string, { count: number; total: number }>
): Record<string, ComparisonResult<{ count: number; total: number }>> {
    const result: Record<string, ComparisonResult<{ count: number; total: number }>> = {}
    
    // Get all unique keys
    const allKeys = new Set([...Object.keys(currentData), ...Object.keys(previousData)])
    
    for (const key of allKeys) {
        const current = currentData[key] || { count: 0, total: 0 }
        const previous = previousData[key] || { count: 0, total: 0 }
        
        result[key] = {
            current,
            previous,
            variation: calculateVariation(current.total, previous.total)
        }
    }
    
    return result
}

// ============================================
// DECREASING DETECTION
// ============================================

/**
 * Detect items that have decreased by more than a threshold
 * Useful for finding "clientes que están comprando menos"
 */
export function detectDecreasing(
    currentData: Record<string, { count: number; total: number }>,
    previousData: Record<string, { count: number; total: number }>,
    threshold: number = 20  // Default: 20% decrease
): DecreasingItem[] {
    const decreasing: DecreasingItem[] = []
    
    for (const [name, previous] of Object.entries(previousData)) {
        const current = currentData[name] || { count: 0, total: 0 }
        
        // Only consider items that had activity in the previous period
        if (previous.total > 0) {
            const variation = calculateVariation(current.total, previous.total)
            
            // Check if decreased by more than threshold
            if (variation.percent <= -threshold) {
                decreasing.push({
                    name,
                    currentValue: current.total,
                    previousValue: previous.total,
                    variation
                })
            }
        }
    }
    
    // Sort by absolute decrease (most significant first)
    decreasing.sort((a, b) => a.variation.percent - b.variation.percent)
    
    return decreasing
}

/**
 * Detect items that are new (didn't exist in previous period)
 */
export function detectNew(
    currentData: Record<string, { count: number; total: number }>,
    previousData: Record<string, { count: number; total: number }>,
    minValue: number = 0
): Array<{ name: string; value: number }> {
    const newItems: Array<{ name: string; value: number }> = []
    
    for (const [name, current] of Object.entries(currentData)) {
        if (!previousData[name] && current.total > minValue) {
            newItems.push({ name, value: current.total })
        }
    }
    
    // Sort by value descending
    newItems.sort((a, b) => b.value - a.value)
    
    return newItems
}

/**
 * Detect items that disappeared (existed in previous but not in current)
 */
export function detectLost(
    currentData: Record<string, { count: number; total: number }>,
    previousData: Record<string, { count: number; total: number }>,
    minValue: number = 0
): Array<{ name: string; previousValue: number }> {
    const lostItems: Array<{ name: string; previousValue: number }> = []
    
    for (const [name, previous] of Object.entries(previousData)) {
        const current = currentData[name]
        if ((!current || current.total === 0) && previous.total > minValue) {
            lostItems.push({ name, previousValue: previous.total })
        }
    }
    
    // Sort by previous value descending (biggest losses first)
    lostItems.sort((a, b) => b.previousValue - a.previousValue)
    
    return lostItems
}

// ============================================
// TREND ANALYSIS
// ============================================

/**
 * Analyze overall trend from comparison data
 */
export function analyzeTrend(
    comparison: Record<string, ComparisonResult<{ count: number; total: number }>>
): {
    totalCurrent: number
    totalPrevious: number
    overallVariation: Variation
    growingCount: number
    decliningCount: number
    stableCount: number
} {
    let totalCurrent = 0
    let totalPrevious = 0
    let growingCount = 0
    let decliningCount = 0
    let stableCount = 0
    
    for (const item of Object.values(comparison)) {
        totalCurrent += item.current.total
        totalPrevious += item.previous.total
        
        if (item.variation.percent > 5) {
            growingCount++
        } else if (item.variation.percent < -5) {
            decliningCount++
        } else {
            stableCount++
        }
    }
    
    return {
        totalCurrent,
        totalPrevious,
        overallVariation: calculateVariation(totalCurrent, totalPrevious),
        growingCount,
        decliningCount,
        stableCount
    }
}
