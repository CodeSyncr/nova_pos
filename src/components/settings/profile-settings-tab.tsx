'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Save, User, Camera } from 'lucide-react'
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
		</div>
	)
}
