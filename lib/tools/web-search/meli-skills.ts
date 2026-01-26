/**
 * MercadoLibre Skills for Web Search Tool
 *
 * Funciones especializadas que el tool web_search usa internamente
 * cuando detecta búsquedas de MercadoLibre.
 *
 * Estas NO son skills del registry global - son helpers específicos del tool.
 */

import { MLLinkValidator } from '@/lib/mercadolibre/link-validator';
import { MLCache } from '@/lib/mercadolibre/cache';

// ============================================
// TYPES
// ============================================

export interface MeliProduct {
  id: string | null;
  title: string;
  url: string;
  snippet: string;
  price: number | null;
  priceFormatted: string | null;
}

export interface MeliSearchResult {
  products: MeliProduct[];
  query: string;
  method: 'serper' | 'grounding' | 'hybrid';
  cacheHit: boolean;
}

export interface MeliPriceAnalysis {
  query: string;
  analysis: string;
  minPrice: number | null;
  maxPrice: number | null;
  avgPrice: number | null;
  products: MeliProduct[];
}

// ============================================
// PRICE PARSING
// ============================================

/**
 * Extrae precio de un string
 * Formatos: "$ 123.456", "$123456", "ARS 123.456", "1.234.567"
 */
export function parsePrice(text: string): number | null {
  if (!text) return null;

  // Remove currency symbols and normalize
  const normalized = text
    .replace(/ARS|USD|\$|,/gi, '')
    .replace(/\s+/g, '')
    .trim();

  // Pattern for Argentine prices (123.456.789 or 123456789)
  const match = normalized.match(/(\d{1,3}(?:\.\d{3})*|\d+)/);
  if (!match) return null;

  // Remove dots (thousands separator in Argentina)
  const priceStr = match[1].replace(/\./g, '');
  const price = parseInt(priceStr, 10);

  return isNaN(price) ? null : price;
}

/**
 * Busca precio en snippet o título
 */
export function extractPriceFromText(text: string): number | null {
  const patterns = [
    /\$\s*([\d.]+)/,                    // $ 123.456
    /([\d.]+)\s*pesos/i,                // 123.456 pesos
    /ARS\s*([\d.]+)/i,                  // ARS 123.456
    /precio[:\s]*([\d.]+)/i,            // precio: 123.456
    /desde\s*\$?\s*([\d.]+)/i,          // desde $ 123.456
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const price = parsePrice(match[1] || match[0]);
      if (price && price > 1000) return price; // Filter out non-prices
    }
  }

  return null;
}

/**
 * Formatea precio en pesos argentinos
 */
export function formatPrice(price: number | null): string | null {
  if (price === null) return null;
  return `$ ${price.toLocaleString('es-AR')}`;
}

// ============================================
// SERPER SEARCH SKILL
// ============================================

/**
 * Skill: Buscar productos en MercadoLibre con Serper
 *
 * Serper es mejor que Tavily para MercadoLibre porque:
 * - Permite búsquedas site: precisas
 * - Devuelve URLs de /articulo/ (productos) no /listado/ (categorías)
 * - Detecta precios automáticamente en algunos casos
 */
export async function searchMeliWithSerper(
  query: string,
  options: {
    maxResults?: number;
    useCache?: boolean;
  } = {}
): Promise<MeliSearchResult> {
  const { maxResults = 5, useCache = true } = options;

  // Check cache
  const cacheKey = `meli:serper:${query}`;
  if (useCache) {
    const cached = MLCache.get<MeliSearchResult>(cacheKey);
    if (cached) {
      console.log('[MeliSkill/Serper] Cache HIT:', query);
      return { ...cached, cacheHit: true };
    }
  }

  const SERPER_API_KEY = process.env.SERPER_API_KEY;
  if (!SERPER_API_KEY) {
    throw new Error('SERPER_API_KEY no configurada');
  }

  // Query optimizada para productos directos (no listados)
  const searchQuery = `${query} site:articulo.mercadolibre.com.ar OR site:mercadolibre.com.ar/p/`;

  console.log('[MeliSkill/Serper] Searching:', searchQuery);

  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': SERPER_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: searchQuery,
      num: maxResults,
      gl: 'ar',
      hl: 'es',
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Serper error (${res.status}): ${error}`);
  }

  const data = await res.json();
  const organic = data.organic || [];

  console.log('[MeliSkill/Serper] Found', organic.length, 'results');

  // Parse and filter valid product URLs
  const products: MeliProduct[] = organic
    .filter((r: any) => MLLinkValidator.isProductURL(r.link))
    .map((r: any) => {
      const price = extractPriceFromText(r.snippet || r.title || '');
      return {
        id: MLLinkValidator.extractProductId(r.link),
        title: r.title,
        url: r.link,
        snippet: r.snippet || '',
        price,
        priceFormatted: formatPrice(price),
      };
    });

  const result: MeliSearchResult = {
    products,
    query,
    method: 'serper',
    cacheHit: false,
  };

  // Cache result
  if (useCache && products.length > 0) {
    MLCache.set(cacheKey, result);
  }

  return result;
}

// ============================================
// GROUNDING ANALYSIS SKILL
// ============================================

/**
 * Skill: Analizar precios de MercadoLibre con Google Grounding
 *
 * Grounding es mejor para:
 * - Comparar y resumir precios
 * - Dar contexto sobre el mercado
 * - Responder preguntas complejas sobre productos
 */
export async function analyzeMeliPricesWithGrounding(
  query: string,
  options: {
    maxResults?: number;
  } = {}
): Promise<MeliPriceAnalysis> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');

  const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!GEMINI_API_KEY) {
    throw new Error('GOOGLE_GENERATIVE_AI_API_KEY no configurada');
  }

  console.log('[MeliSkill/Grounding] Analyzing:', query);

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    tools: [{ googleSearch: {} } as any],
  });

  const prompt = `Buscá precios de "${query}" en MercadoLibre Argentina.

Respondé con:
1. Rango de precios encontrado (mínimo y máximo)
2. Precio promedio aproximado
3. Factores que afectan el precio (nuevo/usado, vendedor, etc)
4. Recomendación de compra

Usá datos actuales de MercadoLibre Argentina (mercadolibre.com.ar).
Respondé en español argentino, sé conciso.`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();

  // Try to extract prices from the analysis
  const prices: number[] = [];
  const priceMatches = text.matchAll(/\$\s*([\d.]+)/g);
  for (const match of priceMatches) {
    const price = parsePrice(match[1]);
    if (price && price > 1000) prices.push(price);
  }

  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;
  const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;

  return {
    query,
    analysis: text,
    minPrice,
    maxPrice,
    avgPrice,
    products: [], // Grounding doesn't return structured products
  };
}

// ============================================
// HYBRID SEARCH SKILL
// ============================================

/**
 * Skill: Búsqueda híbrida (Serper + Grounding)
 *
 * Combina lo mejor de ambos:
 * - Serper: URLs precisas de productos
 * - Grounding: Análisis y contexto de precios
 */
export async function searchMeliHybrid(
  query: string,
  options: {
    maxResults?: number;
    useCache?: boolean;
  } = {}
): Promise<{
  products: MeliProduct[];
  analysis: string;
  method: 'hybrid';
}> {
  const { maxResults = 5, useCache = true } = options;

  console.log('[MeliSkill/Hybrid] Starting hybrid search for:', query);

  // Run both in parallel
  const [serperResult, groundingResult] = await Promise.all([
    searchMeliWithSerper(query, { maxResults, useCache }),
    analyzeMeliPricesWithGrounding(query).catch((err) => {
      console.error('[MeliSkill/Hybrid] Grounding failed:', err.message);
      return null;
    }),
  ]);

  // Combine results
  const products = serperResult.products;
  const analysis = groundingResult?.analysis || '';

  // Enrich products with prices from Grounding if missing
  if (groundingResult && products.some((p) => p.price === null)) {
    // Try to extract more prices from Grounding analysis
    // This is a best-effort enrichment
  }

  return {
    products,
    analysis,
    method: 'hybrid',
  };
}

// ============================================
// PRICE COMPARISON SKILL
// ============================================

/**
 * Skill: Comparar precios de un producto
 *
 * Útil cuando el usuario pregunta "estoy caro?" o "cuánto debería costar?"
 */
export async function compareMeliPrices(
  productName: string,
  userPrice?: number
): Promise<{
  productName: string;
  marketPrices: {
    min: number | null;
    max: number | null;
    avg: number | null;
  };
  userPriceAnalysis: string | null;
  recommendation: string;
}> {
  const searchResult = await searchMeliWithSerper(productName, { maxResults: 10 });

  const prices = searchResult.products
    .map((p) => p.price)
    .filter((p): p is number => p !== null);

  const min = prices.length > 0 ? Math.min(...prices) : null;
  const max = prices.length > 0 ? Math.max(...prices) : null;
  const avg = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;

  let userPriceAnalysis: string | null = null;
  let recommendation = '';

  if (userPrice && avg) {
    const diff = ((userPrice - avg) / avg) * 100;
    if (diff > 20) {
      userPriceAnalysis = `Tu precio (${formatPrice(userPrice)}) está ${Math.round(diff)}% arriba del promedio.`;
      recommendation = 'Estás caro. Considerá bajar el precio para ser más competitivo.';
    } else if (diff > 5) {
      userPriceAnalysis = `Tu precio está ${Math.round(diff)}% arriba del promedio.`;
      recommendation = 'Estás en el rango alto. Es aceptable si tu producto tiene diferenciadores.';
    } else if (diff > -5) {
      userPriceAnalysis = `Tu precio está alineado con el mercado.`;
      recommendation = 'Buen precio, competitivo.';
    } else {
      userPriceAnalysis = `Tu precio está ${Math.abs(Math.round(diff))}% abajo del promedio.`;
      recommendation = 'Estás barato. Podrías subir el precio sin perder competitividad.';
    }
  } else if (prices.length === 0) {
    recommendation = 'No encontré suficientes precios para comparar. Probá con términos más específicos.';
  } else {
    recommendation = `El precio promedio en MercadoLibre es ${formatPrice(avg)}. Rango: ${formatPrice(min)} - ${formatPrice(max)}.`;
  }

  return {
    productName,
    marketPrices: { min, max, avg },
    userPriceAnalysis,
    recommendation,
  };
}

// ============================================
// EXPORTS
// ============================================

export const MeliSkills = {
  search: searchMeliWithSerper,
  analyze: analyzeMeliPricesWithGrounding,
  hybrid: searchMeliHybrid,
  compare: compareMeliPrices,
  parsePrice,
  formatPrice,
};
