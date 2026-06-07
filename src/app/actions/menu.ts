'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Category Actions
export async function createCategory(
	tenantId: string,
	data: { name: string; description?: string; position?: number }
) {
	const supabase = await createSupabaseServerClient()

	const { data: category, error } = await supabase
		.from('menu_categories')
		.insert({
			tenant_id: tenantId,
			name: data.name,
			description: data.description || null,
			position: data.position ?? 0
		})
		.select()
		.single()

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/menu')
	return category
}

export async function updateCategory(
	categoryId: string,
	data: { name?: string; description?: string; position?: number }
) {
	const supabase = await createSupabaseServerClient()

	const { error } = await supabase
		.from('menu_categories')
		.update({
			...(data.name && { name: data.name }),
			...(data.description !== undefined && {
				description: data.description || null
			}),
			...(data.position !== undefined && { position: data.position })
		})
		.eq('id', categoryId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/menu')
	return { success: true }
}

export async function deleteCategory(categoryId: string) {
	const supabase = await createSupabaseServerClient()

	const { error } = await supabase
		.from('menu_categories')
		.delete()
		.eq('id', categoryId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/menu')
	revalidatePath('/pos')
	return { success: true }
}

export async function reorderCategories(
	updates: Array<{ id: string; position: number }>
) {
	const supabase = await createSupabaseServerClient()

	// Update all categories in a transaction-like manner
	const promises = updates.map((update) =>
		supabase
			.from('menu_categories')
			.update({ position: update.position })
			.eq('id', update.id)
	)

	const results = await Promise.all(promises)
	const errors = results.filter((result) => result.error)

	if (errors.length > 0) {
		throw new Error(
			`Failed to reorder categories: ${errors[0].error?.message || 'Unknown error'}`
		)
	}

	revalidatePath('/menu')
	revalidatePath('/pos')
	return { success: true }
}

// Menu Item Actions
export type MenuItemNutrition = {
	calories: number
	protein: number
	fat: number
	carbs: number
}

export type MenuItemSOPStep = {
	title: string
	body?: string | null
	step_order: number
	media?: unknown
}

export async function createMenuItem(
	tenantId: string,
	data: {
		categoryId: string
		name: string
		description?: string
		basePrice: number
		slug?: string
		isActive?: boolean
		discountPrice?: number | null
		imageUrl?: string | null
		prepTime?: number | null
		allergenInfo?: string | null
		ingredients?: string[]
		nutrition?: MenuItemNutrition
		sopSteps?: MenuItemSOPStep[]
	}
) {
	const supabase = await createSupabaseServerClient()

	const slug =
		data.slug ||
		data.name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/(^-|-$)/g, '')

	const { data: item, error } = await supabase
		.from('menu_items')
		.insert({
			tenant_id: tenantId,
			category_id: data.categoryId,
			name: data.name,
			description: data.description || null,
			base_price: data.basePrice,
			discount_price: data.discountPrice ?? null,
			image_url: data.imageUrl ?? null,
			prep_time_minutes: data.prepTime ?? null,
			allergen_info: data.allergenInfo ?? null,
			nutrition: data.nutrition ?? {
				calories: 0,
				protein: 0,
				fat: 0,
				carbs: 0
			},
			slug,
			is_active: data.isActive ?? true
		})
		.select()
		.single()

	if (error) {
		throw new Error(error.message)
	}

	if (data.ingredients?.length) {
		await syncMenuItemIngredients(supabase, item.id, data.ingredients)
	}

	if (data.sopSteps && data.sopSteps.length > 0) {
		await createOrUpdateSOP(tenantId, item.id, data.sopSteps)
	}

	revalidatePath('/menu')
	return item
}

export async function updateMenuItem(
	itemId: string,
	data: {
		name?: string
		description?: string
		basePrice?: number
		categoryId?: string
		isActive?: boolean
		discountPrice?: number | null
		imageUrl?: string | null
		prepTime?: number | null
		allergenInfo?: string | null
		ingredients?: string[]
		nutrition?: MenuItemNutrition
		sopSteps?: MenuItemSOPStep[]
	}
) {
	const supabase = await createSupabaseServerClient()

	const updateData: Record<string, unknown> = {}
	if (data.name) updateData.name = data.name
	if (data.description !== undefined)
		updateData.description = data.description || null
	if (data.basePrice !== undefined) updateData.base_price = data.basePrice
	if (data.categoryId) updateData.category_id = data.categoryId
	if (data.isActive !== undefined) updateData.is_active = data.isActive
	if (data.discountPrice !== undefined)
		updateData.discount_price = data.discountPrice
	if (data.imageUrl !== undefined) updateData.image_url = data.imageUrl
	if (data.prepTime !== undefined) updateData.prep_time_minutes = data.prepTime
	if (data.allergenInfo !== undefined)
		updateData.allergen_info = data.allergenInfo
	if (data.nutrition !== undefined) updateData.nutrition = data.nutrition

	const { error } = await supabase
		.from('menu_items')
		.update(updateData)
		.eq('id', itemId)

	if (error) {
		throw new Error(error.message)
	}

	if (data.ingredients) {
		await syncMenuItemIngredients(supabase, itemId, data.ingredients ?? [])
	}

	if (data.sopSteps) {
		const tenantId = await tenantIdFromMenuItem(itemId)
		if (data.sopSteps.length === 0) {
			await deleteSOPByMenuItem(itemId)
		} else if (tenantId) {
			await createOrUpdateSOP(tenantId, itemId, data.sopSteps)
		}
	}

	revalidatePath('/menu')
	revalidatePath('/pos')
	return { success: true }
}

async function tenantIdFromMenuItem(itemId: string) {
	const supabase = await createSupabaseServerClient()
	const { data } = await supabase
		.from('menu_items')
		.select('tenant_id')
		.eq('id', itemId)
		.single()
	return data?.tenant_id as string
}

export async function deleteMenuItem(itemId: string) {
	const supabase = await createSupabaseServerClient()

	const { error } = await supabase.from('menu_items').delete().eq('id', itemId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/menu')
	revalidatePath('/pos')
	return { success: true }
}

async function syncMenuItemIngredients(
	supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
	itemId: string,
	ingredientIds: string[]
) {
	await supabase
		.from('menu_item_ingredients')
		.delete()
		.eq('menu_item_id', itemId)

	if (!ingredientIds.length) return

	await supabase.from('menu_item_ingredients').insert(
		ingredientIds.map((ingredientId) => ({
			menu_item_id: itemId,
			ingredient_id: ingredientId
		}))
	)
}

async function deleteSOPByMenuItem(itemId: string) {
	const supabase = await createSupabaseServerClient()
	await supabase.from('sop').delete().eq('menu_item_id', itemId)
}

// Variant Actions
export async function createVariant(
	itemId: string,
	data: { name: string; priceModifier: number; isDefault?: boolean }
) {
	const supabase = await createSupabaseServerClient()

	// If this is default, unset other defaults
	if (data.isDefault) {
		await supabase
			.from('menu_item_variants')
			.update({ is_default: false })
			.eq('menu_item_id', itemId)
	}

	const { data: variant, error } = await supabase
		.from('menu_item_variants')
		.insert({
			menu_item_id: itemId,
			name: data.name,
			price_modifier: data.priceModifier,
			is_default: data.isDefault ?? false
		})
		.select()
		.single()

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/menu')
	revalidatePath('/pos')
	return variant
}

export async function updateVariant(
	variantId: string,
	data: { name?: string; priceModifier?: number; isDefault?: boolean }
) {
	const supabase = await createSupabaseServerClient()

	// If setting as default, unset other defaults
	if (data.isDefault) {
		const { data: variant } = await supabase
			.from('menu_item_variants')
			.select('menu_item_id')
			.eq('id', variantId)
			.single()

		if (variant) {
			await supabase
				.from('menu_item_variants')
				.update({ is_default: false })
				.eq('menu_item_id', variant.menu_item_id)
				.neq('id', variantId)
		}
	}

	const updateData: Record<string, unknown> = {}
	if (data.name) updateData.name = data.name
	if (data.priceModifier !== undefined)
		updateData.price_modifier = data.priceModifier
	if (data.isDefault !== undefined) updateData.is_default = data.isDefault

	const { error } = await supabase
		.from('menu_item_variants')
		.update(updateData)
		.eq('id', variantId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/menu')
	revalidatePath('/pos')
	return { success: true }
}

export async function deleteVariant(variantId: string) {
	const supabase = await createSupabaseServerClient()

	const { error } = await supabase
		.from('menu_item_variants')
		.delete()
		.eq('id', variantId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/menu')
	revalidatePath('/pos')
	return { success: true }
}

// Topping Actions
export async function createTopping(
	tenantId: string,
	data: { name: string; description?: string; price: number; category?: string }
) {
	const supabase = await createSupabaseServerClient()

	const { data: topping, error } = await supabase
		.from('toppings')
		.insert({
			tenant_id: tenantId,
			name: data.name,
			description: data.description || null,
			price: data.price,
			category: data.category || null
		})
		.select()
		.single()

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/menu')
	return topping
}

export async function updateTopping(
	toppingId: string,
	data: {
		name?: string
		description?: string
		price?: number
		category?: string
	}
) {
	const supabase = await createSupabaseServerClient()

	const updateData: Record<string, unknown> = {}
	if (data.name) updateData.name = data.name
	if (data.description !== undefined)
		updateData.description = data.description || null
	if (data.price !== undefined) updateData.price = data.price
	if (data.category !== undefined) updateData.category = data.category || null

	const { error } = await supabase
		.from('toppings')
		.update(updateData)
		.eq('id', toppingId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/menu')
	revalidatePath('/pos')
	return { success: true }
}

export async function deleteTopping(toppingId: string) {
	const supabase = await createSupabaseServerClient()

	const { error } = await supabase.from('toppings').delete().eq('id', toppingId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/menu')
	revalidatePath('/pos')
	return { success: true }
}

// Link topping to menu item
export async function linkToppingToMenuItem(
	itemId: string,
	toppingId: string,
	data?: { isOptional?: boolean; maxQuantity?: number }
) {
	const supabase = await createSupabaseServerClient()

	const { error } = await supabase.from('menu_item_toppings').upsert(
		{
			menu_item_id: itemId,
			topping_id: toppingId,
			is_optional: data?.isOptional ?? true,
			max_quantity: data?.maxQuantity ?? 1
		},
		{
			onConflict: 'menu_item_id,topping_id',
			ignoreDuplicates: true
		}
	)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/menu')
	revalidatePath('/pos')
	return { success: true }
}

export async function unlinkToppingFromMenuItem(
	itemId: string,
	toppingId: string
) {
	const supabase = await createSupabaseServerClient()

	const { error } = await supabase
		.from('menu_item_toppings')
		.delete()
		.eq('menu_item_id', itemId)
		.eq('topping_id', toppingId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/menu')
	revalidatePath('/pos')
	return { success: true }
}

// Ingredient Actions
export async function createIngredient(
	tenantId: string,
	data: { name: string; unit?: string; allergenInfo?: string }
) {
	const supabase = await createSupabaseServerClient()

	const { data: ingredient, error } = await supabase
		.from('ingredients')
		.insert({
			tenant_id: tenantId,
			name: data.name,
			unit: data.unit || null,
			allergen_info: data.allergenInfo || null
		})
		.select()
		.single()

	if (error) {
		throw new Error(error.message)
	}

	// Automatically create inventory record for the new ingredient
	if (ingredient) {
		const { error: inventoryError } = await supabase.from('inventory').insert({
			tenant_id: tenantId,
			ingredient_id: ingredient.id,
			current_stock: 0,
			unit: data.unit || 'pieces',
			min_stock_level: 0
		})

		if (inventoryError) {
			// Log error but don't fail the ingredient creation
			console.error('Failed to create inventory record:', inventoryError)
		}
	}

	revalidatePath('/menu')
	revalidatePath('/inventory')
	return ingredient
}

export async function linkIngredientToMenuItem(
	itemId: string,
	ingredientId: string,
	data?: { isRequired?: boolean; quantity?: number }
) {
	const supabase = await createSupabaseServerClient()

	const { error } = await supabase.from('menu_item_ingredients').insert({
		menu_item_id: itemId,
		ingredient_id: ingredientId,
		is_required: data?.isRequired ?? true,
		quantity: data?.quantity || null
	})

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/menu')
	return { success: true }
}

export async function deleteIngredient(ingredientId: string) {
	const supabase = await createSupabaseServerClient()

	const { error } = await supabase
		.from('ingredients')
		.delete()
		.eq('id', ingredientId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/menu')
	return { success: true }
}

// SOP Actions
type SOPStep = {
	title: string
	body?: string | null
	step_order: number
	media?: unknown
}

export async function createOrUpdateSOP(
	tenantId: string,
	itemId: string,
	steps: SOPStep[]
) {
	const supabase = await createSupabaseServerClient()

	// Sort steps by step_order
	const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order)

	// Check if SOP exists
	const { data: existing } = await supabase
		.from('sop')
		.select('id')
		.eq('menu_item_id', itemId)
		.single()

	if (existing) {
		// Update existing SOP
		const { error } = await supabase
			.from('sop')
			.update({
				steps: sortedSteps,
				updated_at: new Date().toISOString()
			})
			.eq('id', existing.id)

		if (error) {
			throw new Error(error.message)
		}
	} else {
		// Create new SOP
		const { error } = await supabase.from('sop').insert({
			tenant_id: tenantId,
			menu_item_id: itemId,
			steps: sortedSteps
		})

		if (error) {
			throw new Error(error.message)
		}
	}

	revalidatePath('/menu')
	return { success: true }
}

export async function deleteSOP(sopId: string) {
	const supabase = await createSupabaseServerClient()

	const { error } = await supabase.from('sop').delete().eq('id', sopId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/menu')
	return { success: true }
}
