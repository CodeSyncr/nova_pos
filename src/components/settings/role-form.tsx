'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createOrUpdateRole } from '@/app/actions/settings'

type Role = {
	id: string
	code: string
	name: string
	description: string | null
	permissions: Record<string, unknown> | string[]
}

type PermissionCategory = {
	id: string
	label: string
	permissions: string[]
}

type RoleFormProps = {
	tenantId: string
	role: Role | null
	permissionCategories: PermissionCategory[]
	onClose: () => void
	onSuccess: () => void
}

export function RoleForm({
	tenantId,
	role,
	permissionCategories,
	onClose,
	onSuccess
}: RoleFormProps) {
	const [formData, setFormData] = useState({
		code: role?.code || '',
		name: role?.name || '',
		description: role?.description || '',
		permissions: role?.permissions || {}
	})
	const [saving, setSaving] = useState(false)
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
	}, [])

	// Initialize permissions structure
	const [permissions, setPermissions] = useState<Record<string, string[]>>(
		() => {
			if (role?.permissions) {
				if (Array.isArray(role.permissions)) {
					return {}
				}
				return role.permissions as Record<string, string[]>
			}
			return {}
		}
	)

	const handlePermissionChange = (
		categoryId: string,
		permission: string,
		checked: boolean
	) => {
		setPermissions((prev) => {
			const categoryPerms = prev[categoryId] || []
			if (checked) {
				if (permission === 'all') {
					return { ...prev, [categoryId]: ['all'] }
				}
				// Remove 'all' if adding specific permission
				const filtered = categoryPerms.filter((p) => p !== 'all')
				return { ...prev, [categoryId]: [...filtered, permission] }
			} else {
				if (permission === 'all') {
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
					const { [categoryId]: _, ...rest } = prev
					return rest
				}
				return {
					...prev,
					[categoryId]: categoryPerms.filter((p) => p !== permission)
				}
			}
		})
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setSaving(true)

		try {
			await createOrUpdateRole(tenantId, role?.id || null, {
				code: formData.code,
				name: formData.name,
				description: formData.description || null,
				permissions: permissions
			})
			onSuccess()
		} catch (error) {
			console.error('Error saving role:', error)
			alert('Failed to save role')
		} finally {
			setSaving(false)
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
				className="absolute right-0 top-0 h-full w-full max-w-3xl overflow-y-auto border-l border-white/10 bg-gradient-to-br from-[#121633] via-[#060915] to-[#030308] p-8 shadow-[0_40px_120px_rgba(3,5,18,0.85)]"
			>
				<div className="flex items-center justify-between mb-6">
					<div className="flex items-center gap-3">
						<div className="rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 p-3">
							<Shield className="h-6 w-6 text-white" />
						</div>
						<div>
							<p className="text-xs uppercase tracking-[0.3em] text-white/50">
								Roles & permissions
							</p>
							<h2 className="mt-1 text-2xl font-semibold text-white">
								{role ? 'Edit Role' : 'New Role'}
							</h2>
						</div>
					</div>
					<button
						onClick={onClose}
						className="rounded-full border border-white/10 bg-white/5 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="space-y-6 pb-6">
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Role Code *
							</label>
							<input
								type="text"
								value={formData.code}
								onChange={(e) =>
									setFormData({
										...formData,
										code: e.target.value.toUpperCase().replace(/\s/g, '_')
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="MANAGER"
								required
							/>
							<p className="mt-1 text-xs text-white/60">
								Unique identifier (uppercase, underscores)
							</p>
						</div>

						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Role Name *
							</label>
							<input
								type="text"
								value={formData.name}
								onChange={(e) =>
									setFormData({ ...formData, name: e.target.value })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="Manager"
								required
							/>
						</div>
					</div>

					<div>
						<label className="mb-2 block text-sm font-medium text-white">
							Description
						</label>
						<textarea
							value={formData.description}
							onChange={(e) =>
								setFormData({ ...formData, description: e.target.value })
							}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							rows={2}
							placeholder="Describe this role's responsibilities..."
						/>
					</div>

					<div>
						<label className="mb-4 block text-sm font-medium text-white">
							Permissions
						</label>
						<div className="space-y-4">
							{permissionCategories.map((category) => {
								const categoryPerms = permissions[category.id] || []
								const hasAll = categoryPerms.includes('all')

								return (
									<div
										key={category.id}
										className="rounded-xl border border-white/10 bg-black/20 p-4"
									>
										<div className="mb-3 flex items-center justify-between">
											<h4 className="font-semibold text-white">
												{category.label}
											</h4>
											<label className="flex cursor-pointer items-center gap-2 text-sm text-white/70">
												<input
													type="checkbox"
													checked={hasAll}
													onChange={(e) =>
														handlePermissionChange(
															category.id,
															'all',
															e.target.checked
														)
													}
													className="rounded border-white/20"
												/>
												<span>All</span>
											</label>
										</div>
										<div className="flex flex-wrap gap-2">
											{category.permissions
												.filter((p) => p !== 'all')
												.map((permission) => (
													<label
														key={permission}
														className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 transition hover:bg-white/10"
													>
														<input
															type="checkbox"
															checked={categoryPerms.includes(permission)}
															disabled={hasAll}
															onChange={(e) =>
																handlePermissionChange(
																	category.id,
																	permission,
																	e.target.checked
																)
															}
															className="rounded border-white/20"
														/>
														<span className="capitalize">
															{permission.replace(/_/g, ' ')}
														</span>
													</label>
												))}
										</div>
									</div>
								)
							})}
						</div>
					</div>

					<div className="flex justify-end gap-3">
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={saving}>
							{saving ? 'Saving...' : role ? 'Update Role' : 'Create Role'}
						</Button>
					</div>
				</form>
			</motion.div>
		</div>
	)

	return createPortal(modalContent, document.body)
}
