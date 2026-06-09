'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CustomSelect } from '@/components/ui/select'
import {
	createTenantUser,
	updateTenantUserRole,
	type TenantUser
} from '@/app/actions/users'
import { useToast } from '@/components/ui/toast'

type Role = {
	id: string
	name: string
	code: string
}

type UserFormProps = {
	tenantId: string
	user: TenantUser | null
	roles: Role[]
	onClose: () => void
	onSuccess: () => void
}

export function UserForm({
	tenantId,
	user,
	roles,
	onClose,
	onSuccess
}: UserFormProps) {
	const [loading, setLoading] = useState(false)
	const [formData, setFormData] = useState({
		email: user?.email || '',
		password: '',
		full_name: user?.full_name || '',
		role_id: user?.role_id || ''
	})
	const toast = useToast()
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
	}, [])

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setLoading(true)

		try {
			if (user) {
				// Update existing user role
				await updateTenantUserRole(
					tenantId,
					user.id,
					formData.role_id || null
				)
			} else {
				// Create new user
				if (!formData.email || !formData.password) {
					toast.error('Email and password are required')
					setLoading(false)
					return
				}

				await createTenantUser(tenantId, {
					email: formData.email,
					password: formData.password,
					full_name: formData.full_name || undefined,
					role_id: formData.role_id || undefined
				})
			}

			onSuccess()
		} catch (error) {
			console.error('Error saving user:', error)
			toast.error(
				error instanceof Error ? error.message : 'Failed to save user'
			)
		} finally {
			setLoading(false)
		}
	}

	if (!mounted) return null

	const modalContent = (
		<div className="fixed inset-0 z-[9999]">
			<div
				className="absolute inset-0 bg-black/60 backdrop-blur-sm"
				onClick={onClose}
			/>
			<motion.div
				initial={{ opacity: 0, x: 80 }}
				animate={{ opacity: 1, x: 0 }}
				exit={{ opacity: 0, x: 80 }}
				transition={{ type: 'spring', damping: 25, stiffness: 300 }}
				className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-black p-8 shadow-[0_40px_120px_rgba(0,0,0,0.85)]"
			>
				<div className="flex items-center justify-between mb-6">
					<div>
						<p className="text-xs uppercase tracking-[0.3em] text-white/50">
							{user ? 'Edit' : 'New'}
						</p>
						<h2 className="mt-1 text-2xl font-semibold text-white">
							{user ? 'Edit User' : 'Add New User'}
						</h2>
					</div>
					<button
						onClick={onClose}
						className="rounded-full border border-white/10 bg-white/5 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="space-y-5">
					{!user && (
						<>
							<div>
								<label className="mb-2 block text-sm font-medium text-white/70">
									Email *
								</label>
								<input
									type="email"
									required
									value={formData.email}
									onChange={(e) =>
										setFormData({ ...formData, email: e.target.value })
									}
									className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
									placeholder="user@example.com"
								/>
							</div>
							<div>
								<label className="mb-2 block text-sm font-medium text-white/70">
									Password *
								</label>
								<input
									type="password"
									required
									value={formData.password}
									onChange={(e) =>
										setFormData({ ...formData, password: e.target.value })
									}
									className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
									placeholder="••••••••"
									minLength={6}
								/>
							</div>
						</>
					)}

					<div>
						<label className="mb-2 block text-sm font-medium text-white/70">
							Full Name
						</label>
						<input
							type="text"
							value={formData.full_name}
							onChange={(e) =>
								setFormData({ ...formData, full_name: e.target.value })
							}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							placeholder="John Doe"
						/>
					</div>

					<div>
						<label className="mb-2 block text-sm font-medium text-white/70">
							Role
						</label>
						<CustomSelect
							value={formData.role_id}
							onChange={(val) =>
								setFormData({ ...formData, role_id: val })
							}
							options={[
								{ value: '', label: 'No role', description: 'Regular staff access' },
								...roles.map((role) => ({
									value: role.id,
									label: role.name,
									description: `Role code: ${role.code}`
								}))
							]}
							placeholder="Select role"
						/>
					</div>

					<div className="flex gap-3 pt-6">
						<Button
							type="button"
							variant="ghost"
							onClick={onClose}
							className="flex-1 border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={loading}
							className="flex-1 bg-[#E0342A] text-white hover:bg-[#E0342A]/90"
						>
							{loading ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Saving...
								</>
							) : (
								user ? 'Update' : 'Create'
							)}
						</Button>
					</div>
				</form>
			</motion.div>
		</div>
	)

	return createPortal(modalContent, document.body)
}

