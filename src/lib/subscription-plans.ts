export type SubscriptionPlan = 'trial' | 'basic' | 'pro' | 'enterprise'

export interface SubscriptionPlanDetails {
	id: SubscriptionPlan
	name: string
	description: string
	price: number
	currency: string
	interval: 'month' | 'year'
	features: string[]
	popular?: boolean
}

export const SUBSCRIPTION_PLANS: SubscriptionPlanDetails[] = [
	{
		id: 'trial',
		name: 'Trial',
		description: 'Free trial period',
		price: 0,
		currency: 'INR',
		interval: 'month',
		features: [
			'Full access to all features',
			'30 days free trial',
			'No credit card required',
			'Cancel anytime'
		]
	},
	{
		id: 'basic',
		name: 'Basic',
		description: 'Perfect for small restaurants',
		price: 999,
		currency: 'INR',
		interval: 'month',
		features: [
			'Up to 2 locations',
			'Unlimited orders',
			'Basic analytics',
			'Email support',
			'POS system included'
		]
	},
	{
		id: 'pro',
		name: 'Pro',
		description: 'For growing businesses',
		price: 2499,
		currency: 'INR',
		interval: 'month',
		popular: true,
		features: [
			'Up to 5 locations',
			'Advanced analytics',
			'Inventory management',
			'Customer loyalty program',
			'Priority support',
			'API access'
		]
	},
	{
		id: 'enterprise',
		name: 'Enterprise',
		description: 'For large operations',
		price: 4999,
		currency: 'INR',
		interval: 'month',
		features: [
			'Unlimited locations',
			'Custom integrations',
			'Dedicated account manager',
			'24/7 phone support',
			'Custom reporting',
			'White-label options'
		]
	}
]
