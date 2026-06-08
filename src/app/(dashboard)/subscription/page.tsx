'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
	CheckCircle2,
	XCircle,
	Calendar,
	CreditCard,
	AlertCircle,
	Check,
	X,
	Loader2
} from 'lucide-react'
import {
	updateSubscription,
	cancelSubscription,
	reactivateSubscription,
	createRazorpayOrder,
	verifyAndActivateSubscription,
	type Subscription
} from '@/app/actions/subscription'
import {
	SUBSCRIPTION_PLANS,
	type SubscriptionPlan
} from '@/lib/subscription-plans'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

export default function SubscriptionPage() {
	const router = useRouter()
	const toast = useToast()
	const [loading, setLoading] = useState(true)
	const [subscription, setSubscription] = useState<Subscription | null>(null)
	const [tenantId, setTenantId] = useState<string | null>(null)
	const [currencySymbol, setCurrencySymbol] = useState('₹')
	const [canceling, setCanceling] = useState(false)
	const [reactivating, setReactivating] = useState(false)

	useEffect(() => {
		loadSubscription()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const loadSubscription = async () => {
		const supabase = createSupabaseBrowserClient()
		const {
			data: { user }
		} = await supabase.auth.getUser()

		if (!user) {
			router.push('/login')
			return
		}

		const { data: tenantRow } = await supabase
			.from('profile_tenants')
			.select('tenant_id, tenant:tenants(settings, subscription)')
			.eq('profile_id', user.id)
			.single()

		if (!tenantRow) {
			router.push('/tenant')
			return
		}

		const tenant = Array.isArray(tenantRow.tenant)
			? tenantRow.tenant[0]
			: tenantRow.tenant

		setTenantId(tenantRow.tenant_id)

		// Get currency symbol
		const settings = (tenant?.settings as Record<string, unknown>) || {}
		const currency = (settings.currencySymbol as string) || '₹'
		setCurrencySymbol(currency)

		// Get subscription
		const currentSubscription = (tenant?.subscription as Subscription) || null
		setSubscription(currentSubscription)
		setLoading(false)
	}

	const handleUpgrade = async (planId: SubscriptionPlan) => {
		if (!tenantId) return

		try {
			// Create Razorpay order
			const orderResult = await createRazorpayOrder(tenantId, planId)

			if (!orderResult.success || !orderResult.orderId) {
				toast.error(orderResult.error || 'Failed to create payment order')
				return
			}

			// Load Razorpay script if not loaded
			if (!(window as any).Razorpay) {
				await new Promise<void>((resolve, reject) => {
					const script = document.createElement('script')
					script.src = 'https://checkout.razorpay.com/v1/checkout.js'
					script.onload = () => resolve()
					script.onerror = () => reject(new Error('Failed to load Razorpay'))
					document.body.appendChild(script)
				})
			}

			const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId)

			// Open Razorpay checkout
			const options = {
				key: orderResult.keyId,
				amount: orderResult.amount,
				currency: orderResult.currency,
				name: 'Nova POS',
				description: `${plan?.name || planId} Plan - Monthly`,
				order_id: orderResult.orderId,
				handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
					// Verify payment and activate subscription
					try {
						const verifyResult = await verifyAndActivateSubscription(tenantId, planId, {
							razorpayOrderId: response.razorpay_order_id,
							razorpayPaymentId: response.razorpay_payment_id,
							razorpaySignature: response.razorpay_signature
						})

						if (verifyResult.success) {
							toast.success('Payment successful! Your plan has been upgraded.')
							loadSubscription()
						} else {
							toast.error(verifyResult.error || 'Payment verification failed')
						}
					} catch (err: any) {
						toast.error(err.message || 'Payment verification failed')
					}
				},
				prefill: {},
				theme: {
					color: '#6366F1'
				},
				modal: {
					ondismiss: () => {
						toast.info('Payment cancelled')
					}
				}
			}

			const razorpay = new (window as any).Razorpay(options)
			razorpay.open()
		} catch (error: any) {
			toast.error(error.message || 'Failed to initiate payment')
		}
	}

	const handleCancel = async () => {
		if (!tenantId) return

		setCanceling(true)
		try {
			await cancelSubscription(tenantId)
			toast.success('Subscription will be canceled at the end of the period')
			loadSubscription()
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Failed to cancel subscription'
			)
		} finally {
			setCanceling(false)
		}
	}

	const handleReactivate = async () => {
		if (!tenantId) return

		setReactivating(true)
		try {
			await reactivateSubscription(tenantId)
			toast.success('Subscription reactivated successfully')
			loadSubscription()
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Failed to reactivate subscription'
			)
		} finally {
			setReactivating(false)
		}
	}

	const getStatusBadge = (status: string) => {
		switch (status) {
			case 'trial':
				return (
					<Badge className="border-blue-400/50 bg-blue-400/10 text-blue-300">
						<Calendar className="mr-1.5 h-3 w-3" />
						Trial
					</Badge>
				)
			case 'active':
				return (
					<Badge className="border-emerald-400/50 bg-emerald-400/10 text-emerald-300">
						<CheckCircle2 className="mr-1.5 h-3 w-3" />
						Active
					</Badge>
				)
			case 'past_due':
				return (
					<Badge className="border-yellow-400/50 bg-yellow-400/10 text-yellow-300">
						<AlertCircle className="mr-1.5 h-3 w-3" />
						Past Due
					</Badge>
				)
			case 'canceled':
			case 'expired':
				return (
					<Badge className="border-red-400/50 bg-red-400/10 text-red-300">
						<XCircle className="mr-1.5 h-3 w-3" />
						{status === 'canceled' ? 'Canceled' : 'Expired'}
					</Badge>
				)
			default:
				return null
		}
	}

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		})
	}

	if (loading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="h-16 w-16 animate-spin rounded-full border-4 border-white/20 border-t-white"></div>
			</div>
		)
	}

	const currentPlan = subscription
		? SUBSCRIPTION_PLANS.find((p) => p.id === subscription.plan)
		: null

	return (
		<div className="mx-auto w-full max-w-7xl space-y-8 p-6">
			{/* Header */}
			<div>
				<h1 className="text-3xl font-bold text-white">Subscription</h1>
				<p className="mt-2 text-white/60">
					Manage your subscription and billing preferences
				</p>
			</div>

			{/* Current Subscription */}
			{subscription && (
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6 backdrop-blur-xl"
				>
					<div className="mb-6 flex items-start justify-between">
						<div>
							<div className="mb-2 flex items-center gap-3">
								<h2 className="text-xl font-semibold text-white">
									Current Plan
								</h2>
								{getStatusBadge(subscription.status)}
							</div>
							{currentPlan && (
								<p className="text-white/60">{currentPlan.description}</p>
							)}
						</div>
						{subscription.cancelAtPeriodEnd && (
							<Badge className="border-yellow-400/50 bg-yellow-400/10 text-yellow-300">
								Cancels on {formatDate(subscription.currentPeriodEnd)}
							</Badge>
						)}
					</div>

					<div className="grid gap-4 md:grid-cols-3">
						<div className="rounded-lg border border-white/10 bg-white/5 p-4">
							<div className="mb-1 text-xs text-white/50">Current Plan</div>
							<div className="text-lg font-semibold text-white">
								{currentPlan?.name || subscription.plan}
							</div>
						</div>
						<div className="rounded-lg border border-white/10 bg-white/5 p-4">
							<div className="mb-1 text-xs text-white/50">Period Start</div>
							<div className="text-lg font-semibold text-white">
								{formatDate(subscription.currentPeriodStart)}
							</div>
						</div>
						<div className="rounded-lg border border-white/10 bg-white/5 p-4">
							<div className="mb-1 text-xs text-white/50">Period End</div>
							<div className="text-lg font-semibold text-white">
								{formatDate(subscription.currentPeriodEnd)}
							</div>
						</div>
					</div>

					{subscription.status === 'active' && (
						<div className="mt-6 flex gap-3">
							{subscription.cancelAtPeriodEnd ? (
								<Button
									onClick={handleReactivate}
									disabled={reactivating}
									className="bg-emerald-500 hover:bg-emerald-600"
								>
									{reactivating ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Reactivating...
										</>
									) : (
										<>
											<CheckCircle2 className="mr-2 h-4 w-4" />
											Reactivate Subscription
										</>
									)}
								</Button>
							) : (
								<Button
									onClick={handleCancel}
									disabled={canceling}
									variant="ghost"
									className="border border-red-400/20 text-red-400 hover:bg-red-400/10"
								>
									{canceling ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Canceling...
										</>
									) : (
										<>
											<X className="mr-2 h-4 w-4" />
											Cancel Subscription
										</>
									)}
								</Button>
							)}
						</div>
					)}
				</motion.div>
			)}

			{/* Available Plans */}
			<div>
				<h2 className="mb-6 text-2xl font-semibold text-white">
					Available Plans
				</h2>
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
					{SUBSCRIPTION_PLANS.map((plan) => {
						const isCurrentPlan = subscription?.plan === plan.id
						const isUpgrade =
							subscription &&
							subscription.plan !== 'enterprise' &&
							plan.id !== 'trial' &&
							plan.id !== subscription.plan

						return (
							<motion.div
								key={plan.id}
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								className={cn(
									'relative rounded-2xl border p-6 transition-all',
									plan.popular
										? 'border-emerald-400/50 bg-gradient-to-br from-emerald-400/10 to-emerald-400/5'
										: 'border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01]',
									isCurrentPlan && 'ring-2 ring-emerald-400/50'
								)}
							>
								{plan.popular && (
									<div className="absolute -top-3 left-1/2 -translate-x-1/2">
										<Badge className="border-emerald-400/50 bg-emerald-400/20 text-emerald-300">
											Most Popular
										</Badge>
									</div>
								)}
								{isCurrentPlan && (
									<div className="absolute -top-3 right-4">
										<Badge className="border-emerald-400/50 bg-emerald-400/20 text-emerald-300">
											Current
										</Badge>
									</div>
								)}

								<div className="mb-4">
									<h3 className="text-xl font-bold text-white">{plan.name}</h3>
									<p className="mt-1 text-sm text-white/60">
										{plan.description}
									</p>
								</div>

								<div className="mb-6">
									<div className="flex items-baseline gap-2">
										<span className="text-3xl font-bold text-white">
											{currencySymbol}
											{plan.price.toLocaleString()}
										</span>
										<span className="text-white/60">
											/{plan.interval === 'month' ? 'mo' : 'yr'}
										</span>
									</div>
								</div>

								<ul className="mb-6 space-y-2">
									{plan.features.map((feature, index) => (
										<li key={index} className="flex items-start gap-2">
											<Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
											<span className="text-sm text-white/80">{feature}</span>
										</li>
									))}
								</ul>

								{isCurrentPlan ? (
									<Button disabled className="w-full" variant="ghost">
										Current Plan
									</Button>
								) : plan.id === 'trial' ? (
									<Button disabled className="w-full" variant="ghost">
										Trial Only
									</Button>
								) : (
									<Button
										onClick={() => handleUpgrade(plan.id)}
										className={cn(
											'w-full',
											plan.popular
												? 'bg-emerald-500 hover:bg-emerald-600'
												: 'border border-white/10 bg-white/5 hover:bg-white/10'
										)}
										variant={plan.popular ? 'default' : 'ghost'}
									>
										{isUpgrade ? 'Upgrade' : 'Select Plan'}
									</Button>
								)}
							</motion.div>
						)
					})}
				</div>
			</div>

			{/* Payment Info */}
			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6 backdrop-blur-xl"
			>
				<div className="mb-4 flex items-center justify-between">
					<div>
						<h2 className="text-xl font-semibold text-white">Payment</h2>
						<p className="mt-1 text-sm text-white/60">
							Payments are securely processed via Razorpay
						</p>
					</div>
					<CreditCard className="h-5 w-5 text-white/40" />
				</div>

				<div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
					<p className="text-sm text-white/70">
						When you upgrade, Razorpay checkout will open for secure payment via UPI, cards, net banking, or wallets.
					</p>
					{subscription?.razorpayPaymentId && (
						<p className="text-xs text-white/50">
							Last payment: {subscription.razorpayPaymentId}
						</p>
					)}
				</div>
			</motion.div>
		</div>
	)
}
