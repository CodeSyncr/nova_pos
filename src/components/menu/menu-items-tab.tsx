'use client'

import { useState, useEffect } from 'react'
import {
	Plus,
	Edit,
	Trash2,
	ChefHat,
	ChevronDown,
	ChevronUp
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { deleteMenuItem } from '@/app/actions/menu'
import { MenuItemForm } from './menu-item-form'
import { useToast } from '@/components/ui/toast'
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

type MenuCategory = {
	id: string
	name: string
	position: number
}

type MenuItem = {
	id: string
	name: string
	description: string | null
	base_price: number
	discount_price: number | null
	image_url: string | null
	is_active: boolean
	is_vegan: boolean
	category_id: string
	prep_time_minutes: number | null
	allergen_info: string | null
	nutrition: {
		calories: number
		protein: number
		fat: number
		carbs: number
	} | null
	menu_item_variants: Array<{
		id: string
		name: string
		price_modifier: number
		is_default?: boolean
	}>
	menu_item_toppings: Array<{ topping_id: string }>
	menu_item_ingredients: Array<{ ingredient_id: string }>
}

type SOP = {
	id: string
	menu_item_id: string
	steps: Array<{
		title: string
		body: string | null
		step_order: number
	}>
}

type MenuItemsTabProps = {
	tenantId: string
	categories: MenuCategory[]
	menuItems: MenuItem[]
	availableToppings: Array<{ id: string; name: string; price: number }>
	ingredients: Array<{ id: string; name: string }>
	sops: SOP[]
	onRefresh: () => void
	currencySymbol: string
	readOnly?: boolean
}

export function MenuItemsTab({
	tenantId,
	categories,
	menuItems,
	availableToppings,
	ingredients,
	sops = [],
	onRefresh,
	currencySymbol,
	readOnly
}: MenuItemsTabProps) {
	const [showForm, setShowForm] = useState(false)
	const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
	const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
		new Set()
	)
	const toast = useToast()

	// Expand first category by default (only on initial mount)
	const [initialized, setInitialized] = useState(false)
	useEffect(() => {
		if (categories.length > 0 && !initialized) {
			const sortedCategories = [...categories].sort(
				(a, b) => a.position - b.position
			)
			const firstCategoryId = sortedCategories[0].id
			setExpandedCategories(new Set([firstCategoryId]))
			setInitialized(true)
		}
	}, [categories, initialized])

	const toggleCategory = (categoryId: string) => {
		setExpandedCategories((prev) => {
			const next = new Set(prev)
			if (next.has(categoryId)) {
				next.delete(categoryId)
			} else {
				next.add(categoryId)
			}
			return next
		})
	}

	const handleDelete = async (itemId: string) => {
		try {
			await deleteMenuItem(itemId)
			onRefresh()
			toast.success('Menu item deleted successfully')
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Failed to delete menu item'
			)
		}
	}

	const groupedItems = menuItems.reduce(
		(acc, item) => {
			const categoryId = item.category_id
			if (!acc[categoryId]) acc[categoryId] = []
			acc[categoryId].push(item)
			return acc
		},
		{} as Record<string, MenuItem[]>
	)

	// Sort categories by position before displaying
	const sortedCategoryEntries = Object.entries(groupedItems).sort(
		([categoryIdA], [categoryIdB]) => {
			const categoryA = categories.find((c) => c.id === categoryIdA)
			const categoryB = categories.find((c) => c.id === categoryIdB)
			const positionA = categoryA?.position ?? 999
			const positionB = categoryB?.position ?? 999
			return positionA - positionB
		}
	)

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-semibold text-white">Menu Items</h2>
					<p className="text-white/60">
						Create and manage your menu items with variants and add ons
					</p>
				</div>
				{!readOnly && (
					<Button onClick={() => setShowForm(true)}>
						<Plus className="mr-2 h-4 w-4" />
						New Menu Item
					</Button>
				)}
			</div>

			{menuItems.length === 0 ? (
				<div className="rounded-[28px] border border-dashed border-white/20 bg-white/5 p-10 text-center backdrop-blur-2xl">
					<ChefHat className="mx-auto h-10 w-10 text-white/50" />
					<h3 className="mt-4 text-xl font-semibold text-white">
						No menu items yet
					</h3>
					<p className="mt-2 text-white/60">
						Start by creating your first menu item
					</p>
					<Button className="mt-6" onClick={() => setShowForm(true)}>
						<Plus className="mr-2 h-4 w-4" />
						Add Menu Item
					</Button>
				</div>
			) : (
				<div className="space-y-4">
					{sortedCategoryEntries.map(([categoryId, items]) => {
						const category = categories.find((c) => c.id === categoryId)
						const isExpanded = expandedCategories.has(categoryId)

						return (
							<div
								key={categoryId}
								className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-2xl overflow-hidden"
							>
								<button
									onClick={() => toggleCategory(categoryId)}
									className="w-full border-b border-white/10 bg-white/5 px-6 py-4 flex items-center justify-between hover:bg-white/10 transition-colors"
								>
									<div className="flex items-center gap-3">
										{isExpanded ? (
											<ChevronUp className="h-4 w-4 text-white/60" />
										) : (
											<ChevronDown className="h-4 w-4 text-white/60" />
										)}
										<div className="text-left">
											<h3 className="text-lg font-semibold text-white">
												{category?.name || 'Uncategorized'}
											</h3>
											<p className="text-xs text-white/50 mt-1">
												{items.length} item{items.length !== 1 ? 's' : ''}
											</p>
										</div>
									</div>
								</button>
								<AnimatePresence>
									{isExpanded && (
										<motion.div
											initial={{ height: 0, opacity: 0 }}
											animate={{ height: 'auto', opacity: 1 }}
											exit={{ height: 0, opacity: 0 }}
											transition={{ duration: 0.2 }}
											className="divide-y divide-white/5 overflow-hidden"
										>
											{items.map((item) => {
												const ingredientNames = item.menu_item_ingredients
													.map((entry) => {
														const ingredient = ingredients.find(
															(i) => i.id === entry.ingredient_id
														)
														return ingredient?.name
													})
													.filter((name): name is string => Boolean(name))
												const sop = sops?.find(
													(s) => s.menu_item_id === item.id
												)

												return (
													<div
														key={item.id}
														className="group hover:bg-white/5 transition-colors"
													>
														<div className="flex items-center gap-4 p-4">
															{/* Image */}
															{item.image_url ? (
																<div className="flex-shrink-0">
																	<div className="h-16 w-16 overflow-hidden rounded-lg border border-white/10">
																		<img
																			src={item.image_url}
																			alt={item.name}
																			className="h-full w-full object-cover"
																		/>
																	</div>
																</div>
															) : (
																<div className="flex-shrink-0 h-16 w-16 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center">
																	<ChefHat className="h-6 w-6 text-white/30" />
																</div>
															)}

															{/* Main Content */}
															<div className="flex-1 min-w-0">
																<div className="flex items-start justify-between gap-4">
																	<div className="flex-1 min-w-0">
																		<div className="flex items-center gap-2 mb-1">
																			<h4 className="text-base font-semibold text-white truncate">
																				{item.name}
																			</h4>
																			<Badge
																				className={`flex-shrink-0 ${
																					item.is_active
																						? 'border-white/20 bg-white/10 text-white'
																						: 'border-white/20 bg-white/10 text-white/80'
																				}`}
																			>
																				{item.is_active ? 'Live' : 'Draft'}
																			</Badge>
																			{item.is_vegan && (
																				<Badge className="border-green-500/30 bg-green-500/15 text-green-400 flex-shrink-0">
																					🌱 Vegan
																				</Badge>
																			)}
																		</div>
																		{item.description && (
																			<p className="text-sm text-white/60 line-clamp-1 mb-2">
																				{item.description}
																			</p>
																		)}
																		<div className="flex items-center gap-4 flex-wrap">
																			<div className="flex items-baseline gap-1">
																				{item.discount_price ? (
																					<>
																						<span className="text-lg font-semibold text-white">
																							{currencySymbol}
																							{item.discount_price.toFixed(2)}
																						</span>
																						<span className="text-sm text-white/50 line-through">
																							{currencySymbol}
																							{item.base_price.toFixed(2)}
																						</span>
																					</>
																				) : (
																					<span className="text-lg font-semibold text-white">
																						{currencySymbol}
																						{item.base_price.toFixed(2)}
																					</span>
																				)}
																			</div>
																			{item.prep_time_minutes && (
																				<span className="text-xs text-white/50">
																					⏱ {item.prep_time_minutes} min
																				</span>
																			)}
																			{item.allergen_info && (
																				<span className="text-xs text-white/50">
																					⚠️ {item.allergen_info}
																				</span>
																			)}
																		</div>
																		<div className="flex flex-wrap gap-2 mt-2">
																			{item.menu_item_variants.length > 0 && (
																				<Badge className="border-white/20 bg-white/10 text-xs text-white/80">
																					{item.menu_item_variants.length}{' '}
																					variant
																					{item.menu_item_variants.length !== 1
																						? 's'
																						: ''}
																				</Badge>
																			)}
																			{item.menu_item_toppings.length > 0 && (
																				<Badge className="border-white/20 bg-white/10 text-xs text-white/80">
																					{item.menu_item_toppings.length} add
																					on
																					{item.menu_item_toppings.length !== 1
																						? 's'
																						: ''}
																				</Badge>
																			)}
																			{ingredientNames.length > 0 && (
																				<Badge className="border-white/20 bg-white/10 text-xs text-white/80">
																					{ingredientNames.length} ingredient
																					{ingredientNames.length !== 1
																						? 's'
																						: ''}
																				</Badge>
																			)}
																			{sop?.steps.length ? (
																				<Badge className="border-[#E0342A]/30 bg-[#E0342A]/10 text-xs text-[#E0342A]">
																					{sop.steps.length} SOP step
																					{sop.steps.length !== 1 ? 's' : ''}
																				</Badge>
																			) : null}
																		</div>
																	</div>
																	{/* Actions */}
																	{!readOnly && (
																	<div className="flex-shrink-0 flex items-center gap-2">
																		<Button
																			size="sm"
																			variant="ghost"
																			className="border border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white h-8 w-8 p-0"
																			onClick={() => {
																				setEditingItem(item)
																				setShowForm(true)
																			}}
																		>
																			<Edit className="h-3.5 w-3.5" />
																		</Button>
																		<AlertDialog>
																			<AlertDialogTrigger asChild>
																				<Button
																					size="sm"
																					variant="ghost"
																					className="border border-white/15 bg-white/5 text-white/70 hover:bg-[#E0342A]/10 hover:border-[#E0342A]/30 hover:text-[#E0342A] h-8 w-8 p-0"
																				>
																					<Trash2 className="h-3.5 w-3.5" />
																				</Button>
																			</AlertDialogTrigger>
																			<AlertDialogContent>
																				<AlertDialogHeader>
																					<AlertDialogTitle>
																						Delete "{item.name}"?
																					</AlertDialogTitle>
																					<AlertDialogDescription>
																						This menu item will be removed from
																						POS and reports. This action cannot
																						be undone.
																					</AlertDialogDescription>
																				</AlertDialogHeader>
																				<AlertDialogFooter>
																					<AlertDialogCancel>
																						Keep item
																					</AlertDialogCancel>
																					<AlertDialogAction
																						onClick={() =>
																							handleDelete(item.id)
																						}
																					>
																						Delete
																					</AlertDialogAction>
																				</AlertDialogFooter>
																			</AlertDialogContent>
																		</AlertDialog>
																	</div>
																	)}
																</div>
															</div>
														</div>
													</div>
												)
											})}
										</motion.div>
									)}
								</AnimatePresence>
							</div>
						)
					})}
				</div>
			)}

			{showForm && (
				<MenuItemForm
					tenantId={tenantId}
					categories={categories}
					availableToppings={availableToppings}
					availableIngredients={ingredients}
					existingSOPSteps={
						editingItem
							? (sops.find((s) => s.menu_item_id === editingItem.id)?.steps ??
								[])
							: []
					}
					item={
						editingItem
							? {
									...editingItem,
									menu_item_variants: editingItem.menu_item_variants.map(
										(v) => ({
											...v,
											is_default: v.is_default ?? false
										})
									)
								}
							: null
					}
					onClose={() => {
						setShowForm(false)
						setEditingItem(null)
					}}
					onSuccess={onRefresh}
				/>
			)}
		</div>
	)
}
