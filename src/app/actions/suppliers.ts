'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type SupplierAddress = {
	street?: string
	city?: string
	state?: string
	pincode?: string
	country?: string
}

export async function createSupplier(
	tenantId: string,
	data: {
		name: string
		contactPerson?: string
		email?: string
		phone?: string
		address?: SupplierAddress
		notes?: string
	}
) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to create a supplier.')
	}

	const { data: supplier, error } = await supabase
		.from('suppliers')
		.insert({
			tenant_id: tenantId,
			name: data.name,
			contact_person: data.contactPerson || null,
			email: data.email || null,
			phone: data.phone || null,
			address: data.address || null,
			notes: data.notes || null,
			is_active: true
		})
		.select()
		.single()

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/purchases')
	revalidatePath('/settings')

	return { supplierId: supplier.id, success: true }
}

export async function updateSupplier(
	supplierId: string,
	data: {
		name?: string
		contactPerson?: string
		email?: string
		phone?: string
		address?: SupplierAddress
		notes?: string
		isActive?: boolean
	}
) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to update a supplier.')
	}

	const updates: Record<string, unknown> = {}

	if (data.name !== undefined) updates.name = data.name
	if (data.contactPerson !== undefined)
		updates.contact_person = data.contactPerson
	if (data.email !== undefined) updates.email = data.email
	if (data.phone !== undefined) updates.phone = data.phone
	if (data.address !== undefined) updates.address = data.address
	if (data.notes !== undefined) updates.notes = data.notes
	if (data.isActive !== undefined) updates.is_active = data.isActive

	updates.updated_at = new Date().toISOString()

	const { error } = await supabase
		.from('suppliers')
		.update(updates)
		.eq('id', supplierId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/purchases')
	revalidatePath('/settings')

	return { success: true }
}

export async function getSuppliers(tenantId: string) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to view suppliers.')
	}

	const { data, error } = await supabase
		.from('suppliers')
		.select('*')
		.eq('tenant_id', tenantId)
		.order('name', { ascending: true })

	if (error) {
		throw new Error(error.message)
	}

	return data
}

export async function deleteSupplier(supplierId: string) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to delete a supplier.')
	}

	const { error } = await supabase
		.from('suppliers')
		.delete()
		.eq('id', supplierId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/purchases')
	revalidatePath('/settings')

	return { success: true }
}
