'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Edit2, Trash2, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { RoleForm } from './role-form'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { deleteRole } from '@/app/actions/settings'

type Role = {
	id: string
	code: string
	name: string
	description: string | null
	permissions: Record<string, unknown> | string[]
}

type RolesPermissionsTabProps = {
	tenantId: string
	onRefresh: () => void
}

const permissionCategories = [
	{
		id: 'pos',
		label: 'POS',
		permissions: ['all', 'take_orders', 'view_orders', 'manage_orders']
	},
	{
		id: 'menu',
		label: 'Menu',
		permissions: ['all', 'read', 'write', 'delete']
	},
	{
		id: 'orders',
		label: 'Orders',
		permissions: ['all', 'view', 'update', 'cancel']
	},
	{
		id: 'customers',
		label: 'Customers',
		permissions: ['all', 'view', 'edit', 'delete']
	},
	{
		id: 'analytics',
		label: 'Analytics',
		permissions: ['all', 'view', 'export']
	},
	{
		id: 'settings',
		label: 'Settings',
		permissions: ['all', 'view', 'edit']
	}
]

export function RolesPermissionsTab({
	tenantId,
	onRefresh
}: RolesPermissionsTabProps) {
	const [roles, setRoles] = useState<Role[]>([])
	const [loading, setLoading] = useState(true)
	const [showForm, setShowForm] = useState(false)
	const [editingRole, setEditingRole] = useState<Role | null>(null)
	const [deletingRole, setDeletingRole] = useState<Role | null>(null)

	useEffect(() => {
		const loadRoles = async () => {
			try {
				const supabase = createSupabaseBrowserClient()
				const { data } = await supabase
					.from('roles')
					.select('*')
					.eq('tenant_id', tenantId)
					.order('created_at', { ascending: false })

				setRoles((data as Role[]) || [])
			} catch (error) {
				console.error('Error loading roles:', error)
			} finally {
				setLoading(false)
			}
		}

		loadRoles()
	}, [tenantId])

	const handleDelete = async () => {
		if (!deletingRole) return

		try {
			await deleteRole(tenantId, deletingRole.id)
			setDeletingRole(null)
			const supabase = createSupabaseBrowserClient()
			const { data } = await supabase
				.from('roles')
				.select('*')
				.eq('tenant_id', tenantId)
				.order('created_at', { ascending: false })
			setRoles((data as Role[]) || [])
			onRefresh()
		} catch (error) {
			console.error('Error deleting role:', error)
			alert('Failed to delete role')
		}
	}

	const formatPermissions = (
		permissions: Record<string, unknown> | string[]
	) => {
		if (Array.isArray(permissions)) {
			if (permissions.includes('*') || permissions.includes('all')) {
				return 'All Permissions'
			}
			return permissions.join(', ')
		}
		if (typeof permissions === 'object' && permissions !== null) {
			const entries = Object.entries(permissions)
			if (entries.length === 0) return 'No permissions'
			return entries
				.map(([key, value]) => {
					if (Array.isArray(value) && value.includes('all')) {
						return `${key}: all`
					}
					return `${key}: ${Array.isArray(value) ? value.join(', ') : value}`
				})
				.join(' | ')
		}
		return 'No permissions'
	}

	if (loading) {
		return <p className="text-white/60">Loading roles...</p>
	}

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-xl font-semibold text-white">
						Roles & Permissions
					</h3>
					<p className="text-sm text-white/60">
						Manage team roles and their access permissions
					</p>
				</div>
				<Button
					size="sm"
					onClick={() => {
						setEditingRole(null)
						setShowForm(true)
					}}
				>
					<Plus className="mr-2 h-4 w-4" />
					New Role
				</Button>
			</div>

			{roles.length === 0 ? (
				<div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
					<Shield className="mx-auto mb-4 h-12 w-12 text-white/40" />
					<p className="text-white/60">No custom roles created yet</p>
					<p className="mt-2 text-sm text-white/40">
						Create roles to control what your team members can access
					</p>
				</div>
			) : (
				<div className="grid gap-4 md:grid-cols-2">
					{roles.map((role) => (
						<motion.div
							key={role.id}
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							className="rounded-xl border border-white/10 bg-black/20 p-6"
						>
							<div className="mb-4 flex items-start justify-between">
								<div className="flex-1">
									<div className="mb-2 flex items-center gap-2">
										<Shield className="h-5 w-5 text-amber-400" />
										<h4 className="text-lg font-semibold text-white">
											{role.name}
										</h4>
									</div>
									<code className="mb-2 block text-xs text-white/50">
										{role.code}
									</code>
									{role.description && (
										<p className="mb-3 text-sm text-white/60">
											{role.description}
										</p>
									)}
									<div className="rounded-lg border border-white/10 bg-white/5 p-3">
										<p className="mb-1 text-xs font-medium uppercase tracking-wide text-white/50">
											Permissions
										</p>
										<p className="text-xs text-white/70">
											{formatPermissions(role.permissions)}
										</p>
									</div>
								</div>
								<div className="flex gap-2">
									<Button
										size="sm"
										variant="ghost"
										onClick={() => {
											setEditingRole(role)
											setShowForm(true)
										}}
										className="border border-white/15 bg-white/5 text-white/70"
									>
										<Edit2 className="h-4 w-4" />
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => setDeletingRole(role)}
										className="border border-white/15 bg-white/5 text-white/70"
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							</div>
						</motion.div>
					))}
				</div>
			)}

			{showForm && (
				<RoleForm
					tenantId={tenantId}
					role={editingRole}
					permissionCategories={permissionCategories}
					onClose={() => {
						setShowForm(false)
						setEditingRole(null)
					}}
					onSuccess={() => {
						setShowForm(false)
						setEditingRole(null)
						const loadRoles = async () => {
							const supabase = createSupabaseBrowserClient()
							const { data } = await supabase
								.from('roles')
								.select('*')
								.eq('tenant_id', tenantId)
								.order('created_at', { ascending: false })
							setRoles((data as Role[]) || [])
						}
						loadRoles()
						onRefresh()
					}}
				/>
			)}

			{deletingRole && (
				<AlertDialog open={!!deletingRole}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete Role</AlertDialogTitle>
							<AlertDialogDescription>
								Are you sure you want to delete "{deletingRole.name}"? This
								action cannot be undone. Users with this role will need to be
								reassigned.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel onClick={() => setDeletingRole(null)}>
								Cancel
							</AlertDialogCancel>
							<AlertDialogAction onClick={handleDelete}>
								Delete
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}
		</div>
	)
}
