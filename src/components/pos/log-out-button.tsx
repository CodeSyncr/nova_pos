'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut, Loader2 } from 'lucide-react'

export function LogOutButton({ primaryColor }: { primaryColor: string }) {
	const [isLoading, setIsLoading] = useState(false)
	const supabase = createSupabaseBrowserClient()
	const router = useRouter()

	const handleLogOut = async () => {
		setIsLoading(true)
		try {
			await supabase.auth.signOut()
			router.refresh()
		} catch (error) {
			console.error('Error logging out:', error)
		} finally {
			setIsLoading(false)
		}
	}

	return (
		<button
			onClick={handleLogOut}
			disabled={isLoading}
			className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 px-4 text-sm font-semibold border border-white/10 hover:bg-white/5 disabled:opacity-50 transition-all duration-200"
			style={{ color: primaryColor }}
		>
			{isLoading ? (
				<Loader2 className="h-4 w-4 animate-spin" />
			) : (
				<LogOut className="h-4 w-4" />
			)}
			<span>Sign Out / Switch Account</span>
		</button>
	)
}
