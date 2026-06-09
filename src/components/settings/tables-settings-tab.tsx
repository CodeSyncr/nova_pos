'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Save, LayoutGrid, Users, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { updateTenantSettings } from '@/app/actions/settings'

type Table = {
	id: string
	name: string
	capacity: number
	section: string
}

type Tenant = {
	id: string
	name: string
	settings: Record<string, unknown> | null
}

type TablesSettingsTabProps = {
	tenant: Tenant
	onRefresh: () => void
}

function generateId() {
	return Math.random().toString(36).slice(2, 9)
}

export function TablesSettingsTab({ tenant, onRefresh }: TablesSettingsTabProps) {
	const settings = tenant.settings || {}
	const rawTables = (settings.tables as Table[] | undefined) || []

	const [tables, setTables] = useState<Table[]>(rawTables)
	const [saving, setSaving] = useState(false)
	const { success, error: showError } = useToast()

	const addTable = () => {
		const newTable: Table = {
			id: generateId(),
			name: `T${tables.length + 1}`,
			capacity: 4,
			section: 'Main'
		}
		setTables([...tables, newTable])
	}

	const updateTable = (id: string, field: keyof Table, value: string | number) => {
		setTables(tables.map((t) => (t.id === id ? { ...t, [field]: value } : t)))
	}

	const removeTable = (id: string) => {
		setTables(tables.filter((t) => t.id !== id))
	}

	const handleSave = async () => {
		setSaving(true)
		try {
			await updateTenantSettings(tenant.id, {
				currency: (settings.currency as string) || 'INR',
				currencySymbol: (settings.currencySymbol as string) || '₹',
				locale: (settings.locale as string) || 'en-IN',
				timezone: (settings.timezone as string) || 'Asia/Kolkata',
				taxRate: (settings.taxRate as number) || 0,
				tables
			})
			success('Tables saved successfully!')
			onRefresh()
		} catch (err) {
			console.error(err)
			showError('Failed to save tables')
		} finally {
			setSaving(false)
		}
	}

	// Group by section for display
	const sections = [...new Set(tables.map((t) => t.section || 'Main'))]

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-xl font-semibold text-white">Table Configuration</h2>
					<p className="text-sm text-white/60">
						Define your dining area layout — tables, sections, and seating capacity.
					</p>
				</div>
				<div className="flex gap-3">
					<Button variant="ghost" onClick={addTable} className="border border-white/20">
						<Plus className="mr-2 h-4 w-4" />
						Add Table
					</Button>
					<Button onClick={handleSave} disabled={saving}>
						<Save className="mr-2 h-4 w-4" />
						{saving ? 'Saving…' : 'Save'}
					</Button>
				</div>
			</div>

			{tables.length === 0 ? (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 py-16 text-center"
				>
					<div className="mb-4 rounded-2xl bg-white/5 p-5">
						<LayoutGrid className="h-10 w-10 text-white/30" />
					</div>
					<h3 className="text-lg font-semibold text-white">No tables yet</h3>
					<p className="mt-1 max-w-xs text-sm text-white/50">
						Add tables to enable table selection in the POS. Each table can have a name, section, and capacity.
					</p>
					<Button className="mt-6" onClick={addTable}>
						<Plus className="mr-2 h-4 w-4" /> Add your first table
					</Button>
				</motion.div>
			) : (
				<div className="space-y-8">
					{/* Stats row */}
					<div className="grid grid-cols-3 gap-4">
						{[
							{ label: 'Total Tables', value: tables.length, icon: LayoutGrid },
							{
								label: 'Total Capacity',
								value: tables.reduce((s, t) => s + (t.capacity || 0), 0) + ' seats',
								icon: Users
							},
							{ label: 'Sections', value: sections.length, icon: Tag }
						].map(({ label, value, icon: Icon }) => (
							<div
								key={label}
								className="rounded-2xl border border-white/10 bg-white/5 p-4"
							>
								<div className="flex items-center gap-2 text-white/50">
									<Icon className="h-4 w-4" />
									<span className="text-xs uppercase tracking-wider">{label}</span>
								</div>
								<p className="mt-2 text-2xl font-semibold text-white">{value}</p>
							</div>
						))}
					</div>

					{/* Table editor grid */}
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						<AnimatePresence>
							{tables.map((table) => (
								<motion.div
									key={table.id}
									layout
									initial={{ opacity: 0, scale: 0.95 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.9 }}
									className="group rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-5 transition hover:border-white/20"
								>
									<div className="mb-4 flex items-center justify-between">
										<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E0342A]/15 text-sm font-bold text-[#E0342A]">
											{table.name.slice(0, 2)}
										</div>
										<button
											onClick={() => removeTable(table.id)}
											className="rounded-lg p-1.5 text-white/30 opacity-0 transition hover:bg-[#E0342A]/10 hover:text-[#E0342A] group-hover:opacity-100"
										>
											<Trash2 className="h-4 w-4" />
										</button>
									</div>

									<div className="space-y-3">
										<div>
											<label className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-white/40">
												Table Name
											</label>
											<input
												type="text"
												value={table.name}
												onChange={(e) => updateTable(table.id, 'name', e.target.value)}
												className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
												placeholder="e.g. T1, Patio 2"
											/>
										</div>
										<div className="grid grid-cols-2 gap-3">
											<div>
												<label className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-white/40">
													Capacity
												</label>
												<input
													type="number"
													min={1}
													max={100}
													value={table.capacity}
													onChange={(e) =>
														updateTable(table.id, 'capacity', parseInt(e.target.value) || 1)
													}
													className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white focus:border-white/30 focus:outline-none"
												/>
											</div>
											<div>
												<label className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-white/40">
													Section
												</label>
												<input
													type="text"
													value={table.section}
													onChange={(e) => updateTable(table.id, 'section', e.target.value)}
													className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
													placeholder="Main"
												/>
											</div>
										</div>
									</div>
								</motion.div>
							))}
						</AnimatePresence>
					</div>
				</div>
			)}
		</div>
	)
}
