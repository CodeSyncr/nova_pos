'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, Users, Star, Edit, Search, Loader2, CreditCard, Copy } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import { CustomerFormModal } from '@/components/customers/customer-form-modal'
import { createMembershipCard } from '@/app/actions/customers'

type CustomerRow = {
	id: string
	full_name: string
	phone: string | null
	email: string | null
	tags: string[] | null
	loyalty_profiles: Array<{
		points_balance: number
		loyalty_tiers: { name: string }[] | null
	}>
}

export default function CustomersPage() {
	const router = useRouter()
	const { success, error: showError } = useToast()
	const [tenantId, setTenantId] = useState('')
	const [loading, setLoading] = useState(true)
	const [customers, setCustomers] = useState<CustomerRow[]>([])
	const [searchQuery, setSearchQuery] = useState('')

	// Modals
	const [showModal, setShowModal] = useState(false)
	const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null)
	const [creatingCardForId, setCreatingCardForId] = useState<string | null>(null)

	useEffect(() => {
		const checkUser = async () => {
			const supabase = createSupabaseBrowserClient()
			const { data: { user } } = await supabase.auth.getUser()
			if (!user) {
				router.push('/login')
				return
			}

			const { data: pt } = await supabase
				.from('profile_tenants')
				.select('tenant_id')
				.eq('profile_id', user.id)
				.single()

			if (!pt) {
				router.push('/onboarding')
				return
			}

			setTenantId(pt.tenant_id)
		}
		checkUser()
	}, [router])

	const loadCustomers = useCallback(async () => {
		if (!tenantId) return
		try {
			const supabase = createSupabaseBrowserClient()
			const { data, error } = await supabase
				.from('customers')
				.select(
					`
					id,
					full_name,
					phone,
					email,
					tags,
					loyalty_profiles (
						points_balance,
						loyalty_tiers:tier_id ( name )
					)
					`
				)
				.eq('tenant_id', tenantId)
				.order('full_name', { ascending: true })

			if (error) throw new Error(error.message)
			setCustomers((data as unknown as CustomerRow[]) || [])
		} catch (err: any) {
			showError(err.message || 'Failed to load customers')
		} finally {
			setLoading(false)
		}
	}, [tenantId, showError])

	useEffect(() => {
		if (tenantId) loadCustomers()
	}, [tenantId, loadCustomers])

	// Filter customers locally based on search query
	const filteredCustomers = customers.filter((customer) => {
		const query = searchQuery.toLowerCase().trim()
		if (!query) return true

		const nameMatch = customer.full_name?.toLowerCase().includes(query)
		const phoneMatch = customer.phone?.toLowerCase().includes(query)
		const emailMatch = customer.email?.toLowerCase().includes(query)
		return nameMatch || phoneMatch || emailMatch
	})

	if (loading) {
		return (
			<div className="flex flex-col gap-8 py-6">
				<div className="space-y-3">
					<div className="h-6 w-32 rounded-full bg-white/10 animate-pulse" />
					<div className="h-10 w-64 rounded-xl bg-white/10 animate-pulse" />
				</div>
				<div className="h-64 rounded-[32px] border border-white/10 bg-white/5 animate-pulse" />
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-8 py-6">
			<header className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<Badge className="border-white/20 bg-white/10 text-white/80">
						Customers
					</Badge>
					<h1 className="mt-3 text-3xl font-semibold text-white">
						Guest & loyalty graph
					</h1>
					<p className="text-white/60">
						See who your regulars are, how many points they carry, and which
						tier they belong to.
					</p>
				</div>
				<div className="flex gap-3">
					<Button variant="ghost" className="border-white/20 text-white/80">
						<Star className="mr-2 h-4 w-4" />
						View tiers
					</Button>
					<Button onClick={() => { setSelectedCustomer(null); setShowModal(true) }}>
						<Plus className="mr-2 h-4 w-4" />
						New customer
					</Button>
				</div>
			</header>

			<section className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
				<div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
					<div className="flex items-center gap-2">
						<Users className="h-4 w-4 text-white/60" />
						<p className="text-sm text-white/70">
							{filteredCustomers.length} customer{filteredCustomers.length === 1 ? '' : 's'} found
						</p>
					</div>

					<div className="relative w-full max-w-xs">
						<Search className="absolute left-3 top-2.5 h-4 w-4 text-white/40" />
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="w-full rounded-xl border border-white/10 bg-black/30 pl-9 pr-4 py-2 text-sm text-white placeholder-white/30 focus:border-white/30 focus:outline-none transition-colors"
							placeholder="Search by name, phone or email..."
						/>
					</div>
				</div>

				<div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#070A1C]/60">
					<table className="min-w-full text-sm text-white/80 text-left">
						<thead className="bg-white/5 text-xs uppercase tracking-[0.25em] text-white/50 border-b border-white/10">
							<tr>
								<th className="px-5 py-3.5">Name</th>
								<th className="px-5 py-3.5">Contact</th>
								<th className="px-5 py-3.5">Tags</th>
								<th className="px-5 py-3.5 text-center">Card</th>
								<th className="px-5 py-3.5 text-right">Points</th>
								<th className="px-5 py-3.5 text-right">Tier</th>
								<th className="px-5 py-3.5 text-right">Action</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-white/5">
							{filteredCustomers.map((customer) => {
								const loyalty = customer.loyalty_profiles?.[0] ?? null
								const hasCard = !!loyalty
								const points = loyalty?.points_balance ?? 0
								const tierName = loyalty?.loyalty_tiers?.[0]?.name ?? '—'
								return (
									<tr
										key={customer.id}
										className="hover:bg-white/[0.02] transition-colors"
									>
										<td className="px-5 py-4">
											<div className="flex flex-col">
												<span className="font-semibold text-white">
													{customer.full_name}
												</span>
											</div>
										</td>
										<td className="px-5 py-4">
											<div className="flex flex-col text-xs text-white/60">
												{customer.phone && <span>{customer.phone}</span>}
												{customer.email && <span>{customer.email}</span>}
											</div>
										</td>
										<td className="px-5 py-4">
											<div className="flex flex-wrap gap-1">
												{customer.tags?.map((tag) => (
													<span
														key={tag}
														className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/60"
													>
														{tag}
													</span>
												))}
											</div>
										</td>
										<td className="px-5 py-4 text-center">
											{hasCard ? (
												<span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
													<CreditCard className="h-2.5 w-2.5" />
													Member
												</span>
											) : (
												<div className="flex items-center justify-center gap-1.5">
													<span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
														No Card
													</span>
													<button
														disabled={creatingCardForId === customer.id}
														onClick={async () => {
															setCreatingCardForId(customer.id)
															try {
																const result = await createMembershipCard(customer.id, tenantId)
																if (result.alreadyExists) {
																	success('Customer already has a membership card')
																} else {
																	success(`Membership card created! Tier: ${result.tierName}`)
																}
																await loadCustomers()
															} catch (err: any) {
																showError(err.message || 'Failed to create card')
															} finally {
																setCreatingCardForId(null)
															}
														}}
														className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/60 hover:bg-white/10 hover:text-white/90 transition-colors disabled:opacity-40"
													>
														{creatingCardForId === customer.id ? '...' : '+ Create'}
													</button>
												</div>
											)}
										</td>
										<td className="px-5 py-4 text-right font-medium text-white">
											{points}
										</td>
										<td className="px-5 py-4 text-right text-white/85">
											{tierName}
										</td>
										<td className="px-5 py-4 text-right">
											<div className="flex justify-end items-center gap-2">
												<Button
													variant="ghost"
													size="sm"
													onClick={() => {
														const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
														const base = isLocal ? 'http://localhost:8000' : 'https://pizzeriacafe.in'
														const url = `${base}/membership.html?id=${customer.id}`
														navigator.clipboard.writeText(url)
														success('Card link copied to clipboard!')
													}}
													className="h-8 w-8 p-0 border border-white/10 hover:bg-white/10 text-white/80"
													title="Copy Membership Card Link"
												>
													<Copy className="h-3.5 w-3.5" />
												</Button>

												<Button
													asChild
													variant="ghost"
													size="sm"
													className="h-8 w-8 p-0 border border-white/10 hover:bg-white/10 text-white/80"
													title="View Digital Card"
												>
													<a 
														href={(() => {
															const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
															const base = isLocal ? 'http://localhost:8000' : 'https://pizzeriacafe.in'
															return `${base}/membership.html?id=${customer.id}`
														})()} 
														target="_blank" 
														rel="noreferrer"
													>
														<CreditCard className="h-3.5 w-3.5" />
													</a>
												</Button>

												<Button
													variant="ghost"
													size="sm"
													onClick={() => { setSelectedCustomer(customer); setShowModal(true) }}
													className="h-8 border border-white/10 hover:bg-white/10 text-xs text-white/80"
												>
													<Edit className="mr-1 h-3.5 w-3.5" />
													Edit
												</Button>
											</div>
										</td>
									</tr>
								)
							})}
							{filteredCustomers.length === 0 && (
								<tr>
									<td
										colSpan={7}
										className="px-5 py-12 text-center text-sm text-white/60"
									>
										No customers found. Start by attaching guests to orders from
										the POS or creating them here.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>

			{showModal && (
				<CustomerFormModal
					tenantId={tenantId}
					customer={selectedCustomer}
					onClose={() => setShowModal(false)}
					onSave={loadCustomers}
				/>
			)}
		</div>
	)
}
