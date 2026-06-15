'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { X, Save, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CustomSelect } from '@/components/ui/select'
import {
	createMenuItem,
	updateMenuItem,
	linkToppingToMenuItem,
	unlinkToppingFromMenuItem,
	createVariant,
	updateVariant,
	deleteVariant
} from '@/app/actions/menu'

type Category = {
	id: string
	name: string
}

type Topping = {
	id: string
	name: string
	price: number
	category?: string | null
}

type Ingredient = {
	id: string
	name: string
	unit?: string | null
}

type SOPStepPayload = {
	title: string
	body: string | null
	step_order: number
}

type EditableStep = {
	id: string
	title: string
	body: string
}

type MenuItemFormProps = {
	tenantId: string
	categories: Category[]
	availableToppings: Topping[]
	availableIngredients: Ingredient[]
	existingSOPSteps?: SOPStepPayload[]
	item?: {
		id: string
		name: string
		description: string | null
		base_price: number
		discount_price: number | null
		image_url: string | null
		category_id: string
		is_active: boolean
		is_vegan?: boolean
		prep_time_minutes: number | null
		allergen_info: string | null
		nutrition: {
			calories: number
			protein: number
			fat: number
			carbs: number
		} | null
		menu_item_toppings?: Array<{ topping_id: string }>
		menu_item_ingredients?: Array<{ ingredient_id: string }>
		menu_item_variants?: Array<{
			id: string
			name: string
			price_modifier: number
			is_default?: boolean
		}>
	} | null
	onClose: () => void
	onSuccess: () => void
}

const generateId = () =>
	typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: Math.random().toString(36).slice(2)

const emptyStep = (): EditableStep => ({
	id: generateId(),
	title: '',
	body: ''
})

export function MenuItemForm({
	tenantId,
	categories,
	availableToppings,
	availableIngredients,
	existingSOPSteps = [],
	item,
	onClose,
	onSuccess
}: MenuItemFormProps) {
	const [name, setName] = useState(item?.name || '')
	const [description, setDescription] = useState(item?.description || '')
	const [basePrice, setBasePrice] = useState(
		item?.base_price?.toString() || '0'
	)
	const [discountPrice, setDiscountPrice] = useState(
		item?.discount_price?.toString() || ''
	)
	const [imageUrl, setImageUrl] = useState(item?.image_url || '')
	const [categoryId, setCategoryId] = useState(
		item?.category_id || categories[0]?.id || ''
	)
	const [isActive, setIsActive] = useState(item?.is_active ?? true)
	const [prepTime, setPrepTime] = useState(
		item?.prep_time_minutes?.toString() || ''
	)
	const [allergenInfo, setAllergenInfo] = useState(item?.allergen_info || '')
	const [isVegan, setIsVegan] = useState(item?.is_vegan ?? false)

	const [protein, setProtein] = useState(
		item?.nutrition?.protein?.toString() || '0'
	)
	const [fat, setFat] = useState(item?.nutrition?.fat?.toString() || '0')
	const [carbs, setCarbs] = useState(item?.nutrition?.carbs?.toString() || '0')
	const calories = useMemo(() => {
		const p = parseFloat(protein) || 0
		const f = parseFloat(fat) || 0
		const c = parseFloat(carbs) || 0
		return Math.max(0, Math.round(p * 4 + f * 9 + c * 4))
	}, [protein, fat, carbs])

	const [selectedToppings, setSelectedToppings] = useState<string[]>(
		item?.menu_item_toppings?.map((t) => t.topping_id) || []
	)
	const [selectedIngredients, setSelectedIngredients] = useState<string[]>(
		item?.menu_item_ingredients?.map((ing) => ing.ingredient_id) || []
	)

	type Variant = {
		id: string
		name: string
		priceModifier: number
		isDefault: boolean
		isNew?: boolean
	}

	const [variants, setVariants] = useState<Variant[]>(
		item?.menu_item_variants?.map((v) => ({
			id: v.id,
			name: v.name,
			priceModifier: v.price_modifier,
			isDefault: v.is_default ?? false
		})) || []
	)

	const [sopSteps, setSopSteps] = useState<EditableStep[]>(
		existingSOPSteps.length
			? existingSOPSteps
					.sort((a, b) => a.step_order - b.step_order)
					.map((step) => ({
						id: generateId(),
						title: step.title,
						body: step.body || ''
					}))
			: [emptyStep()]
	)

	const [isSubmitting, setIsSubmitting] = useState(false)

	const [ingredientSearch, setIngredientSearch] = useState('')
	const [toppingSearch, setToppingSearch] = useState('')

	const categorySpecificToppings = useMemo(() => {
		return availableToppings.filter((topping) => {
			if (!topping.category) return true
			const ids = topping.category
				.split(',')
				.map((id) => id.trim())
				.filter(Boolean)
			if (ids.length === 0) return true
			return ids.includes(categoryId)
		})
	}, [availableToppings, categoryId])

	const filteredToppings = useMemo(
		() =>
			categorySpecificToppings.filter((t) =>
				t.name.toLowerCase().includes(toppingSearch.toLowerCase())
			),
		[categorySpecificToppings, toppingSearch]
	)

	const nutritionPayload = {
		calories,
		protein: parseFloat(protein) || 0,
		fat: parseFloat(fat) || 0,
		carbs: parseFloat(carbs) || 0
	}

	const sopPayload: SOPStepPayload[] = sopSteps
		.filter((step) => step.title.trim().length > 0)
		.map((step, index) => ({
			title: step.title.trim(),
			body: step.body.trim() || null,
			step_order: index + 1
		}))

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setIsSubmitting(true)

		const payload = {
			categoryId,
			name,
			description,
			basePrice: parseFloat(basePrice) || 0,
			isActive,
			isVegan,
			discountPrice:
				discountPrice.trim() === '' ? null : parseFloat(discountPrice),
			imageUrl: imageUrl.trim() || null,
			prepTime: prepTime.trim() === '' ? null : parseInt(prepTime, 10),
			allergenInfo: allergenInfo.trim() || null,
			ingredients: selectedIngredients,
			nutrition: nutritionPayload,
			sopSteps: sopPayload
		}

		try {
			let menuItemId: string
			if (item) {
				await updateMenuItem(item.id, payload)
				menuItemId = item.id

				const originalToppings =
					item.menu_item_toppings?.map((t) => t.topping_id) || []
				const toRemove = originalToppings.filter(
					(id) => !selectedToppings.includes(id)
				)
				const toAdd = selectedToppings.filter(
					(id) => !originalToppings.includes(id)
				)
				await Promise.all([
					...toRemove.map((id) => unlinkToppingFromMenuItem(item.id, id)),
					...toAdd.map((id) => linkToppingToMenuItem(item.id, id))
				])
			} else {
				const newItem = await createMenuItem(tenantId, payload)
				menuItemId = newItem.id

				for (const toppingId of selectedToppings) {
					await linkToppingToMenuItem(newItem.id, toppingId)
				}
			}

			// Handle variants
			const originalVariants = item?.menu_item_variants || []
			const originalVariantIds = new Set(originalVariants.map((v) => v.id))
			const currentVariantIds = new Set(
				variants.filter((v) => !v.isNew).map((v) => v.id)
			)

			// Delete removed variants
			const toDelete = originalVariants.filter(
				(v) => !currentVariantIds.has(v.id)
			)
			await Promise.all(toDelete.map((v) => deleteVariant(v.id)))

			// Update existing variants
			const toUpdate = variants.filter(
				(v) => !v.isNew && originalVariantIds.has(v.id)
			)
			await Promise.all(
				toUpdate.map((v) => {
					const original = originalVariants.find((ov) => ov.id === v.id)
					if (
						original &&
						(original.name !== v.name ||
							original.price_modifier !== v.priceModifier ||
							(original.is_default ?? false) !== v.isDefault)
					) {
						return updateVariant(v.id, {
							name: v.name,
							priceModifier: v.priceModifier,
							isDefault: v.isDefault
						})
					}
					return Promise.resolve()
				})
			)

			// Create new variants
			const toCreate = variants.filter((v) => v.isNew && v.name.trim())
			await Promise.all(
				toCreate.map((v) =>
					createVariant(menuItemId, {
						name: v.name.trim(),
						priceModifier: v.priceModifier,
						isDefault: v.isDefault
					})
				)
			)

			onSuccess()
			onClose()
		} catch (error) {
			console.error('Error saving menu item:', error)
			alert(error instanceof Error ? error.message : 'Failed to save menu item')
		} finally {
			setIsSubmitting(false)
		}
	}

	const toggleTopping = (toppingId: string) => {
		setSelectedToppings((prev) =>
			prev.includes(toppingId)
				? prev.filter((id) => id !== toppingId)
				: [...prev, toppingId]
		)
	}

	const toggleIngredient = (ingredientId: string) => {
		setSelectedIngredients((prev) =>
			prev.includes(ingredientId)
				? prev.filter((id) => id !== ingredientId)
				: [...prev, ingredientId]
		)
	}

	const addSopStep = () => setSopSteps((steps) => [...steps, emptyStep()])

	const updateStep = (stepId: string, updates: Partial<EditableStep>) => {
		setSopSteps((steps) =>
			steps.map((step) => (step.id === stepId ? { ...step, ...updates } : step))
		)
	}

	const removeStep = (stepId: string) => {
		setSopSteps((steps) =>
			steps.length === 1 ? steps : steps.filter((step) => step.id !== stepId)
		)
	}

	const addVariant = () => {
		setVariants([
			...variants,
			{
				id: generateId(),
				name: '',
				priceModifier: 0,
				isDefault: variants.length === 0,
				isNew: true
			}
		])
	}

	const updateVariantField = (
		variantId: string,
		field: keyof Variant,
		value: string | number | boolean
	) => {
		if (field === 'isDefault' && value === true) {
			// Unset other defaults
			setVariants((prev) =>
				prev.map((v) => ({
					...v,
					isDefault: v.id === variantId
				}))
			)
		} else {
			setVariants((prev) =>
				prev.map((v) => (v.id === variantId ? { ...v, [field]: value } : v))
			)
		}
	}

	const removeVariant = (variantId: string) => {
		setVariants((prev) => prev.filter((v) => v.id !== variantId))
	}

	return (
		<div className="fixed inset-0 z-50">
			<div
				className="absolute inset-0 bg-black/60 backdrop-blur-sm"
				onClick={onClose}
			/>
			<motion.div
				initial={{ opacity: 0, x: 80 }}
				animate={{ opacity: 1, x: 0 }}
				exit={{ opacity: 0, x: 80 }}
				className="absolute right-0 top-0 h-full w-full max-w-3xl overflow-y-auto border-l border-white/10 bg-black p-8 shadow-[0_50px_140px_rgba(3,5,18,0.85)]"
			>
				<div className="flex items-center justify-between">
					<div>
						<p className="text-xs uppercase tracking-[0.4em] text-white/60">
							Menu builder
						</p>
						<h2 className="mt-2 text-3xl font-semibold text-white">
							{item ? 'Edit menu item' : 'Create menu item'}
						</h2>
					</div>
					<Button size="icon" variant="ghost" onClick={onClose}>
						<X className="h-5 w-5" />
					</Button>
				</div>

				<form onSubmit={handleSubmit} className="mt-8 space-y-8 pb-10">
					<section className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-5">
						<div className="grid gap-4 md:grid-cols-2">
							<div>
								<label className="block text-sm font-medium text-white/70 mb-2">
									Name *
								</label>
								<input
									type="text"
									required
									value={name}
									onChange={(e) => setName(e.target.value)}
									className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
									placeholder="e.g., Signature Pasta"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-white/70 mb-2">
									Category *
								</label>
								<CustomSelect
									value={categoryId}
									onChange={setCategoryId}
									options={categories.map((cat) => ({
										value: cat.id,
										label: cat.name
									}))}
									placeholder="Select category"
								/>
							</div>
						</div>

						<div className="grid gap-4 md:grid-cols-2">
							<div>
								<label className="block text-sm font-medium text-white/70 mb-2">
									Base price *
								</label>
								<input
									type="number"
									step="0.01"
									min="0"
									required
									value={basePrice}
									onChange={(e) => setBasePrice(e.target.value)}
									className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-white/70 mb-2">
									Discounted price
								</label>
								<input
									type="number"
									step="0.01"
									min="0"
									value={discountPrice}
									onChange={(e) => setDiscountPrice(e.target.value)}
									className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
									placeholder="Optional sale price"
								/>
							</div>
						</div>

						<div className="grid gap-4 md:grid-cols-2">
							<div>
								<label className="block text-sm font-medium text-white/70 mb-2">
									Image URL
								</label>
								<input
									type="url"
									value={imageUrl}
									onChange={(e) => setImageUrl(e.target.value)}
									className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
									placeholder="https://..."
								/>
								{imageUrl.trim() && (
									<div className="mt-3 overflow-hidden rounded-xl border border-white/10">
										<img
											src={imageUrl}
											alt={name || 'Preview'}
											className="h-40 w-full object-cover"
										/>
									</div>
								)}
							</div>
							<div className="space-y-4">
								<div>
									<label className="block text-sm font-medium text-white/70 mb-2">
										Preparation time (minutes)
									</label>
									<input
										type="number"
										min="0"
										value={prepTime}
										onChange={(e) => setPrepTime(e.target.value)}
										className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
										placeholder="e.g., 12"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-white/70 mb-2">
										Allergen info
									</label>
									<input
										type="text"
										value={allergenInfo}
										onChange={(e) => setAllergenInfo(e.target.value)}
										className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
										placeholder="Contains dairy, gluten"
									/>
								</div>
							</div>
						</div>

						<div>
							<label className="block text-sm font-medium text-white/70 mb-2">
								Description
							</label>
							<textarea
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								rows={3}
								className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none resize-none"
								placeholder="Describe this dish..."
							/>
						</div>

						<div className="flex items-center gap-6">
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									checked={isActive}
									onChange={(e) => setIsActive(e.target.checked)}
									className="h-5 w-5 rounded border-white/20 bg-white/5 text-[#E0342A] focus:ring-2 focus:ring-[#E0342A]/50"
								/>
								<span className="text-sm text-white/70">
									Active (visible in POS)
								</span>
							</label>
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									checked={isVegan}
									onChange={(e) => setIsVegan(e.target.checked)}
									className="h-5 w-5 rounded border-white/20 bg-white/5 text-green-500 focus:ring-2 focus:ring-green-500/50"
								/>
								<span className="text-sm text-white/70">
									🌱 Vegan
								</span>
							</label>
						</div>
					</section>

					<section className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-5">
						<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
							<div>
								<label className="block text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
									Protein (g)
								</label>
								<input
									type="number"
									min="0"
									step="0.1"
									value={protein}
									onChange={(e) => setProtein(e.target.value)}
									className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								/>
							</div>
							<div>
								<label className="block text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
									Fat (g)
								</label>
								<input
									type="number"
									min="0"
									step="0.1"
									value={fat}
									onChange={(e) => setFat(e.target.value)}
									className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								/>
							</div>
							<div>
								<label className="block text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
									Carbs (g)
								</label>
								<input
									type="number"
									min="0"
									step="0.1"
									value={carbs}
									onChange={(e) => setCarbs(e.target.value)}
									className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								/>
							</div>
							<div>
								<label className="block text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
									Calories
								</label>
								<div className="mt-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white">
									{calories} kcal
								</div>
							</div>
						</div>
					</section>

					<section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<p className="text-xs uppercase tracking-[0.3em] text-white/50">
									Ingredients
								</p>
								<p className="text-sm text-white/60">
									Link pantry items to this recipe
								</p>
							</div>
							<div className="w-full sm:w-60">
								<input
									type="text"
									value={ingredientSearch}
									onChange={(e) => setIngredientSearch(e.target.value)}
									placeholder="Search ingredients…"
									className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								/>
							</div>
						</div>
						<div className="max-h-48 overflow-y-auto">
							<div className="flex flex-wrap gap-2">
								{availableIngredients
									.filter((ingredient) =>
										ingredient.name
											.toLowerCase()
											.includes(ingredientSearch.toLowerCase())
									)
									.map((ingredient) => (
										<button
											key={ingredient.id}
											type="button"
											onClick={() => toggleIngredient(ingredient.id)}
											className={cn(
												'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition',
												'border-white/12 bg-white/5 text-white/70 hover:border-white/30 hover:bg-white/10',
												selectedIngredients.includes(ingredient.id) &&
													'border-[#E0342A]/30 bg-[#E0342A]/15 text-white'
											)}
										>
											<span className="h-2 w-2 rounded-full bg-[#E0342A]" />
											<span className="truncate max-w-[120px]">
												{ingredient.name}
											</span>
											{ingredient.unit &&
												!selectedIngredients.includes(ingredient.id) && (
													<span className="text-[10px] text-white/50">
														{ingredient.unit}
													</span>
												)}
										</button>
									))}
								{availableIngredients.length === 0 && (
									<p className="text-xs text-white/50">
										No ingredients yet. Add ingredients in the Ingredients tab.
									</p>
								)}
							</div>
						</div>
					</section>

					<section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="text-xs uppercase tracking-[0.3em] text-white/50">
									Variants (e.g., Pasta Types)
								</p>
								<p className="text-sm text-white/60">
									Add different options like pasta types, sizes, or styles.
								</p>
							</div>
							<Button
								type="button"
								variant="ghost"
								onClick={addVariant}
								className="border border-white/15 bg-white/5 text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
							>
								<Plus className="mr-2 h-4 w-4" />
								Add Variant
							</Button>
						</div>
						<div className="space-y-3">
							{variants.length === 0 ? (
								<p className="text-xs text-white/50">
									No variants yet. Click "Add Variant" to add pasta types or
									other options.
								</p>
							) : (
								variants.map((variant) => (
									<div
										key={variant.id}
										className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
									>
										<div className="flex-1 grid gap-3 md:grid-cols-3">
											<div>
												<label className="block text-xs text-white/60 mb-1">
													Name
												</label>
												<input
													type="text"
													value={variant.name}
													onChange={(e) =>
														updateVariantField(
															variant.id,
															'name',
															e.target.value
														)
													}
													placeholder="e.g., Linguine, Penne"
													className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
												/>
											</div>
											<div>
												<label className="block text-xs text-white/60 mb-1">
													Price Modifier
												</label>
												<input
													type="number"
													step="0.01"
													value={variant.priceModifier}
													onChange={(e) =>
														updateVariantField(
															variant.id,
															'priceModifier',
															parseFloat(e.target.value) || 0
														)
													}
													placeholder="0.00"
													className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
												/>
											</div>
											<div className="flex items-end gap-2">
												<label className="flex items-center gap-2 cursor-pointer">
													<input
														type="checkbox"
														checked={variant.isDefault}
														onChange={(e) =>
															updateVariantField(
																variant.id,
																'isDefault',
																e.target.checked
															)
														}
														className="h-4 w-4 rounded border-white/20 bg-white/5 text-[#E0342A] focus:ring-2 focus:ring-[#E0342A]/50"
													/>
													<span className="text-xs text-white/70">Default</span>
												</label>
												<Button
													type="button"
													size="icon"
													variant="ghost"
													onClick={() => removeVariant(variant.id)}
													className="h-8 w-8 text-white/60 hover:text-[#E0342A]"
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>
										</div>
									</div>
								))
							)}
						</div>
					</section>

					<section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="text-xs uppercase tracking-[0.3em] text-white/50">
									Add Ons
								</p>
								<p className="text-sm text-white/60">
									Select which add‑ons are available for this dish.
								</p>
							</div>
							{categorySpecificToppings.length > 0 && (
								<div className="w-44">
									<input
										type="text"
										value={toppingSearch}
										onChange={(e) => setToppingSearch(e.target.value)}
										placeholder="Search add ons..."
										className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
									/>
								</div>
							)}
						</div>
						<div className="max-h-48 overflow-y-auto">
							<div className="flex flex-wrap gap-2">
								{filteredToppings.map((topping) => {
									const selected = selectedToppings.includes(topping.id)
									return (
										<button
											key={topping.id}
											type="button"
											onClick={() => toggleTopping(topping.id)}
											className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
												selected
													? 'border-[#E0342A]/30 bg-[#E0342A]/15 text-white'
													: 'border-white/15 bg-white/5 text-white/70 hover:border-white/30 hover:bg-white/10'
											}`}
										>
											<span className="truncate max-w-[140px]">
												{topping.name}
											</span>
											<span className="text-[11px] text-white/50">
												+{topping.price.toFixed(2)}
											</span>
										</button>
									)
								})}
								{categorySpecificToppings.length === 0 && (
									<p className="text-xs text-white/50">
										No add ons linked to this category. Add or assign add ons in
										the Add Ons tab.
									</p>
								)}
								{categorySpecificToppings.length > 0 &&
									filteredToppings.length === 0 && (
										<p className="text-xs text-white/50">
											No add ons match "{toppingSearch}".
										</p>
									)}
							</div>
						</div>
					</section>

					<section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-xs uppercase tracking-[0.3em] text-white/50">
									SOP steps
								</p>
								<p className="text-sm text-white/60">
									Record prep rituals for your kitchen displays
								</p>
							</div>
							<Button type="button" variant="ghost" onClick={addSopStep}>
								<Plus className="mr-2 h-4 w-4" />
								Add step
							</Button>
						</div>
						<div className="space-y-4">
							{sopSteps.map((step, index) => (
								<div
									key={step.id}
									className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
								>
									<div className="flex items-center justify-between">
										<p className="text-xs uppercase tracking-[0.3em] text-white/40">
											Step {index + 1}
										</p>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => removeStep(step.id)}
											className="text-white/60 hover:text-white"
											disabled={sopSteps.length === 1}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
									<input
										type="text"
										value={step.title}
										onChange={(e) =>
											updateStep(step.id, { title: e.target.value })
										}
										placeholder="Add title, e.g. boil pasta"
										className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
									/>
									<textarea
										value={step.body}
										onChange={(e) =>
											updateStep(step.id, { body: e.target.value })
										}
										rows={3}
										placeholder="Describe this step..."
										className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none resize-none"
									/>
								</div>
							))}
						</div>
					</section>

					<div className="flex gap-3 pt-4">
						<Button
							type="button"
							variant="ghost"
							onClick={onClose}
							className="flex-1"
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting} className="flex-1">
							<Save className="mr-2 h-4 w-4" />
							{isSubmitting ? 'Saving...' : 'Save'}
						</Button>
					</div>
				</form>
			</motion.div>
		</div>
	)
}
