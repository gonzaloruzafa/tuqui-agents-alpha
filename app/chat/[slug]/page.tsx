'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import {
    Send, Loader2, ArrowLeft, ArrowUp,
    Scale, Users, Briefcase, HeadphonesIcon,
    Bot, Brain, Code, Lightbulb, MessageSquare, Sparkles,
    GraduationCap, Heart, ShoppingCart, TrendingUp, Wrench,
    FileText, Calculator, Globe, Shield, Zap, Mail, Copy,
    PanelLeftClose, PanelLeft, Search, Database, Mic, MicOff, Check, X,
    AudioLines, Settings
} from 'lucide-react'
import { marked } from 'marked'
import { VoiceChat } from '@/components/chat/VoiceChat'
import { ThinkingIndicator } from '@/components/chat/ThinkingIndicator'
import { ThinkingStream } from '@/components/chat/ThinkingStream'
import { MessageSources } from '@/components/chat/MessageSources'
import { MeliSkillsRenderer } from '@/components/chat/MeliSkillsRenderer'
import type { ThinkingStep, ThinkingSource } from '@/lib/thinking/types'

// Configure marked to open external links in new tab
const renderer = new marked.Renderer()
const originalLinkRenderer = renderer.link.bind(renderer)
renderer.link = function(link: any) {
    const { href, title, tokens } = link
    const text = this.parser.parseInline(tokens)
    const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'))
    if (isExternal) {
        const titleAttr = title ? ` title="${title}"` : ''
        return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`
    }
    return originalLinkRenderer(link)
}
marked.setOptions({ renderer })

// Helper to wrap tables in scrollable div
function wrapTablesInScrollContainer(html: string): string {
    return html.replace(/<table>/g, '<div class="table-wrapper"><table>')
        .replace(/<\/table>/g, '</table></div>')
}

// Real-time Scrolling Temporal Waveform for Voice Input (Simplified - no getUserMedia conflict)
const AudioVisualizer = ({ isRecording }: { isRecording: boolean }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const animationRef = useRef<number | null>(null)
    const historyRef = useRef<number[]>(new Array(100).fill(0))
    const frameCountRef = useRef(0)

    useEffect(() => {
        if (!isRecording) {
            if (animationRef.current) cancelAnimationFrame(animationRef.current)
            return
        }

        // Simple animated waveform without requesting mic access (avoids permission conflicts)
        const draw = () => {
            if (!canvasRef.current) return
            const canvas = canvasRef.current
            const ctx = canvas.getContext('2d')
            if (!ctx) return

            const width = canvas.width
            const height = canvas.height

            animationRef.current = requestAnimationFrame(draw)

            // Generate animated wave pattern
            frameCountRef.current++
            if (frameCountRef.current % 4 === 0) {
                // Simulate voice activity with random + sine wave
                const t = Date.now() / 1000
                const wave = Math.sin(t * 3) * 0.5 + 0.5
                const randomVariation = Math.random() * 0.3
                const average = (wave * 80 + randomVariation * 40) + 30

                historyRef.current.shift()
                historyRef.current.push(average)
            }

            ctx.clearRect(0, 0, width, height)

            const barWidth = 0.8
            const gap = 2.5
            const totalBarWidth = barWidth + gap
            const barsToDraw = historyRef.current.length

            ctx.fillStyle = '#a78bfa'

            for (let i = 0; i < barsToDraw; i++) {
                const vol = historyRef.current[i]
                const barHeight = Math.max(1, (vol / 160) * height * 0.6)

                const x = i * totalBarWidth
                const y = (height - barHeight) / 2

                ctx.beginPath()
                ctx.roundRect(x, y, barWidth, barHeight, 0.4)
                ctx.fill()
            }
        }

        draw()

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current)
        }
    }, [isRecording])

    return (
        <canvas
            ref={canvasRef}
            width={300}
            height={32}
            className="w-full h-8 opacity-90"
        />
    )
}

/**
 * Wrapper for ThinkingStream in completed messages - has its own toggle state
 */
function CollapsibleThinkingStream({ steps, thinkingText }: { steps: ThinkingStep[], thinkingText?: string }) {
    const [isExpanded, setIsExpanded] = useState(false)
    return (
        <ThinkingStream 
            steps={steps}
            thinkingText={thinkingText}
            isExpanded={isExpanded}
            onToggle={() => setIsExpanded(!isExpanded)}
        />
    )
}

interface TuquiCapability {
    icon: string
    title: string
    description: string
    examples: string[]
}

interface Agent {
    id: string
    name: string
    slug: string
    icon: string
    welcome_message: string
    placeholder_text: string
    system_prompt?: string
    description?: string
    tools: string[]
    rag_enabled: boolean
    capabilities?: TuquiCapability[]
}

interface Message {
    id: string | number
    role: 'user' | 'assistant'
    content: string
    rawContent?: string
    sources?: ThinkingSource[]  // Sources used to generate this message
    thinkingSteps?: ThinkingStep[]  // Tool execution steps for this message
}

interface Session {
    id: string
    title: string
    agent_id: string
}

const getAgentIcon = (iconName: string, size: 'sm' | 'md' | 'lg' = 'sm', colorClass = 'text-white') => {
    const sizeClass = size === 'lg' ? 'w-7 h-7' : size === 'md' ? 'w-5 h-5' : 'w-4 h-4'
    const icons: Record<string, React.ReactNode> = {
        'Scale': <Scale className={`${sizeClass} ${colorClass}`} />,
        'Users': <Users className={`${sizeClass} ${colorClass}`} />,
        'Bot': <Bot className={`${sizeClass} ${colorClass}`} />,
        'ShoppingCart': <ShoppingCart className={`${sizeClass} ${colorClass}`} />,
        'Database': <Database className={`${sizeClass} ${colorClass}`} />,
        'Calculator': <Calculator className={`${sizeClass} ${colorClass}`} />,
        'Building': <Briefcase className={`${sizeClass} ${colorClass}`} />,
        'Sparkles': <Sparkles className={`${sizeClass} ${colorClass}`} />
    }
    return icons[iconName] || <Bot className={`${sizeClass} ${colorClass}`} />
}

export default function ChatPage() {
    const params = useParams()
    const searchParams = useSearchParams()
    const router = useRouter()
    const agentSlug = params.slug as string
    const sessionIdParam = searchParams.get('session')

    const [agent, setAgent] = useState<Agent | null | undefined>(undefined) // undefined = loading, null = not found
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([])
    const [thinkingText, setThinkingText] = useState<string>('') // Chain of Thought text
    const [thinkingExpanded, setThinkingExpanded] = useState(false) // Collapsed by default
    const collectedSourcesRef = useRef<ThinkingSource[]>([]) // Track sources during streaming
    const collectedStepsRef = useRef<ThinkingStep[]>([]) // Track steps during streaming (ref for capturing)
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [sessions, setSessions] = useState<Session[]>([])
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionIdParam)
    const [isRecording, setIsRecording] = useState(false)
    const [recognition, setRecognition] = useState<any>(null)
    const [lastTranscript, setLastTranscript] = useState('')
    const [isVoiceOpen, setIsVoiceOpen] = useState(false)
    const transcriptRef = useRef('')

    // Setup Speech Recognition
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
            if (SpeechRecognition) {
                const rec = new SpeechRecognition()
                rec.lang = 'es-AR'
                rec.continuous = true
                rec.interimResults = true

                rec.onresult = (event: any) => {
                    // Get the transcript from the last result only
                    const last = event.results[event.results.length - 1]
                    const transcript = last[0].transcript
                    console.log('[Speech] Transcript:', transcript)
                    setLastTranscript(transcript)
                    transcriptRef.current = transcript
                }

                rec.onerror = (event: any) => {
                    console.error('Speech recognition error:', event.error)
                    setIsRecording(false)
                }

                rec.onend = () => {
                    console.log('[Speech] onend - isRecording:', isRecording, 'transcript:', transcriptRef.current)
                    // On mobile, recognition may auto-stop. Don't restart or clear the transcript.
                    // User must manually confirm to keep transcript.
                }

                setRecognition(rec)
            }
        }
    }, [])

    const startRecording = async () => {
        if (!recognition) return
        console.log('[Speech] Starting recording...')
        setLastTranscript('')
        transcriptRef.current = ''
        
        // Request mic permission first (required for mobile and some desktop browsers)
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            // Stop the stream immediately - we just need the permission
            stream.getTracks().forEach(track => track.stop())
            
            recognition.start()
            setIsRecording(true)
            console.log('[Speech] Recording started')
        } catch (err) {
            console.error('Mic permission denied:', err)
            // Optionally show error to user
        }
    }

    const cancelRecording = () => {
        if (!recognition) return
        console.log('[Speech] Canceling recording')
        recognition.stop()
        setLastTranscript('')
        transcriptRef.current = ''
        setIsRecording(false)
    }

    const confirmRecording = () => {
        if (!recognition) return
        console.log('[Speech] Confirming recording, transcript:', transcriptRef.current)
        recognition.stop()

        const finalTranscript = transcriptRef.current.trim()
        console.log('[Speech] Final transcript:', finalTranscript)
        if (finalTranscript) {
            setInput(prev => {
                const base = prev.trim()
                return base ? `${base} ${finalTranscript}` : finalTranscript
            })
        }

        setIsRecording(false)
        setLastTranscript('')
        transcriptRef.current = ''
    }

    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Auto open sidebar on desktop, keep closed on mobile
    useEffect(() => {
        if (typeof window !== 'undefined') {
            setSidebarOpen(window.innerWidth >= 768)
        }
    }, [])

    // Handle resize
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 768) {
                setSidebarOpen(true)
            }
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    // Close sidebar on mobile when navigating
    useEffect(() => {
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
            setSidebarOpen(false)
        }
    }, [agentSlug])

    // Load Agent
    useEffect(() => {
        fetch(`/api/agents?slug=${agentSlug}`)
            .then(res => {
                if (!res.ok) throw new Error('Agent not found')
                return res.json()
            })
            .then(data => setAgent(data))
            .catch(err => {
                console.error(err)
                setAgent(null)
            })
    }, [agentSlug])

    // Load Sessions
    useEffect(() => {
        if (agent?.id) {
            fetch(`/api/chat-sessions?agentId=${agent.id}`)
                .then(res => res.ok ? res.json() : [])
                .then(data => setSessions(data))
                .catch(err => console.error('Error loading sessions:', err))
        }
    }, [agent?.id])

    // Load Messages
    useEffect(() => {
        if (sessionIdParam) {
            setCurrentSessionId(sessionIdParam)

            fetch(`/api/chat-sessions?sessionId=${sessionIdParam}`)
                .then(res => res.ok ? res.json() : [])
                .then(async (msgs: any[]) => {
                    const loaded: Message[] = []
                    for (const m of msgs) {
                        let content = m.content
                        if (m.role === 'assistant') {
                            content = wrapTablesInScrollContainer(await marked.parse(m.content))
                        }
                        loaded.push({ ...m, content, rawContent: m.content })
                    }
                    setMessages(loaded)
                })
                .catch(err => console.error('Error loading messages:', err))
        } else {
            setMessages([])
            setCurrentSessionId(null)
        }
    }, [sessionIdParam])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleSend = async () => {
        if (!input.trim() || isLoading || !agent) return
        const userContent = input.trim()
        setInput('')

        // Optimistic UI
        const tempUserMsg: Message = { id: Date.now().toString(), role: 'user', content: userContent }
        setMessages(prev => [...prev, tempUserMsg])
        setIsLoading(true)
        
        // Clear previous thinking state AFTER adding user message
        setThinkingSteps([])
        setThinkingText('')
        collectedSourcesRef.current = []

        try {
            // Create session if needed
            let sid = currentSessionId
            let isNewSession = false
            if (!sid) {
                const res = await fetch('/api/chat-sessions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'create-session', agentId: agent.id })
                })
                if (!res.ok) throw new Error('Failed to create session')
                const session = await res.json()
                sid = session.id
                isNewSession = true
                
                // Update state but DON'T update URL yet (will do after streaming)
                setCurrentSessionId(sid)
            }

            // Save User Message
            await fetch('/api/chat-sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'save-message', sessionId: sid, role: 'user', content: userContent })
            })

            // Call AI
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentSlug,
                    messages: [...messages, tempUserMsg].map(m => ({
                        role: m.role,
                        content: m.rawContent || m.content
                    })),
                    sessionId: sid
                })
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                const errorMsg = errorData.error || 'API Error'
                const suggestion = errorData.suggestion
                const fullError = suggestion ? `${errorMsg}\n\n${suggestion}` : errorMsg
                throw new Error(fullError)
            }

            const reader = response.body?.getReader()
            if (!reader) throw new Error('No reader available')

            let botText = ''
            setThinkingSteps([]) // Reset thinking steps
            setThinkingText('') // Reset thinking text
            collectedSourcesRef.current = [] // Reset sources
            collectedStepsRef.current = [] // Reset steps ref

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = new TextDecoder().decode(value)
                
                // Check for thinking events (t:) first
                const lines = chunk.split('\n').filter(line => line.trim())
                let textChunk = ''
                
                for (const line of lines) {
                    if (line.startsWith('t:')) {
                        // Parse tool execution event
                        try {
                            const step = JSON.parse(line.slice(2)) as ThinkingStep
                            console.log('[Chat] 🔧 Tool step received:', step.tool, step.status)
                            // Collect sources in ref for later use
                            if (step.source && !collectedSourcesRef.current.includes(step.source)) {
                                collectedSourcesRef.current.push(step.source)
                            }
                            // Also collect in steps ref for capturing later
                            const existingIdx = collectedStepsRef.current.findIndex(s => s.tool === step.tool && s.startedAt === step.startedAt)
                            if (existingIdx >= 0) {
                                collectedStepsRef.current[existingIdx] = step
                            } else {
                                collectedStepsRef.current.push(step)
                            }
                            setThinkingSteps(prev => {
                                // Update existing step or add new one
                                const existing = prev.findIndex(s => s.tool === step.tool && s.startedAt === step.startedAt)
                                if (existing >= 0) {
                                    const updated = [...prev]
                                    updated[existing] = step
                                    return updated
                                }
                                return [...prev, step]
                            })
                        } catch (e) {
                            console.warn('[Chat] Failed to parse thinking event:', line)
                        }
                    } else if (line.startsWith('th:')) {
                        // Parse thinking summary (Chain of Thought from model)
                        try {
                            const { text } = JSON.parse(line.slice(3))
                            console.log('[Chat] 🧠 Thinking summary:', text.slice(0, 100) + '...')
                            setThinkingText(prev => prev + text)
                        } catch (e) {
                            console.warn('[Chat] Failed to parse thinking summary:', line)
                        }
                    } else {
                        textChunk += line + '\n'
                    }
                }
                
                // Process remaining text
                if (textChunk.trim()) {
                    const isDataStream = textChunk.match(/^[0-9a-z]:/m)

                    if (isDataStream) {
                        const dataLines = textChunk.split('\n').filter(l => l.trim())
                        for (const dataLine of dataLines) {
                            const match = dataLine.match(/^([0-9a-z]):(.*)$/)
                            if (match) {
                                const [_, type, content] = match
                                if (type === '0') {
                                    try {
                                        botText += JSON.parse(content)
                                    } catch (e) {
                                        botText += content.replace(/^"|"$/g, '')
                                    }
                                }
                            }
                        }
                    } else {
                        botText += textChunk
                    }
                }

                // No need to extract <thinking> blocks anymore - they come as th: events
                // Just display the text directly
                const displayText = botText
                
                // Only create/update temp-bot message when there's actual visible content
                if (displayText.trim()) {
                    const partialHtml = wrapTablesInScrollContainer(await marked.parse(displayText))
                    setMessages(prev => {
                        const last = prev[prev.length - 1]
                        if (last?.id === 'temp-bot') {
                            return [...prev.slice(0, -1), { ...last, content: partialHtml, rawContent: displayText }]
                        } else {
                            return [...prev, { id: 'temp-bot', role: 'assistant', content: partialHtml, rawContent: displayText }]
                        }
                    })
                }
            }

            // Final cleanup - remove thinking from saved/displayed text
            // No need to clean thinking blocks - they come separately now
            const finalText = botText
            const finalHtml = wrapTablesInScrollContainer(await marked.parse(finalText))
            
            // Use refs collected during streaming (state may not be updated yet)
            const usedSources = [...collectedSourcesRef.current] as ThinkingSource[]
            const finalThinkingSteps = [...collectedStepsRef.current]
            
            console.log('[Chat] 💾 Saving message with thinking steps:', finalThinkingSteps.length, finalThinkingSteps.map(s => s.tool))
            
            setMessages(prev => {
                const filtered = prev.filter(m => m.id !== 'temp-bot')
                return [...filtered, { 
                    id: Date.now().toString(), 
                    role: 'assistant', 
                    content: finalHtml, 
                    rawContent: finalText,
                    sources: usedSources.length > 0 ? usedSources : undefined,
                    thinkingSteps: finalThinkingSteps.length > 0 ? finalThinkingSteps : undefined
                }]
            })

            // Save Bot Message (without thinking block)
            await fetch('/api/chat-sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'save-message', sessionId: sid, role: 'assistant', content: finalText })
            })

            // Update URL AFTER streaming completes (avoids race condition with useEffect)
            if (isNewSession && sid) {
                window.history.replaceState(null, '', `/chat/${agentSlug}?session=${sid}`)
            }

            // Generate title if it's the first message
            if (messages.length <= 1) {
                fetch('/api/chat-sessions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'generate-title', sessionId: sid, userMessage: userContent })
                }).then(res => res.ok ? res.json() : null).then(data => {
                    if (data?.title) {
                        setSessions(prev => {
                            const exists = prev.find(s => s.id === sid)
                            if (exists) {
                                return prev.map(s => s.id === sid ? { ...s, title: data.title } : s)
                            } else {
                                return [{ id: sid!, title: data.title, agent_id: agent.id }, ...prev]
                            }
                        })
                    }
                })
            }

        } catch (e: any) {
            console.error(e)
            const errorMessage = e.message || 'No se pudo procesar el mensaje.'
            const errorHtml = await marked.parse(`**Error:**\n\n${errorMessage}`)
            setMessages(prev => [...prev.filter(m => m.id !== 'temp-bot'), { id: Date.now().toString(), role: 'assistant', content: errorHtml, rawContent: errorMessage }])
        } finally {
            setIsLoading(false)
            // Don't clear thinkingSteps here - they're saved in the message
            // and will be cleared at the start of the next handleSend
        }
    }

    if (!agent) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-adhoc-violet" /></div>

    // Loading state
    if (agent === undefined) {
        return (
            <div className="h-screen flex items-center justify-center bg-white">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-adhoc-violet" />
                    <span className="text-gray-500">Cargando agente...</span>
                </div>
            </div>
        )
    }

    // Agent not found
    if (agent === null) {
        return (
            <div className="h-screen flex items-center justify-center bg-white">
                <div className="flex flex-col items-center gap-4 text-center">
                    <Bot className="w-16 h-16 text-gray-300" />
                    <h2 className="text-xl font-medium text-gray-700">Agente no encontrado</h2>
                    <p className="text-gray-500">El agente "{agentSlug}" no existe o no está disponible.</p>
                    <Link href="/" className="mt-4 px-4 py-2 bg-adhoc-violet text-white rounded-lg hover:bg-adhoc-violet/90 transition-colors">
                        Volver al inicio
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="h-[100dvh] flex bg-white overflow-hidden relative font-sans">

            {/* Sidebar */}
            <aside className={`
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          fixed md:relative top-0 left-0 h-full z-40 bg-white flex flex-col transition-transform duration-300 ease-in-out border-r border-adhoc-lavender/30 w-[260px] shadow-xl md:shadow-none
      `}>
                <div className="p-3 flex items-center justify-between border-b border-gray-200/50 h-14">
                    {/* Logo */}
                    <div className="flex items-center gap-2">
                        <img src="/adhoc-logo.png" alt="Adhoc" className="h-6 w-auto" />
                    </div>

                    {/* Close Sidebar (Mobile only) */}
                    <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-gray-400 hover:text-gray-600">
                        <PanelLeftClose className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-3">
                    <button
                        onClick={() => {
                            router.push(`/chat/${agentSlug}`)
                            // Only close sidebar on mobile
                            if (window.innerWidth < 768) setSidebarOpen(false)
                        }}
                        className="w-full text-left px-3 py-3 text-base hover:bg-gray-100 rounded-xl flex gap-3 items-center transition-all group"
                    >
                        <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-adhoc-violet/10 flex items-center justify-center transition-colors">
                            <svg className="w-5 h-5 text-gray-500 group-hover:text-adhoc-violet transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                        </div>
                        <span className="font-medium text-gray-700 group-hover:text-adhoc-violet transition-colors">Nuevo chat</span>
                    </button>
                </div>

                <div className="px-4 pb-2">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Historial</span>
                </div>

                <div className="flex-1 overflow-y-auto px-2 space-y-0.5 font-sans">
                    {sessions.map(s => (
                        <Link key={s.id} href={`/chat/${agentSlug}?session=${s.id}`} className={`block px-3 py-2 text-sm rounded-md truncate transition-colors font-sans ${currentSessionId === s.id ? 'bg-adhoc-lavender/30 font-medium text-gray-900' : 'hover:bg-gray-100 text-gray-600'}`}>
                            {s.title}
                        </Link>
                    ))}
                    {sessions.length === 0 && (
                        <div className="px-4 py-8 text-center text-xs text-gray-400">
                            No hay historial reciente
                        </div>
                    )}
                </div>

                {/* User bottom section could go here */}
            </aside>

            {/* Overlay for mobile when sidebar open */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/30 z-30 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Main Chat */}
            <div className="flex-1 flex flex-col min-w-0 h-full relative">
                <header className="h-14 border-b border-adhoc-lavender/30 flex items-center px-4 justify-between bg-white z-10 shrink-0">
                    <div className="flex items-center gap-3">
                        {/* Toggle sidebar - mobile only */}
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden p-2 hover:bg-adhoc-lavender/20 rounded-lg text-gray-500 hover:text-adhoc-violet transition-colors">
                            <PanelLeft className="w-5 h-5" />
                        </button>
                        {/* Logo - mobile only when sidebar closed */}
                        <img src="/adhoc-logo.png" alt="Adhoc" className="h-7 w-auto md:hidden" />
                        <div className="w-8 h-8 rounded-full bg-adhoc-lavender/30 flex items-center justify-center">
                            {getAgentIcon(agent.icon, 'sm', 'text-adhoc-violet')}
                        </div>
                        <span className="font-medium text-gray-800">{agent.name}</span>
                    </div>
                    {/* Right side: Admin link */}
                    <div className="flex items-center gap-2">
                        <a 
                            href="/admin" 
                            className="p-2 hover:bg-adhoc-lavender/20 rounded-lg text-gray-500 hover:text-adhoc-violet transition-colors"
                            title="Configuración"
                        >
                            <Settings className="w-5 h-5" />
                        </a>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-4">
                    <div className="max-w-3xl mx-auto space-y-6">
                        {messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-adhoc-lavender/30 flex items-center justify-center">
                                    {getAgentIcon(agent.icon, 'lg', 'text-adhoc-violet')}
                                </div>
                                <h1 className="text-xl font-medium text-gray-700">
                                    ¿En qué puedo ayudarte?
                                </h1>
                            </div>
                        )}

                        {messages.map((m, i) => {
                            const isLastMessage = i === messages.length - 1
                            const isStreamingBot = isLoading && m.id === 'temp-bot'
                            
                            return (
                            <div key={i}>
                                {/* Show ThinkingStream BEFORE the streaming bot message */}
                                {isStreamingBot && (thinkingText || thinkingSteps.length > 0) && (
                                    <ThinkingStream 
                                        thinkingText={thinkingText}
                                        steps={thinkingSteps} 
                                        isExpanded={thinkingExpanded}
                                        onToggle={() => setThinkingExpanded(!thinkingExpanded)}
                                    />
                                )}
                                
                                <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {m.role === 'assistant' ? (
                                    <div className="flex gap-3 max-w-[90%] md:max-w-[80%] min-w-0">
                                        <div className="w-8 h-8 rounded-full bg-adhoc-lavender/30 flex items-center justify-center flex-shrink-0 mt-1">
                                            {getAgentIcon(agent.icon, 'sm', 'text-adhoc-violet')}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            {/* Render MeLi Skill result if applicable (returns null if not) */}
                                            <MeliSkillsRenderer content={m.rawContent || m.content} />
                                            {/* Always render the message content */}
                                            <div className="bot-message text-[15px] leading-relaxed text-gray-900 overflow-x-auto min-w-0" dangerouslySetInnerHTML={{ __html: m.content }}></div>
                                            
                                            {/* Show ThinkingStream for completed messages with steps */}
                                            {m.thinkingSteps && m.thinkingSteps.length > 0 && !isStreamingBot && (
                                                <div className="mt-3">
                                                    <CollapsibleThinkingStream steps={m.thinkingSteps} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-adhoc-lavender/30 px-4 py-2 rounded-3xl rounded-br-lg max-w-[80%] text-[15px] text-gray-900 whitespace-pre-wrap">
                                        {m.content}
                                    </div>
                                )}
                                </div>
                            </div>
                            )
                        })}
                        {/* Show ThinkingIndicator when loading but no thinking content yet */}
                        {isLoading && !messages.some(m => m.id === 'temp-bot') && (
                            (thinkingText || thinkingSteps.length > 0) ? (
                                <ThinkingStream 
                                    thinkingText={thinkingText}
                                    steps={thinkingSteps} 
                                    isExpanded={thinkingExpanded}
                                    onToggle={() => setThinkingExpanded(!thinkingExpanded)}
                                />
                            ) : (
                                <ThinkingIndicator />
                            )
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                <div className="p-3 md:p-6 bg-white border-t border-adhoc-lavender/20 pb-[env(safe-area-inset-bottom,12px)] md:pb-6">
                    <div className="max-w-3xl mx-auto">
                        {isRecording ? (
                            <div className="w-full bg-gray-50 border border-adhoc-violet/30 rounded-full px-4 py-2 flex items-center gap-3 animate-in fade-in zoom-in duration-300 shadow-sm">
                                <div className="flex-1 flex items-center gap-2 overflow-hidden">
                                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                                    <AudioVisualizer isRecording={isRecording} />
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={cancelRecording}
                                        className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                                        title="Cancelar"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={confirmRecording}
                                        className="p-2 bg-adhoc-violet text-white rounded-full hover:bg-adhoc-violet/90 shadow-sm transition-all"
                                        title="Terminar y revisar"
                                    >
                                        <Check className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="relative flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-[24px] focus-within:border-adhoc-violet focus-within:ring-1 focus-within:ring-adhoc-violet/20 focus-within:bg-white transition-all p-1.5 px-3 group shadow-sm">
                                <textarea
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                                    placeholder="Preguntale a Tuqui"
                                    className="flex-1 bg-transparent border-none rounded-2xl pl-2 pr-2 py-2.5 resize-none focus:outline-none min-h-[44px] max-h-[200px] text-[15px] leading-relaxed w-0"
                                    rows={1}
                                />
                                <div className="flex items-center gap-1 pb-1">
                                    {recognition && (
                                        <button
                                            onClick={startRecording}
                                            className="p-2 text-gray-400 hover:text-adhoc-violet hover:bg-adhoc-lavender/20 rounded-full transition-all"
                                            title="Dictar mensaje"
                                        >
                                            <Mic className="w-5 h-5" />
                                        </button>
                                    )}
                                    {input.trim().length > 0 ? (
                                        <button
                                            onClick={handleSend}
                                            disabled={isLoading}
                                            className="p-2 bg-adhoc-violet text-white rounded-full hover:bg-adhoc-violet/90 shadow-sm transition-all disabled:opacity-50"
                                            title="Enviar mensaje"
                                        >
                                            <ArrowUp className="w-5 h-5" />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setIsVoiceOpen(true)}
                                            className="p-2 bg-adhoc-coral text-white rounded-full hover:bg-adhoc-coral/90 shadow-sm transition-all flex items-center justify-center animate-in zoom-in duration-300"
                                            title="Voz en tiempo real"
                                        >
                                            <AudioLines className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                        <p className="text-center text-[10px] text-gray-400 mt-2">IA puede cometer errores.</p>
                    </div>
                </div>
            </div>

            <VoiceChat
                isOpen={isVoiceOpen}
                onClose={() => setIsVoiceOpen(false)}
                agentSlug={agentSlug}
                sessionId={currentSessionId}
                systemPrompt={agent.system_prompt || ''}
                messages={messages}
                onAddMessage={(role: 'user' | 'assistant', content: string) => {
                    setMessages(prev => [...prev, {
                        id: Date.now().toString(),
                        role,
                        content,
                        rawContent: content
                    }])
                }}
            />
        </div>
    )
}
