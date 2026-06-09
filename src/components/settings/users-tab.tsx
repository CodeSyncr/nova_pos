'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Edit2, Trash2, User, Mail, Shield, Loader2, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
	getTenantUsers,
	createTenantUser,
	updateTenantUserRole,
	removeTenantUser,
	type TenantUser
} from '@/app/actions/users'
import { toggleStaffStatus } from '@/app/actions/staff'
import { useToast } from '@/components/ui/toast'
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
import { UserForm } from './user-form'

type Role = {
	id: string
	name: string
	code: string
}

type UsersTabProps = {
	tenantId: string
	onRefresh: () => void
}

export function UsersTab({ tenantId, onRefresh }: UsersTabProps) {
	const [users, setUsers] = useState<TenantUser[]>([])
	const [roles, setRoles] = useState<Role[]>([])
	const [loading, setLoading] = useState(true)
	const [showForm, setShowForm] = useState(false)
	const [editingUser, setEditingUser] = useState<TenantUser | null>(null)
	const [deletingUser, setDeletingUser] = useState<TenantUser | null>(null)
	const toast = useToast()

	useEffect(() => {
		const loadData = async () => {
			try {
				setLoading(true)
				const [usersData, rolesData] = await Promise.all([
					getTenantUsers(tenantId),
					loadRoles()
				])
				setUsers(usersData)
				setRoles(rolesData)
			} catch (error) {
				console.error('Error loading data:', error)
				toast.error(
					error instanceof Error
						? error.message
						: 'Failed to load users and roles'
				)
			} finally {
				setLoading(false)
			}
		}

		loadData()
	}, [tenantId, toast])

	const loadRoles = async (): Promise<Role[]> => {
		const supabase = createSupabaseBrowserClient()
		const { data } = await supabase
			.from('roles')
			.select('id, name, code')
			.eq('tenant_id', tenantId)
			.order('created_at', { ascending: false })

		return (data as Role[]) || []
	}

	const handleDelete = async () => {
		if (!deletingUser) return

		try {
			await removeTenantUser(tenantId, deletingUser.id)
			setDeletingUser(null)
			const usersData = await getTenantUsers(tenantId)
			setUsers(usersData)
			toast.success('User removed successfully')
			onRefresh()
		} catch (error) {
			console.error('Error removing user:', error)
			toast.error(
				error instanceof Error ? error.message : 'Failed to remove user'
			)
		}
	}

	const handleSave = async () => {
		try {
			const usersData = await getTenantUsers(tenantId)
			setUsers(usersData)
			const rolesData = await loadRoles()
			setRoles(rolesData)
			setShowForm(false)
			setEditingUser(null)
			toast.success(
				editingUser ? 'User updated successfully' : 'User created successfully'
			)
			onRefresh()
		} catch (error) {
			console.error('Error saving user:', error)
			toast.error(
				error instanceof Error ? error.message : 'Failed to save user'
			)
		}
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center py-12">
				<Loader2 className="h-8 w-8 animate-spin text-white/60" />
			</div>
		)
	}

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-xl font-semibold text-white">Team Members</h3>
					<p className="text-sm text-white/60">
						Manage users and their roles in your organization
					</p>
				</div>
				<Button
					size="sm"
					onClick={() => {
						setEditingUser(null)
						setShowForm(true)
					}}
				>
					<Plus className="mr-2 h-4 w-4" />
					Add User
				</Button>
			</div>

			{users.length === 0 ? (
				<div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
					<User className="mx-auto mb-4 h-12 w-12 text-white/40" />
					<p className="text-white/60">No users found</p>
					<p className="mt-2 text-sm text-white/40">
						Add team members to get started
					</p>
				</div>
			) : (
				<div className="grid gap-4 md:grid-cols-2">
					{users.map((user) => (
						<motion.div
							key={user.id}
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							className="rounded-xl border border-white/10 bg-black/20 p-6"
						>
							<div className="mb-4 flex items-start justify-between">
								<div className="flex-1">
									<div className="mb-2 flex items-center gap-3">
										{user.avatar_url ? (
											<img
												src={user.avatar_url}
												alt={user.full_name || user.email}
												className="h-10 w-10 rounded-full"
											/>
										) : (
											<div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
												<User className="h-5 w-5 text-white/70" />
											</div>
										)}
										<div>
											<h4 className="text-lg font-semibold text-white">
												{user.full_name || 'No name'}
											</h4>
											<div className="flex items-center gap-2 text-sm text-white/60">
												<Mail className="h-3 w-3" />
												<span>{user.email}</span>
											</div>
										</div>
									</div>
									{user.role && (
										<div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
											<div className="flex items-center gap-2">
												<Shield className="h-4 w-4 text-[#E0342A]" />
												<span className="text-sm font-medium text-white">
													{user.role.name}
												</span>
												<span className="text-xs text-white/50">
													({user.role.code})
												</span>
											</div>
										</div>
									)}
									{!user.role && (
										<div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
											<p className="text-xs text-white/50">No role assigned</p>
										</div>
									)}
								</div>
								<div className="flex gap-2">
									<Button
										size="sm"
										variant="ghost"
										onClick={async () => {
											try {
												await toggleStaffStatus(tenantId, user.id, !user.is_staff)
												toast.success(user.is_staff ? 'Removed from staff' : 'Marked as staff')
												const usersData = await getTenantUsers(tenantId)
												setUsers(usersData)
											} catch (err: any) {
												toast.error(err.message)
											}
										}}
										className={`border text-xs ${user.is_staff ? 'border-white/20 bg-white/10 text-white' : 'border-white/15 bg-white/5 text-white/70'}`}
									>
										<UserCog className="mr-1 h-3.5 w-3.5" />
										{user.is_staff ? 'Staff' : 'Mark Staff'}
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => {
											setEditingUser(user)
											setShowForm(true)
										}}
										className="border border-white/15 bg-white/5 text-white/70"
									>
										<Edit2 className="h-4 w-4" />
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => setDeletingUser(user)}
										className="border border-white/15 bg-white/5 text-white/70 hover:border-[#E0342A]/50 hover:text-[#E0342A]"
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
				<UserForm
					tenantId={tenantId}
					user={editingUser}
					roles={roles}
					onClose={() => {
						setShowForm(false)
						setEditingUser(null)
					}}
					onSuccess={handleSave}
				/>
			)}

			{deletingUser && (
				<AlertDialog open={!!deletingUser}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Remove User</AlertDialogTitle>
							<AlertDialogDescription>
								Are you sure you want to remove "{deletingUser.email}" from
								this organization? They will lose access to all resources.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel onClick={() => setDeletingUser(null)}>
								Cancel
							</AlertDialogCancel>
							<AlertDialogAction onClick={handleDelete}>
								Remove
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}
		</div>
	)
}

