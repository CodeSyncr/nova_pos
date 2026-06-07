'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
	Save,
	Database,
	RefreshCw,
	CheckCircle2,
	AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
	syncOrdersFromFirebaseClient,
	syncMenuItemsFromFirebaseClient,
	checkSyncedOrders
} from '@/app/actions/firebase-sync'
import { updateTenantSettings } from '@/app/actions/settings'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import {
	getFirestore,
	collection,
	query,
	where,
	getDocs,
	Timestamp
} from 'firebase/firestore'
import { FirebaseSyncSelectionModal } from './firebase-sync-selection-modal'
import { useToast } from '@/components/ui/toast'

type FirebaseSyncTabProps = {
	tenantId: string
	onRefresh: () => void
}

export function FirebaseSyncTab({ tenantId, onRefresh }: FirebaseSyncTabProps) {
	const [formData, setFormData] = useState({
		apiKey: '',
		authDomain: '',
		projectId: '',
		storageBucket: '',
		messagingSenderId: '',
		appId: '',
		ordersCollection: 'orders', // Default collection name
		menuItemsCollection: 'menuItems', // Default collection name
		dateFrom: '',
		dateTo: ''
	})
	const [saving, setSaving] = useState(false)
	const { success, error: showError, warning, info } = useToast()
	const [syncResult, setSyncResult] = useState<{
		success: boolean
		message: string
		ordersSynced?: number
	} | null>(null)
	const [menuItemsSyncResult, setMenuItemsSyncResult] = useState<{
		success: boolean
		message: string
		itemsSynced?: number
		categoriesSynced?: number
	} | null>(null)

	// Selection modal state
	const [showOrdersModal, setShowOrdersModal] = useState(false)
	const [showMenuItemsModal, setShowMenuItemsModal] = useState(false)
	const [fetchedOrders, setFetchedOrders] = useState<any[]>([])
	const [fetchedMenuItems, setFetchedMenuItems] = useState<any[]>([])
	const [loadingItems, setLoadingItems] = useState(false)

	const handleSaveConfig = async (e: React.FormEvent) => {
		e.preventDefault()
		setSaving(true)

		try {
			// Get current tenant settings first
			const supabase = createSupabaseBrowserClient()
			const { data: tenant } = await supabase
				.from('tenants')
				.select('settings')
				.eq('id', tenantId)
				.single()

			const currentSettings =
				(tenant?.settings as Record<string, unknown>) || {}

			// Save to tenant settings, preserving existing values
			await updateTenantSettings(tenantId, {
				currency: (currentSettings.currency as string) || 'INR',
				currencySymbol: (currentSettings.currencySymbol as string) || '₹',
				locale: (currentSettings.locale as string) || 'en-IN',
				timezone: (currentSettings.timezone as string) || 'Asia/Kolkata',
				taxRate: (currentSettings.taxRate as number) || 0,
				monthStartDay: (currentSettings.monthStartDay as number) || 1,
				monthEndDay: (currentSettings.monthEndDay as number) || 0,
				firebaseConfig: {
					apiKey: formData.apiKey,
					authDomain: formData.authDomain,
					projectId: formData.projectId,
					storageBucket: formData.storageBucket,
					messagingSenderId: formData.messagingSenderId,
					appId: formData.appId,
					ordersCollection: formData.ordersCollection,
					menuItemsCollection: formData.menuItemsCollection
				}
			})

			// Also save to localStorage as backup
			localStorage.setItem('firebase_config', JSON.stringify(formData))
			success('Firebase configuration saved!')
			onRefresh()
		} catch (error) {
			console.error('Error saving Firebase config:', error)
			showError('Failed to save Firebase configuration')
		} finally {
			setSaving(false)
		}
	}

	const fetchOrdersFromFirebase = async () => {
		if (!formData.apiKey || !formData.projectId) {
			warning('Please configure Firebase connection first')
			return
		}

		setLoadingItems(true)

		try {
			// Initialize Firebase app
			let app: FirebaseApp
			const existingApp = getApps().find(
				(a) => a.options.projectId === formData.projectId
			)

			if (existingApp) {
				app = existingApp
			} else {
				app = initializeApp({
					apiKey: formData.apiKey,
					authDomain: formData.authDomain,
					projectId: formData.projectId,
					storageBucket: formData.storageBucket,
					messagingSenderId: formData.messagingSenderId,
					appId: formData.appId
				})
			}

			const db = getFirestore(app)
			const ordersRef = collection(db, formData.ordersCollection)

			// Build query with date filters if provided
			let q = query(ordersRef)

			if (formData.dateFrom || formData.dateTo) {
				if (formData.dateFrom && !formData.dateTo) {
					q = query(
						ordersRef,
						where(
							'createdAt',
							'>=',
							Timestamp.fromDate(new Date(formData.dateFrom))
						)
					)
				} else if (!formData.dateFrom && formData.dateTo) {
					const endDate = new Date(formData.dateTo)
					endDate.setHours(23, 59, 59, 999)
					q = query(
						ordersRef,
						where('createdAt', '<=', Timestamp.fromDate(endDate))
					)
				} else if (formData.dateFrom) {
					q = query(
						ordersRef,
						where(
							'createdAt',
							'>=',
							Timestamp.fromDate(new Date(formData.dateFrom))
						)
					)
				}
			}

			// Fetch orders from Firebase
			const snapshot = await getDocs(q)
			const firebaseOrders: any[] = []

			snapshot.forEach((doc) => {
				const data = doc.data()
				// Filter by date range in memory if both dates provided
				if (formData.dateFrom && formData.dateTo) {
					const orderDate =
						data.createdAt?.toDate?.() ||
						data.timestamp?.toDate?.() ||
						data.date
					if (orderDate) {
						const date =
							orderDate instanceof Date ? orderDate : new Date(orderDate)
						const fromDate = new Date(formData.dateFrom)
						const toDate = new Date(formData.dateTo)
						toDate.setHours(23, 59, 59, 999)
						if (date < fromDate || date > toDate) {
							return // Skip this order
						}
					}
				}
				firebaseOrders.push({
					id: doc.id,
					...data
				})
			})

			if (firebaseOrders.length === 0) {
				info('No orders found in Firebase for the specified criteria')
				setLoadingItems(false)
				return
			}

			// Check which orders are already synced
			const orderIds = firebaseOrders
				.map((order) => order.id)
				.filter((id): id is string => !!id)
			
			if (orderIds.length === 0) {
				warning('No valid order IDs found in Firebase orders')
				setLoadingItems(false)
				return
			}

			const syncedOrderIds = await checkSyncedOrders(tenantId, orderIds)

			// Filter out already synced orders - only keep orders that are NOT in the synced set
			const unsyncedOrders = firebaseOrders.filter((order) => {
				if (!order.id) return false // Skip orders without IDs
				return !syncedOrderIds.has(order.id) // Keep only if NOT synced
			})

			if (unsyncedOrders.length === 0) {
				info(
					`All ${firebaseOrders.length} orders have already been synced. No new orders to sync.`
				)
				setLoadingItems(false)
				return
			}

			setFetchedOrders(unsyncedOrders)
			setShowOrdersModal(true)
		} catch (error) {
			console.error('Error fetching orders:', error)
			showError(
				error instanceof Error
					? error.message
					: 'Failed to fetch orders from Firebase'
			)
		} finally {
			setLoadingItems(false)
		}
	}

	const handleSyncSelectedOrders = async (selectedOrders: any[]) => {
		// Helper function to recursively convert Firestore Timestamps to plain objects
		const convertTimestamps = (obj: any): any => {
			if (obj === null || obj === undefined) {
				return obj
			}

			// Check if it's a Firestore Timestamp
			if (typeof obj === 'object' && typeof obj.toDate === 'function') {
				const date = obj.toDate()
				return {
					seconds: Math.floor(date.getTime() / 1000),
					nanoseconds: (date.getTime() % 1000) * 1000000
				}
			}

			// Check if it's a Date object
			if (obj instanceof Date) {
				return obj.toISOString()
			}

			// If it's an array, convert each element
			if (Array.isArray(obj)) {
				return obj.map(convertTimestamps)
			}

			// If it's a plain object, convert all properties
			if (typeof obj === 'object' && obj.constructor === Object) {
				const converted: any = {}
				for (const key in obj) {
					if (Object.prototype.hasOwnProperty.call(obj, key)) {
						converted[key] = convertTimestamps(obj[key])
					}
				}
				return converted
			}

			// Return primitive values as-is
			return obj
		}

		// Convert Firestore timestamps to plain objects for server action
		const ordersToSync = selectedOrders.map((order) => {
			return convertTimestamps(order)
		})

		// Log orders being sent to sync
		console.log('=== CLIENT: Sending orders to sync ===')
		console.log(`Number of orders: ${ordersToSync.length}`)
		console.log('Orders JSON:', JSON.stringify(ordersToSync, null, 2))

		// Send to server action
		const result = await syncOrdersFromFirebaseClient(tenantId, ordersToSync)
		
		console.log('=== CLIENT: Sync result ===')
		console.log('Result:', JSON.stringify(result, null, 2))

		setSyncResult({
			success: result.success,
			message: result.message,
			ordersSynced: result.ordersSynced
		})

		return result
	}

	const fetchMenuItemsFromFirebase = async () => {
		if (!formData.apiKey || !formData.projectId) {
			warning('Please configure Firebase connection first')
			return
		}

		setLoadingItems(true)

		try {
			// Initialize Firebase app
			let app: FirebaseApp
			const existingApp = getApps().find(
				(a) => a.options.projectId === formData.projectId
			)

			if (existingApp) {
				app = existingApp
			} else {
				app = initializeApp({
					apiKey: formData.apiKey,
					authDomain: formData.authDomain,
					projectId: formData.projectId,
					storageBucket: formData.storageBucket,
					messagingSenderId: formData.messagingSenderId,
					appId: formData.appId
				})
			}

			const db = getFirestore(app)
			const menuItemsRef = collection(db, formData.menuItemsCollection)

			// Fetch menu items from Firebase
			const snapshot = await getDocs(menuItemsRef)
			const firebaseMenuItems: any[] = []

			snapshot.forEach((doc) => {
				firebaseMenuItems.push({
					id: doc.id,
					...doc.data()
				})
			})

			if (firebaseMenuItems.length === 0) {
				info('No menu items found in Firebase for the specified collection')
				setLoadingItems(false)
				return
			}

			setFetchedMenuItems(firebaseMenuItems)
			setShowMenuItemsModal(true)
		} catch (error) {
			console.error('Error fetching menu items:', error)
			showError(
				error instanceof Error
					? error.message
					: 'Failed to fetch menu items from Firebase'
			)
		} finally {
			setLoadingItems(false)
		}
	}

	const handleSyncSelectedMenuItems = async (selectedMenuItems: any[]) => {
		// Helper function to recursively convert Firestore Timestamps to plain objects
		const convertTimestamps = (obj: any): any => {
			if (obj === null || obj === undefined) {
				return obj
			}

			// Check if it's a Firestore Timestamp
			if (typeof obj === 'object' && typeof obj.toDate === 'function') {
				const date = obj.toDate()
				return {
					seconds: Math.floor(date.getTime() / 1000),
					nanoseconds: (date.getTime() % 1000) * 1000000
				}
			}

			// Check if it's a Date object
			if (obj instanceof Date) {
				return obj.toISOString()
			}

			// If it's an array, convert each element
			if (Array.isArray(obj)) {
				return obj.map(convertTimestamps)
			}

			// If it's a plain object, convert all properties
			if (typeof obj === 'object' && obj.constructor === Object) {
				const converted: any = {}
				for (const key in obj) {
					if (Object.prototype.hasOwnProperty.call(obj, key)) {
						converted[key] = convertTimestamps(obj[key])
					}
				}
				return converted
			}

			// Return primitive values as-is
			return obj
		}

		// Convert Firestore timestamps to plain objects for server action
		const menuItemsToSync = selectedMenuItems.map((item) => {
			return convertTimestamps(item)
		})

		// Send to server action
		const result = await syncMenuItemsFromFirebaseClient(
			tenantId,
			menuItemsToSync
		)

		setMenuItemsSyncResult({
			success: result.success,
			message: result.message,
			itemsSynced: result.itemsSynced,
			categoriesSynced: result.categoriesSynced
		})

		return result
	}

	// Load saved config on mount
	useEffect(() => {
		const loadConfig = async () => {
			try {
				// Try to load from tenant settings first
				const supabase = createSupabaseBrowserClient()
				const { data: tenant } = await supabase
					.from('tenants')
					.select('settings')
					.eq('id', tenantId)
					.single()

				const settings = (tenant?.settings as Record<string, unknown>) || {}
				const firebaseConfig = settings.firebaseConfig as
					| {
							apiKey?: string
							authDomain?: string
							projectId?: string
							storageBucket?: string
							messagingSenderId?: string
							appId?: string
							ordersCollection?: string
					  }
					| undefined

				if (firebaseConfig) {
					setFormData((prev) => ({
						...prev,
						apiKey: firebaseConfig.apiKey || '',
						authDomain: firebaseConfig.authDomain || '',
						projectId: firebaseConfig.projectId || '',
						storageBucket: firebaseConfig.storageBucket || '',
						messagingSenderId: firebaseConfig.messagingSenderId || '',
						appId: firebaseConfig.appId || '',
						ordersCollection: firebaseConfig.ordersCollection || 'orders',
						menuItemsCollection:
							(firebaseConfig as { menuItemsCollection?: string })
								.menuItemsCollection || 'menuItems'
					}))
				} else {
					// Fallback to localStorage
					const saved = localStorage.getItem('firebase_config')
					if (saved) {
						try {
							const config = JSON.parse(saved)
							setFormData((prev) => ({ ...prev, ...config }))
						} catch (e) {
							console.error('Error loading Firebase config:', e)
						}
					}
				}
			} catch (error) {
				console.error('Error loading Firebase config from tenant:', error)
				// Fallback to localStorage
				const saved = localStorage.getItem('firebase_config')
				if (saved) {
					try {
						const config = JSON.parse(saved)
						setFormData((prev) => ({ ...prev, ...config }))
					} catch (e) {
						console.error('Error loading Firebase config:', e)
					}
				}
			}
		}

		loadConfig()
	}, [tenantId])

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-xl font-semibold text-white">
					Firebase Order Sync
				</h2>
				<p className="text-sm text-white/60">
					Import orders from your previous POS system that used Firebase
				</p>
			</div>

			{/* Firebase Configuration */}
			<motion.div
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				className="rounded-xl border border-white/10 bg-black/20 p-6"
			>
				<div className="mb-4 flex items-center gap-3">
					<Database className="h-5 w-5 text-blue-400" />
					<h3 className="text-lg font-semibold text-white">
						Firebase Configuration
					</h3>
				</div>
				<form onSubmit={handleSaveConfig} className="space-y-4">
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								API Key *
							</label>
							<input
								type="text"
								value={formData.apiKey}
								onChange={(e) =>
									setFormData({ ...formData, apiKey: e.target.value })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="AIza..."
								required
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Auth Domain *
							</label>
							<input
								type="text"
								value={formData.authDomain}
								onChange={(e) =>
									setFormData({ ...formData, authDomain: e.target.value })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="your-project.firebaseapp.com"
								required
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Project ID *
							</label>
							<input
								type="text"
								value={formData.projectId}
								onChange={(e) =>
									setFormData({ ...formData, projectId: e.target.value })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="your-project-id"
								required
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Storage Bucket
							</label>
							<input
								type="text"
								value={formData.storageBucket}
								onChange={(e) =>
									setFormData({ ...formData, storageBucket: e.target.value })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="your-project.appspot.com"
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Messaging Sender ID
							</label>
							<input
								type="text"
								value={formData.messagingSenderId}
								onChange={(e) =>
									setFormData({
										...formData,
										messagingSenderId: e.target.value
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="123456789"
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								App ID
							</label>
							<input
								type="text"
								value={formData.appId}
								onChange={(e) =>
									setFormData({ ...formData, appId: e.target.value })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="1:123456789:web:abc123"
							/>
						</div>
					</div>
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Orders Collection Name
							</label>
							<input
								type="text"
								value={formData.ordersCollection}
								onChange={(e) =>
									setFormData({ ...formData, ordersCollection: e.target.value })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="orders"
							/>
							<p className="mt-1 text-xs text-white/60">
								Name of the collection in Firebase where orders are stored
							</p>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Menu Items Collection Name
							</label>
							<input
								type="text"
								value={formData.menuItemsCollection}
								onChange={(e) =>
									setFormData({
										...formData,
										menuItemsCollection: e.target.value
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="menuItems"
							/>
							<p className="mt-1 text-xs text-white/60">
								Name of the collection in Firebase where menu items are stored
							</p>
						</div>
					</div>
					<div className="flex justify-end">
						<Button type="submit" disabled={saving} size="lg">
							<Save className="mr-2 h-4 w-4" />
							{saving ? 'Saving...' : 'Save Configuration'}
						</Button>
					</div>
				</form>
			</motion.div>

			{/* Sync Options */}
			<motion.div
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				className="rounded-xl border border-white/10 bg-black/20 p-6"
			>
				<div className="mb-4 flex items-center gap-3">
					<RefreshCw className="h-5 w-5 text-emerald-400" />
					<h3 className="text-lg font-semibold text-white">Sync Orders</h3>
				</div>
				<div className="space-y-4">
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Date From (Optional)
							</label>
							<input
								type="date"
								value={formData.dateFrom}
								onChange={(e) =>
									setFormData({ ...formData, dateFrom: e.target.value })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							/>
							<p className="mt-1 text-xs text-white/60">
								Leave empty to sync all orders
							</p>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Date To (Optional)
							</label>
							<input
								type="date"
								value={formData.dateTo}
								onChange={(e) =>
									setFormData({ ...formData, dateTo: e.target.value })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							/>
							<p className="mt-1 text-xs text-white/60">
								Leave empty to sync all orders
							</p>
						</div>
					</div>
					<div className="flex items-center gap-4">
						<Button
							type="button"
							onClick={fetchOrdersFromFirebase}
							disabled={loadingItems || !formData.apiKey || !formData.projectId}
							size="lg"
							className="bg-emerald-600 hover:bg-emerald-700"
						>
							<RefreshCw
								className={`mr-2 h-4 w-4 ${loadingItems ? 'animate-spin' : ''}`}
							/>
							{loadingItems ? 'Loading...' : 'Sync Orders from Firebase'}
						</Button>
					</div>
					{syncResult && (
						<motion.div
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							className={`mt-4 rounded-xl border p-4 ${
								syncResult.success
									? 'border-emerald-500/50 bg-emerald-500/10'
									: 'border-red-500/50 bg-red-500/10'
							}`}
						>
							<div className="flex items-start gap-3">
								{syncResult.success ? (
									<CheckCircle2 className="h-5 w-5 text-emerald-400" />
								) : (
									<AlertCircle className="h-5 w-5 text-red-400" />
								)}
								<div className="flex-1">
									<p
										className={`font-medium ${
											syncResult.success ? 'text-emerald-300' : 'text-red-300'
										}`}
									>
										{syncResult.message}
									</p>
									{syncResult.success &&
										syncResult.ordersSynced !== undefined && (
											<p className="mt-1 text-sm text-white/70">
												{syncResult.ordersSynced} orders synced successfully
											</p>
										)}
								</div>
							</div>
						</motion.div>
					)}
				</div>
			</motion.div>

			{/* Menu Items Sync */}
			<motion.div
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				className="rounded-xl border border-white/10 bg-black/20 p-6"
			>
				<div className="mb-4 flex items-center gap-3">
					<RefreshCw className="h-5 w-5 text-purple-400" />
					<h3 className="text-lg font-semibold text-white">Sync Menu Items</h3>
				</div>
				<div className="space-y-4">
					<p className="text-sm text-white/70">
						Import menu items, categories, variants, toppings, and ingredients
						from Firebase
					</p>
					<div className="flex items-center gap-4">
						<Button
							type="button"
							onClick={fetchMenuItemsFromFirebase}
							disabled={loadingItems || !formData.apiKey || !formData.projectId}
							size="lg"
							className="bg-purple-600 hover:bg-purple-700"
						>
							<RefreshCw
								className={`mr-2 h-4 w-4 ${loadingItems ? 'animate-spin' : ''}`}
							/>
							{loadingItems ? 'Loading...' : 'Sync Menu Items from Firebase'}
						</Button>
					</div>
					{menuItemsSyncResult && (
						<motion.div
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							className={`mt-4 rounded-xl border p-4 ${
								menuItemsSyncResult.success
									? 'border-emerald-500/50 bg-emerald-500/10'
									: 'border-red-500/50 bg-red-500/10'
							}`}
						>
							<div className="flex items-start gap-3">
								{menuItemsSyncResult.success ? (
									<CheckCircle2 className="h-5 w-5 text-emerald-400" />
								) : (
									<AlertCircle className="h-5 w-5 text-red-400" />
								)}
								<div className="flex-1">
									<p
										className={`font-medium ${
											menuItemsSyncResult.success
												? 'text-emerald-300'
												: 'text-red-300'
										}`}
									>
										{menuItemsSyncResult.message}
									</p>
									{menuItemsSyncResult.success &&
										(menuItemsSyncResult.itemsSynced !== undefined ||
											menuItemsSyncResult.categoriesSynced !== undefined) && (
											<p className="mt-1 text-sm text-white/70">
												{menuItemsSyncResult.itemsSynced || 0} menu items
												synced, {menuItemsSyncResult.categoriesSynced || 0}{' '}
												categories synced
											</p>
										)}
								</div>
							</div>
						</motion.div>
					)}
				</div>
			</motion.div>

			{/* Instructions */}
			<motion.div
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				className="rounded-xl border border-white/10 bg-blue-500/10 p-6"
			>
				<h3 className="mb-3 text-lg font-semibold text-white">How to Sync</h3>
				<ol className="list-decimal space-y-2 pl-5 text-sm text-white/70">
					<li>
						Get your Firebase configuration from Firebase Console → Project
						Settings → General → Your apps
					</li>
					<li>Enter your Firebase configuration details above</li>
					<li>
						Specify the collection name where orders are stored (default:
						"orders")
					</li>
					<li>
						Optionally set a date range to sync only specific orders, or leave
						empty to sync all
					</li>
					<li>Click "Sync Orders from Firebase" to import orders</li>
				</ol>
				<p className="mt-4 text-xs text-white/60">
					Note: Orders will be imported with status "completed" and linked to
					your current tenant. Duplicate orders (based on timestamp and total)
					will be skipped. Menu items will create categories, items, variants,
					toppings, and ingredients as needed.
				</p>
			</motion.div>

			{/* Selection Modals */}
			<FirebaseSyncSelectionModal
				isOpen={showOrdersModal}
				onClose={() => setShowOrdersModal(false)}
				items={fetchedOrders}
				type="orders"
				onSync={handleSyncSelectedOrders}
				onSuccess={() => {
					onRefresh()
					setSyncResult({
						success: true,
						message: 'Orders synced successfully',
						ordersSynced: fetchedOrders.length
					})
				}}
			/>

			<FirebaseSyncSelectionModal
				isOpen={showMenuItemsModal}
				onClose={() => setShowMenuItemsModal(false)}
				items={fetchedMenuItems}
				type="menuItems"
				onSync={handleSyncSelectedMenuItems}
				onSuccess={() => {
					onRefresh()
					setMenuItemsSyncResult({
						success: true,
						message: 'Menu items synced successfully',
						itemsSynced: fetchedMenuItems.length
					})
				}}
			/>
		</div>
	)
}
