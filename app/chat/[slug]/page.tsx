'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import {
    Send, Loader2, ArrowLeft,
    Scale, Users, Briefcase, HeadphonesIcon,
    Bot, Brain, Code, Lightbulb, MessageSquare, Sparkles,
    GraduationCap, Heart, ShoppingCart, TrendingUp, Wrench,
    FileText, Calculator, Globe, Shield, Zap, Mail, Copy,
    PanelLeftClose, PanelLeft, Search, Database, Mic, MicOff, Check, X
} from 'lucide-react'
import { marked } from 'marked'

// Helper to wrap tables in scrollable div
function wrapTablesInScrollContainer(html: string): string {
    return html.replace(/<table>/g, '<div class="table-wrapper"><table>')
        .replace(/<\/table>/g, '</table></div>')
}

// Real-time Scrolling Temporal Waveform for Voice Input
const AudioVisualizer = ({ isRecording }: { isRecording: boolean }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const analyserRef = useRef<AnalyserNode | null>(null)
    const dataArrayRef = useRef<Uint8Array | null>(null)
    const animationRef = useRef<number | null>(null)
    const historyRef = useRef<number[]>(new Array(100).fill(0)) // Store more history for slower scroll
    const frameCountRef = useRef(0)

    useEffect(() => {
        if (!isRecording) {
            if (animationRef.current) cancelAnimationFrame(animationRef.current)
            return
        }

        const startAudio = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext
                const audioContext = new AudioContextClass()
                const analyser = audioContext.createAnalyser()
                const source = audioContext.createMediaStreamSource(stream)

                analyser.fftSize = 256
                source.connect(analyser)

                const bufferLength = analyser.frequencyBinCount
                const dataArray = new Uint8Array(bufferLength)

                audioContextRef.current = audioContext
                analyserRef.current = analyser
                dataArrayRef.current = dataArray

                const draw = () => {
                    if (!canvasRef.current || !analyserRef.current || !dataArrayRef.current) return
                    const canvas = canvasRef.current
                    const ctx = canvas.getContext('2d')
                    if (!ctx) return

                    const width = canvas.width
                    const height = canvas.height

                    animationRef.current = requestAnimationFrame(draw)

                    // Throttle updates even more to slow down the scroll (update every 4 frames)
                    frameCountRef.current++
                    if (frameCountRef.current % 4 === 0) {
                        analyserRef.current.getByteFrequencyData(dataArrayRef.current as any)

                        // Calculate average volume
                        let sum = 0
                        for (let i = 0; i < dataArrayRef.current.length; i++) {
                            sum += dataArrayRef.current[i]
                        }
                        const average = sum / dataArrayRef.current.length

                        // Update history (scroll effect)
                        historyRef.current.shift()
                        historyRef.current.push(average)
                    }

                    ctx.clearRect(0, 0, width, height)

                    const barWidth = 0.8 // Muy fino
                    const gap = 2.5
                    const totalBarWidth = barWidth + gap
                    const barsToDraw = historyRef.current.length

                    ctx.fillStyle = '#a78bfa' // Subtle Light Violet (discrete)

                    for (let i = 0; i < barsToDraw; i++) {
                        const vol = historyRef.current[i]
                        // Make height a bit more discrete too
                        const barHeight = Math.max(1, (vol / 160) * height * 0.6)

                        const x = i * totalBarWidth
                        const y = (height - barHeight) / 2

                        ctx.beginPath()
                        ctx.roundRect(x, y, barWidth, barHeight, 0.4)
                        ctx.fill()
                    }
                }
                draw()
            } catch (err) {
                console.error('Visualizer error:', err)
            }
        }

        startAudio()

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current)
            if (audioContextRef.current) audioContextRef.current.close()
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

interface Agent {
    id: string
    name: string
    slug: string
    icon: string
    welcome_message: string
    placeholder_text: string
}

interface Message {
    id: string | number
    role: 'user' | 'assistant'
    content: string
    rawContent?: string
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
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [sessions, setSessions] = useState<Session[]>([])
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionIdParam)
    const [isRecording, setIsRecording] = useState(false)
    const [recognition, setRecognition] = useState<any>(null)
    const [lastTranscript, setLastTranscript] = useState('')
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
                    let totalTranscript = ''
                    for (let i = 0; i < event.results.length; ++i) {
                        totalTranscript += event.results[i][0].transcript
                    }
                    setLastTranscript(totalTranscript)
                    transcriptRef.current = totalTranscript
                }

                rec.onerror = (event: any) => {
                    console.error('Speech recognition error:', event.error)
                    setIsRecording(false)
                }

                rec.onend = () => {
                    // Do not auto-close unless error
                }

                setRecognition(rec)
            }
        }
    }, [])

    const startRecording = () => {
        if (!recognition) return
        setLastTranscript('')
        transcriptRef.current = ''
        recognition.start()
        setIsRecording(true)
    }

    const cancelRecording = () => {
        if (!recognition) return
        recognition.stop()
        setLastTranscript('')
        transcriptRef.current = ''
        setIsRecording(false)
    }

    const confirmRecording = () => {
        if (!recognition) return
        recognition.stop()

        const finalTranscript = transcriptRef.current.trim()
        if (finalTranscript) {
            setInput(prev => {
                const base = prev.trim()
                return base ? `${base} ${finalTranscript}` : finalTranscript
            })
        }

        setIsRecording(false)
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

        try {
            // Create session if needed
            let sid = currentSessionId
            if (!sid) {
                const res = await fetch('/api/chat-sessions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'create-session', agentId: agent.id })
                })
                if (!res.ok) throw new Error('Failed to create session')
                const session = await res.json()
                sid = session.id
                setCurrentSessionId(sid)
                router.push(`/chat/${agentSlug}?session=${sid}`, { scroll: false })
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
                throw new Error(errorData.error || 'API Error')
            }

            const reader = response.body?.getReader()
            if (!reader) throw new Error('No reader available')

            let botText = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = new TextDecoder().decode(value)
                const isDataStream = chunk.match(/^[0-9a-z]:/m)

                if (isDataStream) {
                    const lines = chunk.split('\n').filter(line => line.trim())
                    for (const line of lines) {
                        const match = line.match(/^([0-9a-z]):(.*)$/)
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
                    botText += chunk
                }

                const partialHtml = wrapTablesInScrollContainer(await marked.parse(botText))
                setMessages(prev => {
                    const last = prev[prev.length - 1]
                    if (last?.id === 'temp-bot') {
                        return [...prev.slice(0, -1), { ...last, content: partialHtml, rawContent: botText }]
                    } else {
                        return [...prev, { id: 'temp-bot', role: 'assistant', content: partialHtml, rawContent: botText }]
                    }
                })
            }

            const finalHtml = wrapTablesInScrollContainer(await marked.parse(botText))
            setMessages(prev => {
                const filtered = prev.filter(m => m.id !== 'temp-bot')
                return [...filtered, { id: Date.now().toString(), role: 'assistant', content: finalHtml, rawContent: botText }]
            })

            // Save Bot Message
            await fetch('/api/chat-sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'save-message', sessionId: sid, role: 'assistant', content: botText })
            })

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
            setMessages(prev => [...prev.filter(m => m.id !== 'temp-bot'), { id: Date.now().toString(), role: 'assistant', content: `Error: ${e.message || 'No se pudo procesar el mensaje.'}` }])
        } finally {
            setIsLoading(false)
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
        <div className="h-screen flex bg-white overflow-hidden relative font-sans">

            {/* Sidebar */}
            <aside className={`
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          fixed md:relative top-0 left-0 h-full z-40 bg-white flex flex-col transition-transform duration-300 ease-in-out border-r border-adhoc-lavender/30 w-[260px] shadow-xl md:shadow-none
      `}>
                <div className="p-3 flex items-center justify-between border-b border-gray-200/50 h-14">
                    {/* Back to Menu Button */}
                    <Link href="/" className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-200/60 rounded-md text-gray-600 transition-colors group">
                        <div className="w-6 h-6 rounded-md bg-white border border-gray-200 flex items-center justify-center group-hover:border-gray-300">
                            <ArrowLeft className="w-3.5 h-3.5 text-gray-500" />
                        </div>
                        <span className="text-sm font-medium">Volver</span>
                    </Link>

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
                        className="w-full text-left px-3 py-2.5 text-sm bg-white border border-gray-200 hover:border-adhoc-violet hover:text-adhoc-violet rounded-lg shadow-sm flex gap-2 items-center transition-all group"
                    >
                        <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-adhoc-violet/10">
                            <Bot className="w-3 h-3 text-gray-500 group-hover:text-adhoc-violet" />
                        </div>
                        <span className="font-medium text-gray-700 group-hover:text-adhoc-violet">Nuevo Chat</span>
                    </button>
                </div>

                <div className="px-4 pb-2">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Historial</span>
                </div>

                <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
                    {sessions.map(s => (
                        <Link key={s.id} href={`/chat/${agentSlug}?session=${s.id}`} className={`block px-3 py-2 text-sm rounded-md truncate transition-colors ${currentSessionId === s.id ? 'bg-gray-200 font-medium text-gray-900' : 'hover:bg-gray-100 text-gray-600'}`}>
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
                        {/* Mobile: show menu button when sidebar closed */}
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-adhoc-lavender/20 rounded-lg text-gray-500 hover:text-adhoc-violet transition-colors">
                            {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
                        </button>
                        {/* Mobile: quick back to menu */}
                        <Link href="/" className="md:hidden p-2 hover:bg-adhoc-lavender/20 rounded-lg text-gray-500 hover:text-adhoc-violet transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="h-6 w-px bg-adhoc-lavender/50 mx-1 hidden md:block"></div>
                        <div className="w-8 h-8 rounded-full bg-adhoc-lavender/30 flex items-center justify-center">
                            {getAgentIcon(agent.icon, 'sm', 'text-adhoc-violet')}
                        </div>
                        <span className="font-medium text-gray-800">{agent.name}</span>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-4">
                    <div className="max-w-3xl mx-auto space-y-6">
                        {messages.length === 0 && (
                            <div className="text-center mt-20">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-adhoc-lavender/30 flex items-center justify-center">
                                    {getAgentIcon(agent.icon, 'lg', 'text-adhoc-violet')}
                                </div>
                                <h2 className="text-xl font-medium mb-2">{agent.welcome_message}</h2>
                            </div>
                        )}

                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {m.role === 'assistant' ? (
                                    <div className="flex gap-3 max-w-[90%] md:max-w-[80%] min-w-0">
                                        <div className="w-8 h-8 rounded-full bg-adhoc-lavender/30 flex items-center justify-center flex-shrink-0 mt-1">
                                            {getAgentIcon(agent.icon, 'sm', 'text-adhoc-violet')}
                                        </div>
                                        <div className="bot-message text-[15px] leading-relaxed text-gray-900 overflow-x-auto min-w-0" dangerouslySetInnerHTML={{ __html: m.content }}></div>
                                    </div>
                                ) : (
                                    <div className="bg-adhoc-lavender/30 px-4 py-2 rounded-3xl rounded-br-lg max-w-[80%] text-[15px] text-gray-900 whitespace-pre-wrap">
                                        {m.content}
                                    </div>
                                )}
                            </div>
                        ))}
                        {isLoading && <div className="flex gap-2 items-center text-gray-400 text-sm ml-12"><Loader2 className="w-4 h-4 animate-spin" /> Generando...</div>}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                <div className="p-4 bg-white border-t border-adhoc-lavender/30">
                    <div className="max-w-3xl mx-auto relative">
                        {isRecording ? (
                            <div className="w-full bg-gray-50 border border-adhoc-violet/30 rounded-2xl px-4 py-3 flex items-center gap-4 animate-in fade-in zoom-in duration-300">
                                <div className="flex-1 flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                                    <AudioVisualizer isRecording={isRecording} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={cancelRecording}
                                        className="p-2.5 bg-gray-200 text-gray-600 rounded-xl hover:bg-gray-300 transition-colors"
                                        title="Cancelar"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={confirmRecording}
                                        className="p-2.5 bg-adhoc-violet text-white rounded-xl hover:bg-adhoc-violet/90 shadow-md transition-all"
                                        title="Terminar y revisar"
                                    >
                                        <Check className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="relative">
                                <textarea
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                                    placeholder={agent.placeholder_text}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-4 pr-24 py-3 resize-none focus:outline-none focus:border-adhoc-violet focus:ring-2 focus:ring-adhoc-lavender/50 focus:bg-white transition-all"
                                    rows={1}
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                    {recognition && (
                                        <button
                                            onClick={startRecording}
                                            className="p-2.5 bg-gray-100 text-gray-500 hover:bg-gray-200 rounded-xl transition-all"
                                            title="Dictar mensaje"
                                        >
                                            <Mic className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button onClick={handleSend} disabled={isLoading || !input.trim()} className="p-2.5 bg-adhoc-violet text-white rounded-xl hover:bg-adhoc-violet/90 hover:shadow-md transition-all disabled:opacity-50">
                                        <Send className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    <p className="text-center text-xs text-gray-400 mt-2">IA puede cometer errores.</p>
                </div>
            </div>
        </div>
    )
}
