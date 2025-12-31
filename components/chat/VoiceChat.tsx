import { useEffect, useCallback, useRef, useState } from 'react'
import { Mic, MicOff, Volume2, VolumeX, Loader2, X } from 'lucide-react'
import { useVoiceSession, type VoiceSessionStatus } from '@/lib/hooks/useVoiceSession'

interface VoiceChatProps {
    isOpen: boolean
    onClose: () => void
    onAddMessage?: (role: 'user' | 'assistant', content: string) => void
    agentSlug: string
    sessionId: string | null
    systemPrompt: string
    messages: any[]
}

const statusMessages: Record<VoiceSessionStatus, string> = {
    idle: 'Preparando...',
    listening: 'Te escucho, hablá tranquilo...',
    processing: 'Procesando...',
    speaking: 'Respondiendo...',
    error: 'Error'
}

const statusColors: Record<VoiceSessionStatus, string> = {
    idle: 'bg-adhoc-violet',
    listening: 'bg-red-500',
    processing: 'bg-yellow-500',
    speaking: 'bg-green-500',
    error: 'bg-red-600'
}

export function VoiceChat({ isOpen, onClose, onAddMessage, agentSlug, sessionId, systemPrompt, messages }: VoiceChatProps) {
    const hasStartedRef = useRef(false)
    const [displayedText, setDisplayedText] = useState<string>('')
    const typingIntervalRef = useRef<number | null>(null)
    const [debugError, setDebugError] = useState<string | null>(null) // DEBUG: visible error for mobile

    const {
        status,
        transcript,
        error,
        isSupported,
        startListening,
        stopListening,
        speak,
        stopSpeaking,
        clearError
    } = useVoiceSession('es-AR')

    const handleFinalTranscript = useCallback(async (text: string) => {
        onAddMessage?.('user', text)
        setDisplayedText('')

        if (typingIntervalRef.current) {
            window.clearInterval(typingIntervalRef.current)
            typingIntervalRef.current = null
        }

        try {
            // Include message history for context
            const fullMessages = [
                ...messages.map(m => ({ role: m.role, content: m.content })),
                { role: 'user', content: text }
            ]

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentSlug,
                    messages: fullMessages,
                    sessionId,
                    voiceMode: true
                })
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                const errorMsg = `API Error 500: ${errorData.error || 'Unknown'} - ${errorData.details || ''}`
                console.error('[VoiceChat] API Error:', errorMsg, errorData)
                setDebugError(errorMsg)
                throw new Error('API Error')
            }

            const botText = await response.text() // Assume voice mode returns plain text or we handle stream

            onAddMessage?.('assistant', botText)

            const cleanResponse = botText.replace(/<[^>]*>/g, '').trim()
            let charIndex = 0
            typingIntervalRef.current = window.setInterval(() => {
                charIndex++
                if (charIndex <= cleanResponse.length) {
                    setDisplayedText(cleanResponse.substring(0, charIndex))
                } else {
                    if (typingIntervalRef.current) {
                        window.clearInterval(typingIntervalRef.current)
                        typingIntervalRef.current = null
                    }
                }
            }, 50)

            speak(botText, () => {
                setDisplayedText('')
                setTimeout(() => startListening(handleFinalTranscript), 100)
            })
        } catch (err) {
            console.error('[VoiceChat] API error:', err)
            setDisplayedText('Disculpá, hubo un error.')
            setTimeout(() => startListening(handleFinalTranscript), 800)
        }
    }, [speak, startListening, onAddMessage, agentSlug, sessionId, messages])

    useEffect(() => {
        console.log('[VoiceChat] useEffect triggered - isOpen:', isOpen, 'isSupported:', isSupported, 'hasStarted:', hasStartedRef.current)
        if (isOpen && isSupported && !hasStartedRef.current) {
            hasStartedRef.current = true

            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
            console.log('[VoiceChat] isMobile:', isMobile)

            // On mobile, NEVER auto-start
            if (isMobile) {
                console.log('[VoiceChat] Mobile detected, waiting for user tap on mic button.')
                return
            }

            const timer = setTimeout(() => {
                console.log('[VoiceChat] Desktop auto-start timer fired')
                try {
                    startListening(handleFinalTranscript)
                } catch (err) {
                    console.error('[VoiceChat] Auto-start failed:', err)
                }
            }, 300)

            return () => clearTimeout(timer)
        }
        if (!isOpen) {
            console.log('[VoiceChat] Resetting hasStartedRef')
            hasStartedRef.current = false
        }
    }, [isOpen, isSupported, startListening, handleFinalTranscript])

    const handleMicClick = useCallback(() => {
        console.log('[VoiceChat] handleMicClick called - status:', status)

        // Prime the speaker for mobile (needs user gesture)
        if (window.speechSynthesis) {
            console.log('[VoiceChat] Priming speechSynthesis')
            window.speechSynthesis.speak(new SpeechSynthesisUtterance(''))
            window.speechSynthesis.cancel()
        }

        if (status === 'listening') {
            console.log('[VoiceChat] Stopping listening')
            stopListening()
        } else if (status === 'speaking') {
            console.log('[VoiceChat] Stopping speaking, will restart listening')
            stopSpeaking()
            setTimeout(() => startListening(handleFinalTranscript), 300)
        } else {
            console.log('[VoiceChat] Starting to listen (status was:', status, ')')
            clearError()
            setDebugError(null) // Clear debug error on retry
            try {
                startListening(handleFinalTranscript)
            } catch (err: any) {
                const debugMsg = `NAME: ${err?.name || 'unknown'} | MSG: ${err?.message || 'none'} | JSON: ${JSON.stringify(err)}`
                console.error('[VoiceChat] startListening error:', debugMsg)
                setDebugError(debugMsg)
            }
        }
    }, [status, startListening, stopListening, stopSpeaking, clearError, handleFinalTranscript])

    useEffect(() => {
        if (!isOpen) {
            stopListening()
            stopSpeaking()
        }
    }, [isOpen, stopListening, stopSpeaking])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-adhoc-violet/95 backdrop-blur-md flex flex-col items-center justify-center z-[100] animate-in fade-in duration-300">
            {/* DEBUG: Visible error banner for mobile */}
            {(debugError || error) && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    background: 'red',
                    color: 'white',
                    padding: '12px',
                    zIndex: 9999,
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    maxHeight: '150px',
                    overflow: 'auto'
                }}>
                    <strong>DEBUG ERROR:</strong><br />
                    {debugError || error}
                </div>
            )}

            <button onClick={onClose} className="absolute top-6 right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                <X size={24} className="text-white" />
            </button>

            <div className="text-white/80 text-lg mb-8 h-8 flex items-center gap-2 font-medium">
                {status === 'processing' && <Loader2 className="animate-spin" size={20} />}
                {status === 'speaking' && <Volume2 className="animate-pulse" size={20} />}
                {status === 'listening' && <Mic className="animate-pulse text-red-400" size={20} />}
                <span>{statusMessages[status]}</span>
            </div>

            {(transcript && (status === 'listening' || status === 'processing')) && (
                <div className="text-white text-2xl mb-8 max-w-2xl text-center px-6 min-h-[80px] font-medium leading-tight">
                    "{transcript}"{status === 'listening' && <span className="animate-pulse font-light text-white/50">|</span>}
                </div>
            )}

            {(status === 'speaking' && displayedText) && (
                <div className="text-white/90 text-xl mb-8 max-w-2xl text-center px-6 min-h-[80px] leading-relaxed">
                    {displayedText}<span className="animate-pulse">|</span>
                </div>
            )}

            {status === 'idle' && (
                <div className="text-white/60 text-lg mb-8 text-center animate-bounce">
                    Toca el micrófono para empezar
                </div>
            )}

            <div className="relative mb-12">
                {status === 'listening' && (
                    <>
                        <div className="absolute inset-0 rounded-full bg-red-500/30 animate-ping opacity-75" style={{ animationDuration: '1.5s' }} />
                        <div className="absolute inset-[-15px] rounded-full bg-red-500/20 animate-ping opacity-50" style={{ animationDuration: '2s' }} />
                    </>
                )}

                <button
                    onClick={handleMicClick}
                    disabled={status === 'processing'}
                    className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 transform shadow-2xl ${statusColors[status]} ${status === 'listening' ? 'scale-110 shadow-red-500/40' : 'hover:scale-105 active:scale-95'} ${status === 'processing' ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                    {status === 'processing' ? <Loader2 className="text-white animate-spin" size={48} /> :
                        status === 'speaking' ? <VolumeX className="text-white" size={48} /> :
                            status === 'listening' ? <MicOff className="text-white" size={48} /> :
                                <Mic className="text-white" size={48} />}
                </button>
            </div>

            {error && (
                <div className="text-red-400 mb-4 px-6 text-center max-w-sm text-sm bg-black/40 py-4 rounded-2xl backdrop-blur-md border border-red-500/30">
                    <p className="mb-3 leading-relaxed">
                        {error.includes('not-allowed')
                            ? 'Permiso de micrófono denegado. Tocá el icono a la izquierda de la URL (ajustes del sitio) y habilitá el micrófono.'
                            : error}
                    </p>
                    <button
                        onClick={() => { clearError(); startListening(handleFinalTranscript) }}
                        className="p-3 bg-white text-black rounded-xl font-bold uppercase tracking-wider text-xs shadow-lg active:scale-95 transition-transform"
                    >
                        Reintentar
                    </button>
                    {error.includes('not-allowed') && (
                        <p className="mt-4 text-[10px] text-red-300/80 uppercase tracking-widest">
                            Asegurate de estar en HTTPS
                        </p>
                    )}
                </div>
            )}

            <div className="flex gap-2 items-center h-12">
                {status === 'listening' && [...Array(7)].map((_, i) => (
                    <div key={i} className="w-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: `${i * 0.1}s`, height: '20px' }} />
                ))}
            </div>
        </div>
    )
}
