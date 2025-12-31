import { useState, useCallback, useRef, useEffect } from 'react'

export type VoiceSessionStatus =
    | 'idle'
    | 'listening'
    | 'processing'
    | 'speaking'
    | 'error'

interface UseVoiceSessionReturn {
    status: VoiceSessionStatus
    transcript: string
    error: string | null
    isSupported: boolean
    startListening: (onFinalTranscript: (text: string) => void) => void
    stopListening: () => void
    speak: (text: string, onEnd?: () => void) => void
    stopSpeaking: () => void
    clearError: () => void
}

const SILENCE_TIMEOUT = 500 // Reduced for faster response, was 800
const MIN_TRANSCRIPT_LENGTH = 2

export function useVoiceSession(language: string = 'es-AR'): UseVoiceSessionReturn {
    const [status, setStatus] = useState<VoiceSessionStatus>('idle')
    const [transcript, setTranscript] = useState('')
    const [error, setError] = useState<string | null>(null)

    const recognitionRef = useRef<any>(null)
    const callbackRef = useRef<((text: string) => void) | null>(null)
    const accumulatedTranscriptRef = useRef<string>('')
    const silenceTimeoutRef = useRef<number | null>(null)
    const isProcessingRef = useRef<boolean>(false)

    const isSupported = typeof window !== 'undefined' &&
        ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) &&
        'speechSynthesis' in window

    const clearSilenceTimeout = useCallback(() => {
        if (silenceTimeoutRef.current) {
            window.clearTimeout(silenceTimeoutRef.current)
            silenceTimeoutRef.current = null
        }
    }, [])

    const clearError = useCallback(() => {
        setError(null)
        setStatus('idle')
    }, [])

    const processTranscript = useCallback(() => {
        const text = accumulatedTranscriptRef.current.trim()
        console.log('[Voice] processTranscript called, text length:', text.length, 'isProcessing:', isProcessingRef.current)
        if (text.length >= MIN_TRANSCRIPT_LENGTH && callbackRef.current && !isProcessingRef.current) {
            isProcessingRef.current = true
            setStatus('processing')
            if (recognitionRef.current) {
                console.log('[Voice] Aborting recognition before callback')
                try {
                    recognitionRef.current.abort()
                } catch (e) {
                    console.warn('[Voice] Abort failed:', e)
                }
                recognitionRef.current = null
            }
            const cb = callbackRef.current
            callbackRef.current = null
            accumulatedTranscriptRef.current = ''
            cb(text)
        }
    }, [])

    const resetSilenceTimeout = useCallback(() => {
        clearSilenceTimeout()
        silenceTimeoutRef.current = window.setTimeout(() => {
            processTranscript()
        }, SILENCE_TIMEOUT)
    }, [clearSilenceTimeout, processTranscript])

    const startListening = useCallback((onFinalTranscript: (text: string) => void) => {
        if (!isSupported) {
            setError('El reconocimiento de voz no está disponible.')
            setStatus('error')
            return
        }

        if (window.speechSynthesis.speaking) window.speechSynthesis.cancel()

        setTranscript('')
        setError(null)
        accumulatedTranscriptRef.current = ''
        callbackRef.current = onFinalTranscript
        isProcessingRef.current = false
        clearSilenceTimeout()

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        const recognition = new SpeechRecognition()

        // On mobile, continuous mode causes severe duplication issues
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
        recognition.continuous = !isMobile // false on mobile, true on desktop
        recognition.interimResults = true
        recognition.lang = language
        console.log('[Voice] SpeechRecognition config - mobile:', isMobile, 'continuous:', recognition.continuous)

        recognition.onstart = () => {
            console.log('[Voice] recognition.onstart fired')
            setStatus('listening')
            setError(null)
        }

        recognition.onresult = (event: any) => {
            // Build the full transcript from ALL results, not incrementally
            // This avoids duplication issues on mobile where resultIndex can be inconsistent
            let fullTranscript = ''
            let currentInterim = ''

            for (let i = 0; i < event.results.length; i++) {
                const result = event.results[i]
                if (result.isFinal) {
                    fullTranscript += result[0].transcript + ' '
                } else {
                    currentInterim += result[0].transcript
                }
            }

            fullTranscript = fullTranscript.trim()
            accumulatedTranscriptRef.current = fullTranscript

            // Display: final + interim
            setTranscript((fullTranscript + ' ' + currentInterim).trim())
            resetSilenceTimeout()
        }

        recognition.onerror = (event: any) => {
            console.error('[Voice] recognition.onerror:', event.error, 'message:', event.message)
            clearSilenceTimeout()

            // Log detailed error for debugging
            const errorName = event.error
            console.error('[Voice] Error details - name:', errorName, 'type:', event.type)

            if (['aborted', 'no-speech'].includes(event.error)) {
                console.log('[Voice] Recoverable error, checking transcript')
                if (accumulatedTranscriptRef.current.trim().length >= MIN_TRANSCRIPT_LENGTH) processTranscript()
                else setStatus('idle')
                return
            }

            // Provide detailed error messages
            let errorMsg = `Error: ${event.error}`
            if (event.error === 'not-allowed') {
                errorMsg = 'not-allowed: El navegador bloqueó el acceso al micrófono. Revisá los permisos del sitio.'
            } else if (event.error === 'network') {
                errorMsg = 'network: Error de red. Verificá tu conexión.'
            } else if (event.error === 'audio-capture') {
                errorMsg = 'audio-capture: No se pudo acceder al micrófono. ¿Está siendo usado por otra app?'
            } else if (event.error === 'service-not-allowed') {
                errorMsg = 'service-not-allowed: El servicio de voz no está disponible.'
            }

            setError(errorMsg)
            setStatus('error')
        }

        recognition.onend = () => {
            console.log('[Voice] recognition.onend - status:', status, 'isProcessing:', isProcessingRef.current)
            if (!isProcessingRef.current && status === 'listening') {
                if (accumulatedTranscriptRef.current.trim().length >= MIN_TRANSCRIPT_LENGTH) processTranscript()
                else setStatus('idle')
            }
        }

        recognitionRef.current = recognition

        // On mobile, we need to request getUserMedia FIRST to trigger the permission prompt
        // SpeechRecognition alone often fails silently on mobile
        console.log('[Voice] Requesting mic permission via getUserMedia first...')

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then((stream) => {
                console.log('[Voice] getUserMedia succeeded, stopping stream and starting recognition')
                // Immediately stop the stream - we just needed it to trigger the permission
                stream.getTracks().forEach(track => {
                    console.log('[Voice] Stopping track:', track.kind)
                    track.stop()
                })

                // Now start SpeechRecognition
                try {
                    recognition.start()
                    console.log('[Voice] recognition.start() succeeded')
                } catch (err: any) {
                    console.error('[Voice] recognition.start() failed:', err.name, err.message)
                    setError(`[START_ERR] ${err.name}: ${err.message}`)
                    setStatus('error')
                }
            })
            .catch((err) => {
                console.error('[Voice] getUserMedia failed:', err.name, err.message)
                let msg = `[MIC_ERR] ${err.name}: ${err.message}`
                if (err.name === 'NotAllowedError') {
                    msg = `[NotAllowedError] Mic bloqueado. Ve a Ajustes del sitio > Micrófono > Permitir. (${err.message})`
                } else if (err.name === 'NotFoundError') {
                    msg = `[NotFoundError] No se encontró micrófono. ¿Está conectado? (${err.message})`
                } else if (err.name === 'NotReadableError') {
                    msg = `[NotReadableError] Micrófono ocupado por otra app. (${err.message})`
                }
                setError(msg)
                setStatus('error')
            })
    }, [isSupported, language, clearSilenceTimeout, resetSilenceTimeout, processTranscript, status])

    const stopListening = useCallback(() => {
        console.log('[Voice] stopListening called')
        clearSilenceTimeout()
        callbackRef.current = null
        accumulatedTranscriptRef.current = ''
        isProcessingRef.current = false
        if (recognitionRef.current) {
            console.log('[Voice] Aborting recognition in stopListening')
            try {
                recognitionRef.current.abort()
            } catch (e) {
                console.warn('[Voice] Abort in stopListening failed:', e)
            }
            recognitionRef.current = null
        }
        setStatus('idle')
    }, [clearSilenceTimeout])

    const audioRef = useRef<HTMLAudioElement | null>(null)

    const speak = useCallback(async (text: string, onEnd?: () => void) => {
        setStatus('speaking')
        if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current = null
        }

        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            })

            if (!response.ok) throw new Error('TTS Failed')

            const contentType = response.headers.get('content-type')
            if (contentType?.includes('application/json')) {
                const data = await response.json()
                speakWithWebSpeech(data.text || text, onEnd)
                return
            }

            const audioBlob = await response.blob()
            const audioUrl = URL.createObjectURL(audioBlob)
            const audio = new Audio(audioUrl)
            audioRef.current = audio

            audio.onended = () => {
                URL.revokeObjectURL(audioUrl)
                audioRef.current = null
                setStatus('idle')
                onEnd?.()
            }

            await audio.play()
        } catch (error) {
            speakWithWebSpeech(text, onEnd)
        }
    }, [])

    const speakWithWebSpeech = useCallback((text: string, onEnd?: () => void) => {
        if (!window.speechSynthesis) {
            setStatus('idle')
            onEnd?.()
            return
        }
        window.speechSynthesis.cancel()
        const div = document.createElement('div')
        div.innerHTML = text
        const utterance = new SpeechSynthesisUtterance(div.textContent || div.innerText || '')
        utterance.lang = language
        utterance.onend = () => { setStatus('idle'); onEnd?.() }
        window.speechSynthesis.speak(utterance)
    }, [language])

    const stopSpeaking = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current = null
        }
        window.speechSynthesis?.cancel()
        setStatus('idle')
    }, [])

    return { status, transcript, error, isSupported, startListening, stopListening, speak, stopSpeaking, clearError }
}
