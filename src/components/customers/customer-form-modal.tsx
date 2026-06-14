'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Loader2, Check, UserPlus, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createCustomer, updateCustomer } from '@/app/actions/customers'
import { useToast } from '@/components/ui/toast'

type CustomerRow = {
	id: string
	full_name: string
	phone: string | null
	email: string | null
	tags: string[] | null
}

type CustomerFormModalProps = {
	tenantId: string
	customer: CustomerRow | null
	onClose: () => void
	onSave: () => void
}

export function CustomerFormModal({ tenantId, customer, onClose, onSave }: CustomerFormModalProps) {
	const { success, error: showError } = useToast()
	const [fullName, setFullName] = useState('')
	const [phone, setPhone] = useState('')
	const [email, setEmail] = useState('')
	const [tagsInput, setTagsInput] = useState('')
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		if (customer) {
			setFullName(customer.full_name || '')
			setPhone(customer.phone || '')
			setEmail(customer.email || '')
			setTagsInput(customer.tags ? customer.tags.join(', ') : '')
		} else {
			setFullName('')
			setPhone('')
			setEmail('')
			setTagsInput('')
		}
	}, [customer])

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!fullName.trim()) return

		setSaving(true)
		const tags = tagsInput
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean)

		const payload = {
			fullName: fullName.trim(),
			phone: phone.trim() || undefined,
			email: email.trim() || undefined,
			tags: tags.length > 0 ? tags : undefined
		}

		try {
			if (customer) {
				await updateCustomer(customer.id, payload)
				success('Customer updated successfully')
			} else {
				await createCustomer(tenantId, payload)
				success('Customer created successfully')
			}
			onSave()
			onClose()
		} catch (err: any) {
			showError(err.message || 'Failed to save customer')
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="fixed inset-0 z-[9999] flex items-center justify-end">
			<div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
			<motion.div
				initial={{ opacity: 0, x: 80 }}
				animate={{ opacity: 1, x: 0 }}
				exit={{ opacity: 0, x: 80 }}
				className="relative h-full w-full max-w-md border-l border-white/10 bg-gradient-to-br from-[#121633] via-[#060915] to-[#030308] p-8 overflow-y-auto shadow-2xl"
			>
				<header className="flex items-center justify-between mb-8">
					<div>
						<h2 className="text-xl font-semibold text-white">
							{customer ? 'Edit Customer' : 'New Customer'}
						</h2>
						<p className="text-sm text-white/50">
							{customer ? 'Modify guest profile details' : 'Register a new guest'}
						</p>
					</div>
					<button
						onClick={onClose}
						className="rounded-full border border-white/10 bg-white/5 p-2 text-white/60 hover:bg-white/10"
					>
						<X className="h-4 w-4" />
					</button>
				</header>

				<form onSubmit={handleSave} className="space-y-6">
					<div>
						<label className="mb-2 block text-sm text-white/70 font-medium">
							Full Name <span className="text-[#E0342A]">*</span>
						</label>
						<input
							type="text"
							value={fullName}
							onChange={(e) => setFullName(e.target.value)}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white placeholder-white/30 focus:border-white/30 focus:outline-none transition-colors"
							placeholder="e.g. John Doe"
							required
						/>
					</div>

					<div>
						<label className="mb-2 block text-sm text-white/70 font-medium">
							Phone Number
						</label>
						<input
							type="text"
							value={phone}
							onChange={(e) => setPhone(e.target.value)}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white placeholder-white/30 focus:border-white/30 focus:outline-none transition-colors"
							placeholder="e.g. +91 9999999999"
						/>
					</div>

					<div>
						<label className="mb-2 block text-sm text-white/70 font-medium">
							Email Address
						</label>
						<input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white placeholder-white/30 focus:border-white/30 focus:outline-none transition-colors"
							placeholder="e.g. john.doe@example.com"
						/>
					</div>

					<div>
						<label className="mb-2 block text-sm text-white/70 font-medium">
							Tags (comma-separated)
						</label>
						<input
							type="text"
							value={tagsInput}
							onChange={(e) => setTagsInput(e.target.value)}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white placeholder-white/30 focus:border-white/30 focus:outline-none transition-colors"
							placeholder="e.g. Regular, VIP, Weekend"
						/>
					</div>

					<div className="pt-4">
						<Button type="submit" disabled={saving || !fullName.trim()} className="w-full h-11">
							{saving ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : customer ? (
								<Save className="mr-2 h-4 w-4" />
							) : (
								<UserPlus className="mr-2 h-4 w-4" />
							)}
							{customer ? 'Save Changes' : 'Register Customer'}
						</Button>
					</div>
				</form>
			</motion.div>
		</div>
	)
}
