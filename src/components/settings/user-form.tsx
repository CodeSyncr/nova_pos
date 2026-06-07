'use client'

import { useState } from 'react'
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

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
			<motion.div
				initial={{ opacity: 0, scale: 0.95 }}
				animate={{ opacity: 1, scale: 1 }}
				className="relative w-full max-w-md rounded-2xl border border-white/10 bg-black/90 p-6 shadow-2xl"
			>
				<button
					onClick={onClose}
					className="absolute right-4 top-4 rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
				>
					<X className="h-4 w-4" />
				</button>

				<h2 className="mb-6 text-2xl font-semibold text-white">
					{user ? 'Edit User' : 'Add New User'}
				</h2>

				<form onSubmit={handleSubmit} className="space-y-4">
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
									className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/20 focus:outline-none"
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
									className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/20 focus:outline-none"
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
							className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/20 focus:outline-none"
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

					<div className="flex gap-3 pt-4">
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
							className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600"
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
}

