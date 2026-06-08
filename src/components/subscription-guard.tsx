'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { AlertTriangle, CreditCard, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type SubscriptionGuardProps = {
	children: React.ReactNode
}

export function SubscriptionGuard({ children }: SubscriptionGuardProps) {
	const router = useRouter()
	const [checking, setChecking] = useState(true)
	const [expired, setExpired] = useState(false)
	const [daysRemaining, setDaysRemaining] = useState<number | null>(null)
	const [status, setStatus] = useState<string | null>(null)

	useEffect(() => {
		const check = async () => {
			try {
				const supabase = createSupabaseBrowserClient()
				const { data: { user } } = await supabase.auth.getUser()
				if (!user) return

				const { data: pt } = await supabase
					.from('profile_tenants')
					.select('tenant_id, role_id')
					.eq('profile_id', user.id)
					.single()

				if (!pt) return

				// Staff members (with role_id) are not blocked by subscription
				if (pt.role_id) {
					setChecking(false)
					return
				}

				const { data: tenant } = await supabase
					.from('tenants')
					.select('subscription, trial_ends_at')
					.eq('id', pt.tenant_id)
					.single()

				if (!tenant?.subscription) {
					setChecking(false)
					return
				}

				const subscription = tenant.subscription as {
					status: string
					trialEndsAt?: string
					currentPeriodEnd?: string
				}

				if (subscription.status === 'active') {
					setChecking(false)
					return
				}

				if (subscription.status === 'trial' && subscription.trialEndsAt) {
					const trialEnd = new Date(subscription.trialEndsAt)
					const now = new Date()
					if (now > trialEnd) {
						setExpired(true)
						setStatus('expired')
					} else {
						const days = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
						setDaysRemaining(days)
					}
				} else if (subscription.status === 'expired' || subscription.status === 'canceled') {
					setExpired(true)
					setStatus(subscription.status)
				}
			} catch (err) {
				console.error('Subscription check failed:', err)
			} finally {
				setChecking(false)
			}
		}

		check()
	}, [])

	if (checking) return <>{children}</>

	if (expired) {
		return (
			<div className="flex min-h-[60vh] items-center justify-center px-4">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					className="max-w-md w-full rounded-[32px] border border-red-500/20 bg-gradient-to-br from-red-500/10 via-[#060915] to-[#030308] p-8 text-center space-y-6"
				>
					<div className="mx-auto w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center">
						<AlertTriangle className="h-8 w-8 text-red-400" />
					</div>
					<div>
						<h2 className="text-2xl font-semibold text-white">
							{status === 'expired' ? 'Trial Expired' : 'Subscription Inactive'}
						</h2>
						<p className="mt-2 text-white/60">
							{status === 'expired'
								? 'Your 7-day free trial has ended. Upgrade to a paid plan to continue using the POS and all features.'
								: 'Your subscription is no longer active. Please renew to continue.'}
						</p>
					</div>
					<Button
						size="lg"
						onClick={() => router.push('/subscription')}
						className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white"
					>
						<CreditCard className="mr-2 h-5 w-5" />
						Upgrade Now
					</Button>
				</motion.div>
			</div>
		)
	}

	return (
		<>
			{/* Trial warning banner */}
			{daysRemaining !== null && daysRemaining <= 3 && (
				<motion.div
					initial={{ opacity: 0, y: -10 }}
					animate={{ opacity: 1, y: 0 }}
					className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 flex items-center gap-3"
				>
					<Clock className="h-5 w-5 text-amber-400 shrink-0" />
					<p className="text-sm text-amber-200 flex-1">
						Your trial expires in <strong>{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</strong>. Upgrade to keep using Nova POS.
					</p>
					<Button size="sm" onClick={() => router.push('/subscription')} className="shrink-0">
						Upgrade
					</Button>
				</motion.div>
			)}
			{children}
		</>
	)
}
