'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, ChefHat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { deleteSOP } from '@/app/actions/menu'
import { SOPForm } from './sop-form'
import { CustomSelect } from '@/components/ui/select'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger
} from '@/components/ui/alert-dialog'

type SOPStep = {
	title: string
	body: string | null
	step_order: number
	media?: unknown
}

type SOP = {
	id: string
	menu_item_id: string
	steps: SOPStep[]
	name?: string | null
	menu_item: { id: string; name: string } | null
}

type MenuItem = {
	id: string
	name: string
}

type SOPTabProps = {
	tenantId: string
	sops: SOP[]
	menuItems: MenuItem[]
	onRefresh: () => void
	readOnly?: boolean
}

export function SOPTab({ tenantId, sops, menuItems, onRefresh, readOnly }: SOPTabProps) {
	const [showForm, setShowForm] = useState(false)
	const [editingSOP, setEditingSOP] = useState<SOP | null>(null)
	const [selectedMenuItemId, setSelectedMenuItemId] = useState<string | null>(
		null
	)
	const [activeSopByItem, setActiveSopByItem] = useState<Record<string, string>>(
		() => {
			const initial: Record<string, string> = {}
			for (const sop of sops) {
				if (!initial[sop.menu_item_id]) {
					initial[sop.menu_item_id] = sop.id
				}
			}
			return initial
		}
	)

	useEffect(() => {
		// Reset active selections when SOP list changes
		const next: Record<string, string> = {}
		for (const sop of sops) {
			if (!next[sop.menu_item_id]) {
				next[sop.menu_item_id] = sop.id
			}
		}
		setActiveSopByItem(next)
	}, [sops])

	const handleDelete = async (sopId: string) => {
		if (!confirm('Are you sure you want to delete this SOP?')) return
		try {
			await deleteSOP(sopId)
			onRefresh()
		} catch (error) {
			alert(error instanceof Error ? error.message : 'Failed to delete SOP')
		}
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-semibold text-white">SOP</h2>
					<p className="text-white/60">
						Standard Operating Procedures for preparing menu items
					</p>
				</div>
				<Button onClick={() => setShowForm(true)}>
					<Plus className="mr-2 h-4 w-4" />
					New SOP
				</Button>
			</div>

			{sops.length === 0 ? (
				<div className="rounded-[28px] border border-dashed border-white/20 bg-white/5 p-10 text-center backdrop-blur-2xl">
					<ChefHat className="mx-auto h-10 w-10 text-white/50" />
					<h3 className="mt-4 text-xl font-semibold text-white">No SOPs yet</h3>
					<p className="mt-2 text-white/60">
						Create step-by-step instructions for preparing menu items
					</p>
					<Button className="mt-6" onClick={() => setShowForm(true)}>
						<Plus className="mr-2 h-4 w-4" />
						Add SOP
					</Button>
				</div>
			) : (
				<div className="space-y-6">
					{menuItems
						.map((menuItem) => {
							const sopsForItem = sops.filter(
								(sop) => sop.menu_item_id === menuItem.id
							)
							if (sopsForItem.length === 0) return null
							const activeId =
								activeSopByItem[menuItem.id] || sopsForItem[0].id
							const activeSop =
								sopsForItem.find((s) => s.id === activeId) ||
								sopsForItem[0]
							const sortedSteps = [...activeSop.steps].sort(
								(a, b) => a.step_order - b.step_order
							)
							return (
								<div
									key={menuItem.id}
									className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl"
								>
									<div className="mb-4 flex items-center justify-between gap-4">
										<div className="min-w-0 flex-1">
											<h3 className="text-xl font-semibold text-white">
												{menuItem.name}
											</h3>
											{sortedSteps.length > 0 && (
												<p className="mt-1 text-xs text-white/60">
													{sortedSteps.length} step
													{sortedSteps.length > 1 ? 's' : ''} in selected SOP
												</p>
											)}
										</div>
										{ sopsForItem.length > 1 && (
											<CustomSelect
												value={activeId}
												onChange={(val) =>
													setActiveSopByItem((prev) => ({
														...prev,
														[menuItem.id]: val
													}))
												}
												options={sopsForItem.map((sop, index) => ({
													value: sop.id,
													label: sop.name?.trim() || `SOP ${index + 1}`
												}))}
												placeholder="Select SOP"
												className="max-w-[220px]"
											/>
										)}
										<div className="flex gap-2">
											<Button
												variant="ghost"
												size="sm"
												className="border border-white/15 bg-white/5 text-white/80 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
												onClick={() => {
													setEditingSOP(activeSop)
													setShowForm(true)
												}}
											>
												<Edit className="mr-2 h-4 w-4" />
												Edit
											</Button>
											<AlertDialog>
												<AlertDialogTrigger asChild>
													<Button
														variant="ghost"
														size="sm"
														className="border border-white/15 bg-white/5 text-white/80 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
													>
														<Trash2 className="mr-2 h-4 w-4" />
														Delete
													</Button>
												</AlertDialogTrigger>
												<AlertDialogContent>
													<AlertDialogHeader>
														<AlertDialogTitle>
															Delete SOP for “{menuItem.name}”?
														</AlertDialogTitle>
														<AlertDialogDescription>
															This SOP version for this menu item will be removed.
															This action cannot be undone.
														</AlertDialogDescription>
													</AlertDialogHeader>
													<AlertDialogFooter>
														<AlertDialogCancel>Keep SOP</AlertDialogCancel>
														<AlertDialogAction
															onClick={() => handleDelete(activeSop.id)}
														>
															Delete
														</AlertDialogAction>
													</AlertDialogFooter>
												</AlertDialogContent>
											</AlertDialog>
										</div>
									</div>
									<div className="space-y-3">
										{sortedSteps.map((step, index) => (
											<div
												key={index}
												className="flex items-start gap-4 rounded-2xl border border-white/10 bg-[#070A1C]/60 p-4"
											>
												<Badge className="border-white/20 bg-white/10 text-white/80">
													Step {step.step_order}
												</Badge>
												<div className="flex-1">
													<h4 className="font-semibold text-white">
														{step.title}
													</h4>
													{step.body && (
														<p className="mt-1 text-sm text-white/60">
															{step.body}
														</p>
													)}
												</div>
											</div>
										))}
									</div>
								</div>
							)
						})}
				</div>
			)}

			{showForm && (
				<SOPForm
					tenantId={tenantId}
					menuItems={menuItems}
					sop={editingSOP}
					selectedMenuItemId={selectedMenuItemId}
					onClose={() => {
						setShowForm(false)
						setEditingSOP(null)
						setSelectedMenuItemId(null)
					}}
					onSuccess={onRefresh}
				/>
			)}
		</div>
	)
}
