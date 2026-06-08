'use client'

import { useState } from 'react'
import { Plus, Edit, Trash2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteTopping } from '@/app/actions/menu'
import { ToppingForm } from './topping-form'
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

type Topping = {
	id: string
	name: string
	description: string | null
	price: number
	category: string | null // comma-separated category ids or null
}

type Category = {
	id: string
	name: string
}

type ToppingsTabProps = {
	tenantId: string
	toppings: Topping[]
	categories?: Category[]
	onRefresh: () => void
	currencySymbol: string
	readOnly?: boolean
}

export function ToppingsTab({
	tenantId,
	toppings,
	categories = [],
	onRefresh,
	currencySymbol,
	readOnly
}: ToppingsTabProps) {
	const [showForm, setShowForm] = useState(false)
	const [editingTopping, setEditingTopping] = useState<Topping | null>(null)

	const handleDelete = async (toppingId: string) => {
		if (!confirm('Are you sure you want to delete this add on?')) return
		try {
			await deleteTopping(toppingId)
			onRefresh()
		} catch (error) {
			alert(error instanceof Error ? error.message : 'Failed to delete add on')
		}
	}

	const groupedToppings = toppings.reduce(
		(acc, topping) => {
			const category = topping.category || 'Uncategorized'
			if (!acc[category]) acc[category] = []
			acc[category].push(topping)
			return acc
		},
		{} as Record<string, Topping[]>
	)

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-semibold text-white">Add Ons</h2>
					<p className="text-white/60">
						Manage extra add ons that can be added to menu items
					</p>
				</div>
				<Button onClick={() => setShowForm(true)}>
					<Plus className="mr-2 h-4 w-4" />
					New Add On
				</Button>
			</div>

			{toppings.length === 0 ? (
				<div className="rounded-[28px] border border-dashed border-white/20 bg-white/5 p-10 text-center backdrop-blur-2xl">
					<Sparkles className="mx-auto h-10 w-10 text-white/50" />
					<h3 className="mt-4 text-xl font-semibold text-white">
						No add ons yet
					</h3>
					<p className="mt-2 text-white/60">
						Create add ons that customers can add to their orders
					</p>
					<Button className="mt-6" onClick={() => setShowForm(true)}>
						<Plus className="mr-2 h-4 w-4" />
						Add On
					</Button>
				</div>
			) : (
				<div className="space-y-6">
					{Object.entries(groupedToppings).map(
						([category, categoryToppings]) => (
							<div key={category}>
								<h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-white/50">
									{category
										.split(',')
										.map((id) => id.trim())
										.filter(Boolean)
										.map(
											(id) =>
												categories.find((c) => c.id === id)?.name ||
												'Uncategorized'
										)
										.join(' • ')}
								</h3>
								<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
									{categoryToppings.map((topping) => (
										<div
											key={topping.id}
											className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-2xl"
										>
											<div className="flex items-start justify-between">
												<div className="flex-1">
													<h4 className="text-lg font-semibold text-white">
														{topping.name}
													</h4>
													{topping.description && (
														<p className="mt-1 text-sm text-white/60">
															{topping.description}
														</p>
													)}
													<p className="mt-2 text-lg font-semibold text-white">
														{currencySymbol}
														{topping.price.toFixed(2)}
													</p>
												</div>
												<div className="flex gap-1">
													<Button
														size="icon"
														variant="ghost"
														className="border border-white/15 bg-white/5 text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
														onClick={() => {
															setEditingTopping(topping)
															setShowForm(true)
														}}
													>
														<Edit className="h-4 w-4" />
													</Button>
													<AlertDialog>
														<AlertDialogTrigger asChild>
															<Button
																size="icon"
																variant="ghost"
																className="border border-white/15 bg-white/5 text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
															>
																<Trash2 className="h-4 w-4" />
															</Button>
														</AlertDialogTrigger>
														<AlertDialogContent>
															<AlertDialogHeader>
																<AlertDialogTitle>
									Delete "{topping.name}" add on?
								</AlertDialogTitle>
								<AlertDialogDescription>
									This add on will no longer be available on
																	menu items. This action cannot be undone.
																</AlertDialogDescription>
															</AlertDialogHeader>
															<AlertDialogFooter>
																<AlertDialogCancel>
																	Keep add on
																</AlertDialogCancel>
																<AlertDialogAction
																	onClick={() => handleDelete(topping.id)}
																>
																	Delete
																</AlertDialogAction>
															</AlertDialogFooter>
														</AlertDialogContent>
													</AlertDialog>
												</div>
											</div>
										</div>
									))}
								</div>
							</div>
						)
					)}
				</div>
			)}

			{showForm && (
				<ToppingForm
					tenantId={tenantId}
					topping={editingTopping}
					categories={categories}
					onClose={() => {
						setShowForm(false)
						setEditingTopping(null)
					}}
					onSuccess={onRefresh}
					currencySymbol={currencySymbol}
				/>
			)}
		</div>
	)
}
