'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Save, Flame, Database, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { updateTenantSettings } from '@/app/actions/settings'

type Tenant = {
	id: string
	name: string
	settings: Record<string, unknown> | null
}

type FirebaseSyncTabProps = {
	tenant: Tenant
	onRefresh: () => void
}

type FirebaseConfig = {
	apiKey: string
	authDomain: string
	projectId: string
	storageBucket: string
	messagingSenderId: string
	appId: string
	ordersCollection: string
	menuItemsCollection: string
	customersCollection: string
}

export function FirebaseSyncTab({ tenant, onRefresh }: FirebaseSyncTabProps) {
	const settings = tenant.settings || {}
	const existing = (settings.firebaseConfig as Partial<FirebaseConfig>) ?? {}

	const [formData, setFormData] = useState<FirebaseConfig>({
		apiKey: existing.apiKey || '',
		authDomain: existing.authDomain || '',
		projectId: existing.projectId || '',
		storageBucket: existing.storageBucket || '',
		messagingSenderId: existing.messagingSenderId || '',
		appId: existing.appId || '',
		ordersCollection: existing.ordersCollection || 'orders',
		menuItemsCollection: existing.menuItemsCollection || 'menuItems',
		customersCollection: existing.customersCollection || 'customers'
	})

	const [saving, setSaving] = useState(false)
	const [showApiKey, setShowApiKey] = useState(false)
	const [showAppId, setShowAppId] = useState(false)
	const { success, error: showError } = useToast()

	const isConfigured =
		!!existing.apiKey && !!existing.projectId && !!existing.ordersCollection

	const handleChange = (field: keyof FirebaseConfig, value: string) => {
		setFormData((prev) => ({ ...prev, [field]: value }))
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setSaving(true)

		try {
			await updateTenantSettings(tenant.id, {
				firebaseConfig: {
					...formData,
					ordersCollection: formData.ordersCollection || 'orders'
				}
			})
			success('Firebase sync settings saved!')
			onRefresh()
		} catch (err) {
			console.error('Error saving Firebase config:', err)
			showError('Failed to save Firebase settings')
		} finally {
			setSaving(false)
		}
	}

	const inputClass =
		'w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none transition-colors font-mono text-sm'

	return (
		<div className="space-y-8">
			{/* Header */}
			<div className="flex items-start justify-between">
				<div>
					<h2 className="text-xl font-semibold text-white">Firebase Sync</h2>
					<p className="mt-1 text-sm text-white/60">
						Connect your Firebase project to sync orders, menu items, and customers in real-time
					</p>
				</div>

				{/* Status badge */}
				<div
					className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium ${
						isConfigured
							? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
							: 'border-white/10 bg-white/5 text-white/50'
					}`}
				>
					{isConfigured ? (
						<>
							<CheckCircle className="h-4 w-4" />
							Connected
						</>
					) : (
						<>
							<AlertCircle className="h-4 w-4" />
							Not configured
						</>
					)}
				</div>
			</div>

			<form onSubmit={handleSubmit} className="space-y-6">
				{/* Firebase Project Credentials */}
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					className="rounded-2xl border border-white/10 bg-black/20 p-6 space-y-5"
				>
					<div className="flex items-center gap-3 mb-2">
						<div className="rounded-xl bg-orange-500/20 p-2.5">
							<Flame className="h-5 w-5 text-orange-400" />
						</div>
						<div>
							<h3 className="font-semibold text-white">Project Credentials</h3>
							<p className="text-xs text-white/50">
								From your Firebase console → Project settings → Your apps
							</p>
						</div>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						{/* API Key */}
						<div className="md:col-span-2">
							<label className="mb-2 block text-sm font-medium text-white">
								API Key <span className="text-[#E0342A]">*</span>
							</label>
							<div className="relative">
								<input
									type={showApiKey ? 'text' : 'password'}
									value={formData.apiKey}
									onChange={(e) => handleChange('apiKey', e.target.value)}
									className={inputClass + ' pr-10'}
									placeholder="AIzaSy..."
								/>
								<button
									type="button"
									onClick={() => setShowApiKey((v) => !v)}
									className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
								>
									{showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
								</button>
							</div>
						</div>

						{/* Auth Domain */}
						<div>
							<label className="mb-2 block text-sm font-medium text-white">Auth Domain</label>
							<input
								type="text"
								value={formData.authDomain}
								onChange={(e) => handleChange('authDomain', e.target.value)}
								className={inputClass}
								placeholder="your-project.firebaseapp.com"
							/>
						</div>

						{/* Project ID */}
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Project ID <span className="text-[#E0342A]">*</span>
							</label>
							<input
								type="text"
								value={formData.projectId}
								onChange={(e) => handleChange('projectId', e.target.value)}
								className={inputClass}
								placeholder="your-project-id"
							/>
						</div>

						{/* Storage Bucket */}
						<div>
							<label className="mb-2 block text-sm font-medium text-white">Storage Bucket</label>
							<input
								type="text"
								value={formData.storageBucket}
								onChange={(e) => handleChange('storageBucket', e.target.value)}
								className={inputClass}
								placeholder="your-project.appspot.com"
							/>
						</div>

						{/* Messaging Sender ID */}
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Messaging Sender ID
							</label>
							<input
								type="text"
								value={formData.messagingSenderId}
								onChange={(e) => handleChange('messagingSenderId', e.target.value)}
								className={inputClass}
								placeholder="123456789012"
							/>
						</div>

						{/* App ID */}
						<div className="md:col-span-2">
							<label className="mb-2 block text-sm font-medium text-white">App ID</label>
							<div className="relative">
								<input
									type={showAppId ? 'text' : 'password'}
									value={formData.appId}
									onChange={(e) => handleChange('appId', e.target.value)}
									className={inputClass + ' pr-10'}
									placeholder="1:123456789012:web:abc123..."
								/>
								<button
									type="button"
									onClick={() => setShowAppId((v) => !v)}
									className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
								>
									{showAppId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
								</button>
							</div>
						</div>
					</div>
				</motion.div>

				{/* Firestore Collections */}
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.1 }}
					className="rounded-2xl border border-white/10 bg-black/20 p-6 space-y-5"
				>
					<div className="flex items-center gap-3 mb-2">
						<div className="rounded-xl bg-blue-500/20 p-2.5">
							<Database className="h-5 w-5 text-blue-400" />
						</div>
						<div>
							<h3 className="font-semibold text-white">Firestore Collections</h3>
							<p className="text-xs text-white/50">
								Specify the Firestore collection names to sync with
							</p>
						</div>
					</div>

					<div className="grid gap-4 md:grid-cols-3">
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Orders Collection <span className="text-[#E0342A]">*</span>
							</label>
							<input
								type="text"
								value={formData.ordersCollection}
								onChange={(e) => handleChange('ordersCollection', e.target.value)}
								className={inputClass}
								placeholder="orders"
							/>
							<p className="mt-1 text-xs text-white/40">Real-time order sync</p>
						</div>

						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Menu Items Collection
							</label>
							<input
								type="text"
								value={formData.menuItemsCollection}
								onChange={(e) => handleChange('menuItemsCollection', e.target.value)}
								className={inputClass}
								placeholder="menuItems"
							/>
							<p className="mt-1 text-xs text-white/40">Menu catalogue sync</p>
						</div>

						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Customers Collection
							</label>
							<input
								type="text"
								value={formData.customersCollection}
								onChange={(e) => handleChange('customersCollection', e.target.value)}
								className={inputClass}
								placeholder="customers"
							/>
							<p className="mt-1 text-xs text-white/40">Customer data sync</p>
						</div>
					</div>
				</motion.div>

				{/* Info banner */}
				<div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
					<span className="font-medium text-white/80">Tip:</span> Your Firebase credentials are
					stored securely in your tenant settings. You can find them in the Firebase console under{' '}
					<span className="font-mono text-white/80">Project Settings → General → Your apps</span>.
				</div>

				<div className="flex justify-end">
					<Button type="submit" disabled={saving} size="lg">
						<Save className="mr-2 h-4 w-4" />
						{saving ? 'Saving...' : 'Save Firebase Config'}
					</Button>
				</div>
			</form>
		</div>
	)
}
