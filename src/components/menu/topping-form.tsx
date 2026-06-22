'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { X, Save, Trash2, ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createTopping, updateTopping } from '@/app/actions/menu'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type Topping = {
	id: string
	name: string
	description: string | null
	price: number
	category: string | null
	image_url: string | null
}

type Category = {
	id: string
	name: string
}

type ToppingFormProps = {
	tenantId: string
	topping?: Topping | null
	onClose: () => void
	onSuccess: () => void
	currencySymbol: string
	categories?: Category[]
}

export function ToppingForm({
	tenantId,
	topping,
	onClose,
	onSuccess,
	currencySymbol: _currencySymbol, // eslint-disable-line @typescript-eslint/no-unused-vars
	categories = []
}: ToppingFormProps) {
	const [name, setName] = useState(topping?.name || '')
	const [description, setDescription] = useState(topping?.description || '')
	const [price, setPrice] = useState(topping?.price.toString() || '0')
	const [imageUrl, setImageUrl] = useState(topping?.image_url || '')
	const [categoryIds, setCategoryIds] = useState<string[]>(
		topping?.category
			? topping.category
					.split(',')
					.map((id) => id.trim())
					.filter(Boolean)
			: []
	)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [isUploading, setIsUploading] = useState(false)

	const [categorySearch, setCategorySearch] = useState('')

	const filteredCategories = useMemo(
		() =>
			categories.filter((cat) =>
				cat.name.toLowerCase().includes(categorySearch.toLowerCase())
			),
		[categories, categorySearch]
	)

	const selectedCategoryNames = useMemo(
		() =>
			categories.filter((c) => categoryIds.includes(c.id)).map((c) => c.name),
		[categories, categoryIds]
	)

	const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return

		setIsUploading(true)
		const supabase = createSupabaseBrowserClient()

		const fileExt = file.name.split('.').pop()
		const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${fileExt}`
		const filePath = `${tenantId}/${fileName}`

		try {
			const { error: uploadError } = await supabase.storage
				.from('toppings')
				.upload(filePath, file, {
					cacheControl: '3600',
					upsert: true
				})

			if (uploadError) {
				throw uploadError
			}

			const { data } = supabase.storage.from('toppings').getPublicUrl(filePath)
			if (data?.publicUrl) {
				setImageUrl(data.publicUrl)
			}
		} catch (error) {
			console.error('Image upload failed:', error)
			alert(error instanceof Error ? error.message : 'Failed to upload image')
		} finally {
			setIsUploading(false)
		}
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setIsSubmitting(true)

		try {
			if (topping) {
				await updateTopping(topping.id, {
					name,
					description,
					price: parseFloat(price),
					category: categoryIds.length ? categoryIds.join(',') : undefined,
					imageUrl: imageUrl.trim() || null
				})
			} else {
				await createTopping(tenantId, {
					name,
					description,
					price: parseFloat(price),
					category: categoryIds.length ? categoryIds.join(',') : undefined,
					imageUrl: imageUrl.trim() || null
				})
			}
			onSuccess()
			onClose()
		} catch (error) {
			console.error('Error saving topping:', error)
			alert(error instanceof Error ? error.message : 'Failed to save add on')
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<div className="fixed inset-0 z-50">
			<div
				className="absolute inset-0 bg-black/60 backdrop-blur-sm"
				onClick={onClose}
			/>
			<motion.div
				initial={{ opacity: 0, x: 80 }}
				animate={{ opacity: 1, x: 0 }}
				exit={{ opacity: 0, x: 80 }}
				className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-black p-8 shadow-[0_40px_120px_rgba(3,5,18,0.85)]"
			>
				<div className="flex items-center justify-between mb-6">
					<div>
						<p className="text-xs uppercase tracking-[0.3em] text-white/50">
							Add&#x2011;ons
						</p>
						<h2 className="mt-1 text-2xl font-semibold text-white">
							{topping ? 'Edit add on' : 'New add on'}
						</h2>
					</div>
					<Button size="icon" variant="ghost" onClick={onClose}>
						<X className="h-5 w-5" />
					</Button>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4 pb-6">
					<div>
						<label className="block text-sm font-medium text-white/70 mb-2">
							Name *
						</label>
						<input
							type="text"
							required
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							placeholder="e.g., Truffle Oil"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-white/70 mb-2">
							Description
						</label>
						<textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={3}
							className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none resize-none"
							placeholder="Brief description of this add on"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-white/70 mb-2">
							Price *
						</label>
						<input
							type="number"
							step="0.01"
							min="0"
							required
							value={price}
							onChange={(e) => setPrice(e.target.value)}
							className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
						/>
					</div>

					{/* Topping Image */}
					<section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-xs uppercase tracking-[0.3em] text-white/50">
									Topping Image
								</p>
								<p className="text-xs text-white/40 mt-1">
									PNG image used on the pizza builder
								</p>
							</div>
							<label className="relative flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 hover:bg-white/15 px-3 py-2 text-white text-xs font-medium cursor-pointer transition whitespace-nowrap">
								<ImagePlus className="h-3.5 w-3.5" />
								{isUploading ? 'Uploading...' : 'Upload'}
								<input
									type="file"
									accept="image/png,image/webp,image/svg+xml"
									onChange={handleImageUpload}
									disabled={isUploading}
									className="hidden"
								/>
							</label>
						</div>
						<input
							type="url"
							value={imageUrl}
							onChange={(e) => setImageUrl(e.target.value)}
							className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							placeholder="https://... or upload a file"
						/>
						{imageUrl.trim() && (
							<div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-3 flex items-center justify-center">
								<img
									src={imageUrl}
									alt={name || 'Topping preview'}
									className="h-24 w-24 object-contain"
									style={{ imageRendering: 'auto' }}
								/>
								<button
									type="button"
									onClick={() => setImageUrl('')}
									className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition"
								>
									<Trash2 className="h-3.5 w-3.5" />
								</button>
							</div>
						)}
					</section>

					<section className="mt-4 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
						<div className="flex items-start justify-between gap-3">
							<div className="flex-1 min-w-0">
								<p className="text-xs uppercase tracking-[0.3em] text-white/50">
									Visibility
								</p>
								<p className="text-sm text-white/70">
									Choose which menu categories should see this add on.
								</p>
								<p className="mt-1 text-xs text-white/50 line-clamp-2">
									{selectedCategoryNames.length
										? `Visible in: ${selectedCategoryNames.join(' \u2022 ')}`
										: 'Not linked to any category \u2014 this add on will not appear on menu items.'}
								</p>
							</div>
							{categories.length > 0 && (
								<div className="w-40">
									<input
										type="text"
										value={categorySearch}
										onChange={(e) => setCategorySearch(e.target.value)}
										placeholder="Search..."
										className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
									/>
								</div>
							)}
						</div>
						<div className="max-h-32 overflow-y-auto">
							<div className="flex flex-wrap gap-2">
								{filteredCategories.map((cat) => {
									const selected = categoryIds.includes(cat.id)
									return (
										<button
											key={cat.id}
											type="button"
											onClick={() =>
												setCategoryIds((prev) =>
													prev.includes(cat.id)
														? prev.filter((id) => id !== cat.id)
														: [...prev, cat.id]
												)
											}
											className={`rounded-full border px-3 py-1 text-xs transition ${
												selected
													? 'border-[#E0342A]/30 bg-[#E0342A]/15 text-white'
													: 'border-white/15 bg-white/5 text-white/70 hover:border-white/30 hover:bg-white/10'
											}`}
										>
											{cat.name}
										</button>
									)
								})}
								{categories.length === 0 && (
									<p className="text-xs text-white/50">
										No categories yet. Create categories first.
									</p>
								)}
								{categories.length > 0 && filteredCategories.length === 0 && (
									<p className="text-xs text-white/50">
										No categories match &ldquo;{categorySearch}&rdquo;.
									</p>
								)}
							</div>
						</div>
					</section>

					<div className="flex gap-3 pt-4">
						<Button
							type="button"
							variant="ghost"
							onClick={onClose}
							className="flex-1"
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting} className="flex-1">
							<Save className="mr-2 h-4 w-4" />
							{isSubmitting ? 'Saving...' : 'Save'}
						</Button>
					</div>
				</form>
			</motion.div>
		</div>
	)
}
