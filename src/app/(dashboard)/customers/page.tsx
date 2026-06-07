import { redirect } from 'next/navigation'
import { createSupabaseServerComponentClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, Users, Star } from 'lucide-react'

type TenantRecord = {
	id: string
	name: string
	settings: Record<string, unknown> | null
}

type ProfileTenantRow = {
	tenant_id: string
	tenant: TenantRecord | null
}

type CustomerRow = {
	id: string
	full_name: string
	phone: string | null
	email: string | null
	tags: string[] | null
	loyalty_profiles: Array<{
		points_balance: number
		loyalty_tiers: { name: string } | null
	}>
}

export default async function CustomersPage() {
	const supabase = await createSupabaseServerComponentClient()
	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		redirect('/login')
	}

	const { data: tenantRow, error } = await supabase
		.from('profile_tenants')
		.select(
			`
        tenant_id,
        tenant:tenant_id (
          id,
          name,
          settings
        )
      `
		)
		.eq('profile_id', user.id)
		.single<ProfileTenantRow>()

	const tenant = tenantRow?.tenant ?? null

	if (error || !tenant) {
		redirect('/tenant')
	}

	const { data: customers } = await supabase
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
		.eq('tenant_id', tenant.id)
		.order('full_name', { ascending: true })

	const rows = (customers as CustomerRow[]) || []

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
					<Button variant="outline" className="border-white/20 text-white/80">
						<Star className="mr-2 h-4 w-4" />
						View tiers
					</Button>
					<Button>
						<Plus className="mr-2 h-4 w-4" />
						New customer
					</Button>
				</div>
			</header>

			<section className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
				<div className="mb-4 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Users className="h-4 w-4 text-white/60" />
						<p className="text-sm text-white/70">
							{rows.length} customer{rows.length === 1 ? '' : 's'} tracked
						</p>
					</div>
				</div>
				<div className="overflow-hidden rounded-2xl border border-white/10 bg-[#070A1C]/60">
					<table className="min-w-full text-sm text-white/80">
						<thead className="bg-white/5 text-xs uppercase tracking-[0.25em] text-white/50">
							<tr>
								<th className="px-4 py-3 text-left">Name</th>
								<th className="px-4 py-3 text-left">Contact</th>
								<th className="px-4 py-3 text-left">Tags</th>
								<th className="px-4 py-3 text-right">Points</th>
								<th className="px-4 py-3 text-right">Tier</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((customer) => {
								const loyalty = customer.loyalty_profiles?.[0] ?? null
								const points = loyalty?.points_balance ?? 0
								const tierName = loyalty?.loyalty_tiers?.name ?? '—'
								return (
									<tr
										key={customer.id}
										className="border-t border-white/5 hover:bg-white/5"
									>
										<td className="px-4 py-3">
											<div className="flex flex-col">
												<span className="font-medium text-white">
													{customer.full_name}
												</span>
											</div>
										</td>
										<td className="px-4 py-3">
											<div className="flex flex-col text-xs text-white/60">
												{customer.phone && <span>{customer.phone}</span>}
												{customer.email && <span>{customer.email}</span>}
											</div>
										</td>
										<td className="px-4 py-3">
											<div className="flex flex-wrap gap-1">
												{customer.tags?.map((tag) => (
													<span
														key={tag}
														className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-white/60"
													>
														{tag}
													</span>
												))}
											</div>
										</td>
										<td className="px-4 py-3 text-right text-white">
											{points}
										</td>
										<td className="px-4 py-3 text-right text-white/80">
											{tierName}
										</td>
									</tr>
								)
							})}
							{rows.length === 0 && (
								<tr>
									<td
										colSpan={5}
										className="px-4 py-10 text-center text-sm text-white/60"
									>
										No customers yet. Start by attaching guests to orders from
										the POS or creating them here.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	)
}


