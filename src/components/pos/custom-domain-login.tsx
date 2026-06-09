'use client'

import { useEffect, useState } from 'react'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { motion } from 'framer-motion'
import { ChefHat, Sparkles } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type TenantBranding = {
	primaryColor?: string
	secondaryColor?: string
}

type TenantProps = {
	id: string
	name: string
	logo_url: string | null
	branding: Record<string, unknown> | null
}

export function CustomDomainLogin({ tenant }: { tenant: TenantProps }) {
	const [supabaseClient] = useState(createSupabaseBrowserClient)
	const router = useRouter()

	useEffect(() => {
		const {
			data: { subscription }
		} = supabaseClient.auth.onAuthStateChange((event, session) => {
			if (session) {
				// Reload page to re-trigger Server Component auth check
				router.refresh()
			}
		})

		return () => {
			subscription.unsubscribe()
		}
	}, [router, supabaseClient])

	const branding = (tenant.branding as TenantBranding) || {}
	const primaryColor = branding.primaryColor || '#E0342A'
	const secondaryColor = branding.secondaryColor || '#E0342A'

	const authAppearance = {
		theme: ThemeSupa,
		variables: {
			default: {
				colors: {
					brand: primaryColor,
					brandAccent: secondaryColor,
					inputBackground: '#080B1D',
					inputBorder: '#1F2243'
				},
				borderWidths: {
					buttonBorderWidth: '1px'
				},
				radii: {
					borderRadiusButton: '16px',
					borderRadiusInput: '16px'
				}
			}
		},
		className: {
			container: 'gap-6',
			button: '!rounded-2xl hover:!opacity-90 !text-sm !font-semibold !text-white !py-3 !transition-all !duration-200',
			label: '!text-white/80 !text-sm',
			input: '!bg-white/5 !border-white/15 !text-white !py-3',
			message: '!text-[#E0342A]',
			loader: '!text-white'
		}
	} as const

	return (
		<div className="relative min-h-screen overflow-hidden bg-black text-white flex items-center justify-center px-6">
			<div className="pointer-events-none absolute inset-0">
				<div
					className="glow -top-32 left-1/2 h-96 w-96 -translate-x-1/2 opacity-30"
					style={{ backgroundColor: primaryColor }}
				/>
				<div
					className="glow bottom-0 left-10 h-72 w-72 opacity-25"
					style={{ backgroundColor: secondaryColor }}
				/>
			</div>

			<motion.div
				className="w-full max-w-md rounded-[32px] border border-white/10 bg-white/5 p-8 backdrop-blur-2xl shadow-[0_30px_80px_rgba(4,5,16,0.65)] relative z-10"
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.6, ease: 'easeOut' }}
			>
				<div className="mb-8 text-center flex flex-col items-center">
					{tenant.logo_url ? (
						<img
							src={tenant.logo_url}
							alt={tenant.name}
							className="h-16 w-16 rounded-2xl object-cover border border-white/10 mb-4 shadow-md"
						/>
					) : (
						<div
							className="h-16 w-16 rounded-2xl flex items-center justify-center border mb-4 shadow-md"
							style={{
								backgroundColor: `${primaryColor}20`,
								borderColor: `${primaryColor}40`,
								color: primaryColor
							}}
						>
							<ChefHat className="h-8 w-8" />
						</div>
					)}
					<p
						className="text-xs uppercase tracking-[0.4em] font-semibold"
						style={{ color: primaryColor }}
					>
						POS Terminal Access
					</p>
					<h2 className="mt-3 text-3xl font-semibold text-white">{tenant.name}</h2>
					<p className="mt-2 text-sm text-white/50">
						Please sign in with your staff email to enter the register interface.
					</p>
				</div>

				<Auth
					supabaseClient={supabaseClient}
					view="sign_in"
					providers={[]}
					appearance={authAppearance}
					localization={{
						variables: {
							sign_in: {
								email_label: 'Staff email',
								password_label: 'PIN / Password',
								button_label: 'Access Register'
							}
						}
					}}
					theme="dark"
				/>

				<div className="mt-6 text-center text-xs text-white/35 flex items-center justify-center gap-1.5">
					<Sparkles className="h-3 w-3" />
					<span>Secure login managed by POS</span>
				</div>
			</motion.div>
		</div>
	)
}
