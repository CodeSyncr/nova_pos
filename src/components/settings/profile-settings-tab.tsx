'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Save, User, Camera, Fingerprint, Trash2, Plus, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { updateUserProfile } from '@/app/actions/settings'

type ProfileSettingsTabProps = {
	tenantId: string
	onRefresh: () => void
}

export function ProfileSettingsTab({
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	tenantId: _tenantId,
	onRefresh
}: ProfileSettingsTabProps) {
	const [loading, setLoading] = useState(true)
	const [formData, setFormData] = useState({
		full_name: '',
		avatar_url: ''
	})
	const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
	const [saving, setSaving] = useState(false)

	// Passkey state
	const [passkeys, setPasskeys] = useState<any[]>([])
	const [loadingPasskeys, setLoadingPasskeys] = useState(true)
	const [registeringPasskey, setRegisteringPasskey] = useState(false)
	const [deletingPasskeyId, setDeletingPasskeyId] = useState<string | null>(null)
	const [passkeyError, setPasskeyError] = useState<string | null>(null)

	const supabase = createSupabaseBrowserClient()

	const loadPasskeys = async () => {
		setLoadingPasskeys(true)
		setPasskeyError(null)
		try {
			const { data, error } = await (supabase.auth as any).passkey.list()
			if (error) throw error
			setPasskeys(data || [])
		} catch (err: any) {
			console.error('Error loading passkeys:', err)
			setPasskeyError(err.message || 'Failed to retrieve passkeys.')
		} finally {
			setLoadingPasskeys(false)
		}
	}

	useEffect(() => {
		loadPasskeys()
	}, [])

	const handleAddPasskey = async () => {
		setRegisteringPasskey(true)
		setPasskeyError(null)
		try {
			const { error } = await (supabase.auth as any).registerPasskey()
			if (error) throw error
			await loadPasskeys()
		} catch (err: any) {
			console.error('Error registering passkey:', err)
			setPasskeyError(err.message || 'Registration was cancelled or failed.')
		} finally {
			setRegisteringPasskey(false)
		}
	}

	const handleDeletePasskey = async (passkeyId: string) => {
		setDeletingPasskeyId(passkeyId)
		setPasskeyError(null)
		try {
			const { error } = await (supabase.auth as any).passkey.delete({ passkeyId })
			if (error) throw error
			await loadPasskeys()
		} catch (err: any) {
			console.error('Error deleting passkey:', err)
			setPasskeyError(err.message || 'Failed to delete passkey.')
		} finally {
			setDeletingPasskeyId(null)
		}
	}

	useEffect(() => {
		const loadProfile = async () => {
			try {
				const supabase = createSupabaseBrowserClient()
				const {
					data: { user }
				} = await supabase.auth.getUser()

				if (!user) return

				const { data } = await supabase
					.from('profiles')
					.select('*')
					.eq('id', user.id)
					.single()

				if (data) {
					const avatarUrl = data.avatar_url || ''
					// Check if it's a base64 data URL
					const isBase64 = avatarUrl.startsWith('data:image')
					setFormData({
						full_name: data.full_name || '',
						avatar_url: isBase64 ? '' : avatarUrl
					})
					setAvatarPreview(isBase64 ? avatarUrl : avatarUrl || null)
				}
			} catch (error) {
				console.error('Error loading profile:', error)
			} finally {
				setLoading(false)
			}
		}

		loadProfile()
	}, [])

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setSaving(true)

		try {
			await updateUserProfile(formData)
			alert('Profile updated successfully!')
			onRefresh()
		} catch (error) {
			console.error('Error updating profile:', error)
			alert('Failed to update profile')
		} finally {
			setSaving(false)
		}
	}

	if (loading) {
		return <p className="text-white/60">Loading profile...</p>
	}

	return (
		<div className="space-y-8">
			<div>
				<h3 className="text-xl font-semibold text-white">Your Profile</h3>
				<p className="text-sm text-white/60">
					Update your personal information and avatar
				</p>
			</div>

			<form onSubmit={handleSubmit} className="space-y-8">
				{/* Avatar */}
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					className="flex items-center gap-6 rounded-xl border border-white/10 bg-black/20 p-6"
				>
					<div className="relative">
						{avatarPreview || formData.avatar_url ? (
							<img
								src={avatarPreview || formData.avatar_url}
								alt="Avatar"
								className="h-24 w-24 rounded-full object-cover border-2 border-white/20"
							/>
						) : (
							<div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/[0.03] border-2 border-white/20">
								<User className="h-12 w-12 text-white/60" />
							</div>
						)}
						<label className="absolute bottom-0 right-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/10 border border-white/20 hover:bg-white/20 transition">
							<Camera className="h-4 w-4 text-white" />
							<input
								type="file"
								accept="image/*"
								className="hidden"
								onChange={(e) => {
									const file = e.target.files?.[0]
									if (file) {
										// In a real app, you'd upload to storage first
										const reader = new FileReader()
										reader.onloadend = () => {
											const base64 = reader.result as string
											// Store base64 in preview, but keep URL field empty
											setAvatarPreview(base64)
											setFormData({
												...formData,
												avatar_url: base64 // Store base64 for saving
											})
										}
										reader.readAsDataURL(file)
									}
								}}
							/>
						</label>
					</div>
					<div className="flex-1">
						<h4 className="text-lg font-semibold text-white">
							Profile Picture
						</h4>
						<p className="text-sm text-white/60">
							Upload a profile picture to personalize your account
						</p>
					</div>
				</motion.div>

				{/* Personal Info */}
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.1 }}
					className="rounded-xl border border-white/10 bg-black/20 p-6"
				>
					<div className="mb-4 flex items-center gap-3">
						<User className="h-5 w-5 text-[#E0342A]" />
						<h4 className="text-lg font-semibold text-white">
							Personal Information
						</h4>
					</div>
					<div className="space-y-4">
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Full Name
							</label>
							<input
								type="text"
								value={formData.full_name}
								onChange={(e) =>
									setFormData({ ...formData, full_name: e.target.value })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="John Doe"
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Avatar URL
							</label>
							<input
								type="url"
								value={
									formData.avatar_url.startsWith('data:image')
										? ''
										: formData.avatar_url
								}
								onChange={(e) => {
									const url = e.target.value
									setFormData({ ...formData, avatar_url: url })
									// If it's a valid URL (not base64), update preview
									if (url && !url.startsWith('data:image')) {
										setAvatarPreview(url)
									} else if (!url) {
										setAvatarPreview(null)
									}
								}}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="https://example.com/avatar.jpg"
							/>
							<p className="mt-1 text-xs text-white/60">
								{avatarPreview && avatarPreview.startsWith('data:image')
									? 'Image uploaded from file. Enter a URL to replace it.'
									: 'Or paste a direct image URL'}
							</p>
						</div>
					</div>
				</motion.div>

				<div className="flex justify-end">
					<Button type="submit" disabled={saving} size="lg">
						<Save className="mr-2 h-4 w-4" />
						{saving ? 'Saving...' : 'Save Changes'}
					</Button>
				</div>
			</form>

			{/* Biometric Authentication Section */}
			<motion.div
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.2 }}
				className="rounded-xl border border-white/10 bg-black/20 p-6 space-y-6"
			>
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<Fingerprint className="h-5 w-5 text-[#E0342A]" />
						<div className="text-left">
							<h4 className="text-lg font-semibold text-white">
								Biometric Authentication (Passkeys)
							</h4>
							<p className="text-sm text-white/60">
								Manage security keys and biometrics for passwordless sign-in
							</p>
						</div>
					</div>
					<Button
						type="button"
						variant="ghost"
						onClick={handleAddPasskey}
						disabled={registeringPasskey}
						className="sm:self-center border border-white/10 hover:bg-white/5 text-xs uppercase"
					>
						{registeringPasskey ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Registering...
							</>
						) : (
							<>
								<Plus className="mr-2 h-4 w-4" />
								Add Passkey
							</>
						)}
					</Button>
				</div>

				{passkeyError && (
					<div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300 text-left">
						<AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
						<span>{passkeyError}</span>
					</div>
				)}

				<div className="space-y-3">
					{loadingPasskeys ? (
						<div className="flex items-center justify-center py-6 text-white/50 text-sm gap-2">
							<Loader2 className="h-4 w-4 animate-spin text-[#E0342A]" />
							Loading registered biometrics...
						</div>
					) : passkeys.length === 0 ? (
						<div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-white/40 text-sm">
							No biometric credentials registered yet. Add a passkey to enable Face ID or Touch ID logins.
						</div>
					) : (
						passkeys.map((pk) => (
							<div
								key={pk.id}
								className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-4 hover:border-white/10 transition-colors"
							>
								<div className="flex items-center gap-3 text-left">
									<div className="rounded-lg bg-white/5 p-2">
										<Fingerprint className="h-5 w-5 text-white/70" />
									</div>
									<div>
										<p className="text-sm font-semibold text-white">
											{pk.friendly_name || `Passkey (${pk.id.slice(0, 8)}...)`}
										</p>
										<p className="text-xs text-white/40">
											Registered on {new Date(pk.created_at).toLocaleDateString()}
										</p>
									</div>
								</div>
								<Button
									type="button"
									variant="ghost"
									onClick={() => handleDeletePasskey(pk.id)}
									disabled={deletingPasskeyId === pk.id}
									className="h-9 w-9 p-0 text-white/40 hover:text-red-400 hover:bg-red-500/10 border border-transparent"
									title="Remove Passkey"
								>
									{deletingPasskeyId === pk.id ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<Trash2 className="h-4 w-4" />
									)}
								</Button>
							</div>
						))
					)}
				</div>
			</motion.div>
		</div>
	)
}
