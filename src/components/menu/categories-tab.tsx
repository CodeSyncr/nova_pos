'use client'

import { useState } from 'react'
import { Plus, Edit, Trash2, Layers, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { deleteCategory, reorderCategories } from '@/app/actions/menu'
import { CategoryForm } from './category-form'
import { useToast } from '@/components/ui/toast'

type Category = {
	id: string
	name: string
	description: string | null
	position: number
}

type CategoriesTabProps = {
	tenantId: string
	categories: Category[]
	onRefresh: () => void
	readOnly?: boolean
}

export function CategoriesTab({
	tenantId,
	categories,
	onRefresh,
	readOnly
}: CategoriesTabProps) {
	const [showForm, setShowForm] = useState(false)
	const [editingCategory, setEditingCategory] = useState<Category | null>(null)
	const [draggedCategory, setDraggedCategory] = useState<string | null>(null)
	const [dragOverCategory, setDragOverCategory] = useState<string | null>(null)
	const toast = useToast()

	const sortedCategories = [...categories].sort(
		(a, b) => a.position - b.position
	)

	const handleDelete = async (categoryId: string) => {
		try {
			await deleteCategory(categoryId)
			onRefresh()
			toast.success('Category deleted successfully')
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Failed to delete category'
			)
		}
	}

	const handleDragStart = (e: React.DragEvent, categoryId: string) => {
		setDraggedCategory(categoryId)
		e.dataTransfer.effectAllowed = 'move'
		e.dataTransfer.setData('text/plain', categoryId)
	}

	const handleDragOver = (e: React.DragEvent, categoryId: string) => {
		e.preventDefault()
		e.dataTransfer.dropEffect = 'move'
		if (categoryId !== draggedCategory) {
			setDragOverCategory(categoryId)
		}
	}

	const handleDragLeave = () => {
		setDragOverCategory(null)
	}

	const handleDrop = async (e: React.DragEvent, targetCategoryId: string) => {
		e.preventDefault()
		setDragOverCategory(null)

		if (!draggedCategory || draggedCategory === targetCategoryId) {
			setDraggedCategory(null)
			return
		}

		const draggedIndex = sortedCategories.findIndex(
			(c) => c.id === draggedCategory
		)
		const targetIndex = sortedCategories.findIndex(
			(c) => c.id === targetCategoryId
		)

		if (draggedIndex === -1 || targetIndex === -1) {
			setDraggedCategory(null)
			return
		}

		// Create new order
		const newOrder = [...sortedCategories]
		const [removed] = newOrder.splice(draggedIndex, 1)
		newOrder.splice(targetIndex, 0, removed)

		// Update positions
		const updates = newOrder.map((category, index) => ({
			id: category.id,
			position: index
		}))

		try {
			await reorderCategories(updates)
			onRefresh()
			toast.success('Category order updated')
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Failed to reorder categories'
			)
		} finally {
			setDraggedCategory(null)
		}
	}

	const handleDragEnd = () => {
		setDraggedCategory(null)
		setDragOverCategory(null)
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-semibold text-white">Categories</h2>
					<p className="text-white/60">
						Organize your menu items into categories
					</p>
				</div>
				{!readOnly && (
					<Button onClick={() => setShowForm(true)}>
						<Plus className="mr-2 h-4 w-4" />
						New Category
					</Button>
				)}
			</div>

			{categories.length === 0 ? (
				<div className="rounded-[28px] border border-dashed border-white/20 bg-white/5 p-10 text-center backdrop-blur-2xl">
					<Layers className="mx-auto h-10 w-10 text-white/50" />
					<h3 className="mt-4 text-xl font-semibold text-white">
						No categories yet
					</h3>
					<p className="mt-2 text-white/60">
						Create categories to organize your menu items
					</p>
					<Button className="mt-6" onClick={() => setShowForm(true)} disabled={readOnly}>
						<Plus className="mr-2 h-4 w-4" />
						Add Category
					</Button>
				</div>
			) : (
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{sortedCategories.map((category, index) => {
						const isDragging = draggedCategory === category.id
						const isDragOver = dragOverCategory === category.id

						return (
							<div
								key={category.id}
								draggable
								onDragStart={(e) => handleDragStart(e, category.id)}
								onDragOver={(e) => handleDragOver(e, category.id)}
								onDragLeave={handleDragLeave}
								onDrop={(e) => handleDrop(e, category.id)}
								onDragEnd={handleDragEnd}
								className={`group relative rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-2xl cursor-move transition-all ${
									isDragging
										? 'opacity-50 scale-95'
										: isDragOver
											? 'border-blue-400/50 bg-blue-400/10 scale-105'
											: 'hover:border-white/20 hover:bg-white/10'
								}`}
							>
								{/* Drag Handle */}
								<div className="absolute left-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
									<GripVertical className="h-4 w-4 text-white/40" />
								</div>

								<div className="flex flex-col h-full">
									<div className="flex items-start justify-between gap-2 mb-2">
										<div className="flex-1 min-w-0 pl-6">
											<h3 className="text-base font-semibold text-white truncate">
												{category.name}
											</h3>
										</div>
										<div className="flex gap-1 shrink-0">
											{!readOnly && (
											<>
											<Button
												size="icon"
												variant="ghost"
												className="h-7 w-7 border border-white/15 bg-white/5 text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
												onClick={(e: React.MouseEvent) => {
													e.stopPropagation()
													setEditingCategory(category)
													setShowForm(true)
												}}
											>
												<Edit className="h-3.5 w-3.5" />
											</Button>
											<AlertDialog>
												<AlertDialogTrigger asChild>
													<Button
														size="icon"
														variant="ghost"
														className="h-7 w-7 border border-white/15 bg-white/5 text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
														onClick={(e: React.MouseEvent) =>
															e.stopPropagation()
														}
													>
														<Trash2 className="h-3.5 w-3.5" />
													</Button>
												</AlertDialogTrigger>
												<AlertDialogContent>
													<AlertDialogHeader>
														<AlertDialogTitle>
															Delete "{category.name}" category?
														</AlertDialogTitle>
														<AlertDialogDescription>
															This will remove the category and detach any menu
															items currently assigned to it. This action cannot
															be undone.
														</AlertDialogDescription>
													</AlertDialogHeader>
													<AlertDialogFooter>
														<AlertDialogCancel>Keep category</AlertDialogCancel>
														<AlertDialogAction
															onClick={() => handleDelete(category.id)}
														>
															Delete
														</AlertDialogAction>
													</AlertDialogFooter>
												</AlertDialogContent>
											</AlertDialog>
											</>
											)}
										</div>
									</div>
									{category.description && (
										<p className="text-xs text-white/60 line-clamp-2 mb-2">
											{category.description}
										</p>
									)}
									<Badge className="border-white/20 bg-white/10 text-white/80 text-xs w-fit">
										Position {index + 1}
									</Badge>
								</div>
							</div>
						)
					})}
				</div>
			)}

			{showForm && (
				<CategoryForm
					tenantId={tenantId}
					category={editingCategory}
					onClose={() => {
						setShowForm(false)
						setEditingCategory(null)
					}}
					onSuccess={onRefresh}
				/>
			)}
		</div>
	)
}
