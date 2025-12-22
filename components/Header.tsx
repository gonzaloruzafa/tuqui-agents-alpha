import Link from 'next/link'
import { Settings } from 'lucide-react'
import { auth } from '@/lib/auth/config'
import { UserMenu } from './UserMenu'
import { NotificationBell } from './NotificationBell'

export async function Header() {
    const session = await auth()

    return (
        <header className="w-full bg-white border-b border-gray-100 py-4 px-4 md:px-8">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                    {/* Logo copied from tuqui-agents/public */}
                    <img src="/adhoc-logo.png" alt="Adhoc" className="h-8 w-auto" />
                </Link>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500 font-medium hidden sm:inline-block">
                        Tuqui Agents
                    </span>
                    {session?.user && <NotificationBell />}
                    {session?.isAdmin && (
                        <Link
                            href="/admin"
                            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm"
                        >
                            <Settings className="w-4 h-4" />
                            <span className="hidden sm:inline">Admin</span>
                        </Link>
                    )}
                    {session?.user && <UserMenu user={session.user} />}
                </div>
            </div>
        </header>
    )
}
