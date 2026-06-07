'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { motion } from 'framer-motion'
import { ArrowRight, Sparkles, Users } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Logo } from '@/components/brand/logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import type { AuthChangeEvent } from '@supabase/supabase-js'

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

export default function SignupPage() {
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
		} = supabaseClient.auth.onAuthStateChange(
			(event: AuthChangeEvent, session) => {
				if (
					(event === 'SIGNED_IN' ||
						event === 'USER_UPDATED' ||
						event === 'TOKEN_REFRESHED') &&
					session
				) {
					router.replace('/onboarding')
				}
			}
		)

		return () => {
			isMounted = false
			subscription.unsubscribe()
		}
	}, [router, supabaseClient])

	return (
		<div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#030512] via-[#050A1F] to-[#010204] text-white">
			<div className="pointer-events-none absolute inset-0">
				<div className="glow -top-32 left-1/3 h-96 w-96 -translate-x-1/2 bg-[#7A74FF]/30" />
				<div className="glow bottom-0 left-16 h-72 w-72 bg-[#41E3FF]/30" />
				<div className="glow -bottom-24 right-12 h-96 w-96 bg-[#FF7ACB]/25" />
			</div>

			<div className="relative z-10 flex min-h-screen flex-col gap-20 px-6 py-12 md:flex-row md:px-12 lg:px-20">
				<section className="flex flex-1 flex-col justify-between gap-10">
					<div>
						<Logo />
						<Badge className="mt-8 border-white/20 bg-white/10 text-white/80">
							<Users className="mr-2 h-4 w-4" /> Invite-only beta
						</Badge>
						<h1 className="mt-6 text-4xl font-semibold leading-tight text-white md:text-5xl">
							Create your NovaPOS workspace and unlock story-led onboarding
						</h1>
						<p className="mt-4 max-w-xl text-base text-white/70">
							Define your restaurant concept, sync your team, and launch a
							cinematic POS experience that feels like Linear meets hospitality.
						</p>
						<div className="mt-8 space-y-3 text-white/70">
							<div className="flex items-center gap-3">
								<Sparkles className="h-4 w-4 text-violet-300" />
								Step-by-step onboarding that feels like a film
							</div>
							<div className="flex items-center gap-3">
								<ArrowRight className="h-4 w-4 text-sky-300" />
								Routes directly into tenant creation once verified
							</div>
						</div>
					</div>
					<p className="text-sm text-white/50">
						Already have access?{' '}
						<Link
							className="text-white underline-offset-4 hover:underline"
							href="/login"
						>
							Sign in here
						</Link>
					</p>
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
								Create account
							</p>
							<h2 className="mt-3 text-3xl font-semibold text-white">
								Let's design your POS
							</h2>
							<p className="mt-2 text-sm text-white/60">
								Use your best contact email. We’ll guide you to onboarding right
								after verification.
							</p>
						</div>

						<Auth
							supabaseClient={supabaseClient}
							view="sign_up"
							providers={[]}
							appearance={authAppearance}
							localization={{
								variables: {
									sign_up: {
										email_label: 'Work email',
										password_label: 'Create access key',
										button_label: 'Create NovaPOS account'
									}
								}
							}}
							theme="dark"
						/>

						<div className="mt-6 text-center text-sm text-white/60">
							By continuing you agree to our{' '}
							<Button asChild variant="link" className="p-0 text-white">
								<Link href="/legal/terms">terms of service</Link>
							</Button>
							.
						</div>
					</div>
				</motion.section>
			</div>
		</div>
	)
}
