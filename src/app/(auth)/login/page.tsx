'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { motion } from 'framer-motion'
import { Sparkles, Star, Workflow } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Logo } from '@/components/brand/logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

const authAppearance = {
	theme: ThemeSupa,
	variables: {
		default: {
			colors: {
				brand: '#7A74FF',
				brandAccent: '#4DD4FF',
				inputBackground: '#080B1D',
				inputBorder: '#1F2243'
			},
			borderWidths: {
				buttonBorderWidth: '1px'
			},
			radii: {
				borderRadiusButton: '999px',
				borderRadiusInput: '18px'
			}
		}
	},
	className: {
		container: 'gap-6',
		button:
			'!rounded-2xl !bg-gradient-to-r !from-[#6B6DFF] !to-[#4DD4FF] hover:!opacity-90 !text-sm !font-medium !text-white',
		label: '!text-white/80 !text-sm',
		input: '!bg-white/5 !border-white/15 !text-white',
		message: '!text-rose-300',
		loader: '!text-white'
	}
} as const

export default function LoginPage() {
	const [supabaseClient] = useState(createSupabaseBrowserClient)
	const router = useRouter()

	useEffect(() => {
		let isMounted = true

		supabaseClient.auth.getSession().then(({ data }) => {
			if (data.session && isMounted) {
				router.replace('/onboarding')
			}
		})

		const {
			data: { subscription }
		} = supabaseClient.auth.onAuthStateChange((_event, session) => {
			if (session) {
				router.replace('/onboarding')
			}
		})

		return () => {
			isMounted = false
			subscription.unsubscribe()
		}
	}, [router, supabaseClient])

	return (
		<div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#040513] via-[#050A1F] to-[#02030B] text-white">
			<div className="pointer-events-none absolute inset-0">
				<div className="glow -top-32 left-1/2 h-96 w-96 -translate-x-1/2 bg-[#7A74FF]/30" />
				<div className="glow bottom-0 left-10 h-72 w-72 bg-[#4DD4FF]/25" />
				<div className="glow -bottom-16 right-16 h-80 w-80 bg-[#FF7ACB]/30" />
			</div>

			<div className="relative z-10 flex min-h-screen flex-col gap-20 px-6 py-12 md:flex-row md:px-12 lg:px-20">
				<section className="flex flex-1 flex-col justify-between gap-12">
					<div>
						<Logo />
						<Badge className="mt-8 border-white/20 bg-white/10 text-white/80">
							<Sparkles className="mr-2 h-4 w-4" /> Seamless access
						</Badge>
						<h1 className="mt-6 text-4xl font-semibold leading-tight text-white md:text-5xl">
							Step back into your NovaPOS command center
						</h1>
						<p className="mt-4 max-w-lg text-base text-white/70">
							Glide into operations with cinematic onboarding, live automations,
							and a dashboard that feels like a control room designed by Vercel
							and Linear.
						</p>
					</div>
					<div className="space-y-4 text-white/70">
						<div className="flex items-center gap-3">
							<Star className="h-4 w-4 text-amber-300" />
							Cinematic onboarding with guided rituals
						</div>
						<div className="flex items-center gap-3">
							<Workflow className="h-4 w-4 text-teal-300" />
							Automation studio for every channel
						</div>
						<p className="text-sm text-white/50">
							Need an account?{' '}
							<Link
								className="text-white underline-offset-4 hover:underline"
								href="/signup"
							>
								Create one in minutes
							</Link>
						</p>
					</div>
				</section>

				<motion.section
					className="flex flex-1 items-center justify-center"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, ease: 'easeOut' }}
				>
					<div className="w-full max-w-md rounded-[32px] border border-white/10 bg-white/5 p-8 backdrop-blur-2xl shadow-[0_30px_80px_rgba(4,5,16,0.65)]">
						<div className="mb-8 text-center">
							<p className="text-sm uppercase tracking-[0.4em] text-white/50">
								Sign in
							</p>
							<h2 className="mt-3 text-3xl font-semibold text-white">
								Welcome back
							</h2>
							<p className="mt-2 text-sm text-white/60">
								Authenticate with your workspace email to access NovaPOS.
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
										email_label: 'Work email',
										password_label: 'Access key',
										button_label: 'Access NovaPOS'
									}
								}
							}}
							theme="dark"
						/>

						<div className="mt-6 text-center text-sm text-white/60">
							Need an invite?{' '}
							<Button asChild variant="link" className="p-0 text-white">
								<Link href="/signup">Join the platform</Link>
							</Button>
						</div>
					</div>
				</motion.section>
			</div>
		</div>
	)
}
