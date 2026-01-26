/**
 * ThinkingIndicator Component
 *
 * Muestra mensajes dinámicos mientras Tuqui está pensando/generando,
 * al estilo de Claude Code pero en español.
 *
 * Características:
 * - Símbolo que cambia cada 2 segundos
 * - Mensaje que cambia cada 2 segundos
 * - Animación suave de entrada/salida
 */

'use client'

import { useEffect, useState } from 'react'

interface ThinkingPhrase {
  symbol: string
  message: string
}

const THINKING_PHRASES: ThinkingPhrase[] = [
  { symbol: '🤔', message: 'pensando...' },
  { symbol: '✨', message: 'reflexionando...' },
  { symbol: '💭', message: 'analizando...' },
  { symbol: '🔍', message: 'explorando...' },
  { symbol: '⚡', message: 'procesando...' },
  { symbol: '🎯', message: 'enfocándome...' },
  { symbol: '🧠', message: 'razonando...' },
  { symbol: '💡', message: 'ideando...' },
  { symbol: '🌟', message: 'considerando...' },
  { symbol: '🔮', message: 'evaluando...' },
  { symbol: '📊', message: 'calculando...' },
  { symbol: '🎨', message: 'componiendo...' },
  { symbol: '⚙️', message: 'configurando...' },
  { symbol: '🚀', message: 'preparando...' },
  { symbol: '🌊', message: 'fluyendo...' },
]

export function ThinkingIndicator() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      // Fade out
      setIsVisible(false)

      // Change phrase after fade out (300ms)
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % THINKING_PHRASES.length)
        setIsVisible(true)
      }, 300)
    }, 2000) // Cambia cada 2 segundos

    return () => clearInterval(interval)
  }, [])

  const { symbol, message } = THINKING_PHRASES[currentIndex]

  return (
    <div className="flex gap-2 items-center text-gray-400 text-sm ml-12">
      <span
        className={`
          text-base
          transition-opacity duration-300
          ${isVisible ? 'opacity-100' : 'opacity-0'}
        `}
      >
        {symbol}
      </span>
      <span
        className={`
          transition-opacity duration-300
          ${isVisible ? 'opacity-100' : 'opacity-0'}
        `}
      >
        {message}
      </span>
    </div>
  )
}
