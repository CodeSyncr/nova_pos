'use client'

import { useState } from 'react'
import { Plus, Edit, Trash2, Package, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { IngredientForm } from './ingredient-form'
import { deleteIngredient } from '@/app/actions/menu'
import { useToast } from '@/components/ui/toast'
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

type Ingredient = {
	id: string
	name: string
	unit: string | null
	allergen_info: string | null
}

type MenuItem = {
	id: string
	name: string
}

type IngredientsTabProps = {
	tenantId: string
	ingredients: Ingredient[]
	menuItems: MenuItem[] // Reserved for future linking feature
	onRefresh: () => void
	readOnly?: boolean
}

export function IngredientsTab({
	tenantId,
	ingredients,
	menuItems: _menuItems, // eslint-disable-line @typescript-eslint/no-unused-vars
	onRefresh,
	readOnly
}: IngredientsTabProps) {
	const [showForm, setShowForm] = useState(false)
	const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(
		null
	)
	const [deletingId, setDeletingId] = useState<string | null>(null)
	const toast = useToast()

	const handleDelete = async (ingredientId: string) => {
		setDeletingId(ingredientId)
		try {
			await deleteIngredient(ingredientId)
			onRefresh()
			toast.success('Ingredient deleted successfully')
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Failed to delete ingredient'
			)
		} finally {
			setDeletingId(null)
		}
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-semibold text-white">Ingredients</h2>
					<p className="text-white/60">
						Manage your pantry and link ingredients to menu items
					</p>
				</div>
				<Button onClick={() => setShowForm(true)}>
					<Plus className="mr-2 h-4 w-4" />
					New Ingredient
				</Button>
			</div>

			{ingredients.length === 0 ? (
				<div className="rounded-[28px] border border-dashed border-white/20 bg-white/5 p-10 text-center backdrop-blur-2xl">
					<Package className="mx-auto h-10 w-10 text-white/50" />
					<h3 className="mt-4 text-xl font-semibold text-white">
						No ingredients yet
					</h3>
					<p className="mt-2 text-white/60">
						Start by adding your first ingredient to the pantry
					</p>
					<Button className="mt-6" onClick={() => setShowForm(true)}>
						<Plus className="mr-2 h-4 w-4" />
						Add Ingredient
					</Button>
				</div>
			) : (
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{ingredients.map((ingredient) => (
						<div
							key={ingredient.id}
							className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-2xl"
						>
							<div className="flex items-start justify-between">
								<div className="flex-1">
									<h3 className="text-lg font-semibold text-white">
										{ingredient.name}
									</h3>
									{ingredient.unit && (
										<p className="mt-1 text-sm text-white/60">
											Unit: {ingredient.unit}
										</p>
									)}
									{ingredient.allergen_info && (
										<Badge className="mt-2 border-red-400/30 bg-red-400/10 text-red-200">
											{ingredient.allergen_info}
										</Badge>
									)}
								</div>
								<div className="flex gap-1">
									<Button
										size="icon"
										variant="ghost"
										className="border border-white/15 bg-white/5 text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
										onClick={() => {
											setEditingIngredient(ingredient)
											setShowForm(true)
										}}
									>
										<Edit className="h-4 w-4" />
									</Button>
									<AlertDialog>
										<AlertDialogTrigger asChild>
											<Button
												size="icon"
												variant="ghost"
												className="border border-white/15 bg-white/5 text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</AlertDialogTrigger>
										<AlertDialogContent>
											<AlertDialogHeader>
												<AlertDialogTitle>
													Delete “{ingredient.name}”?
												</AlertDialogTitle>
												<AlertDialogDescription>
													This ingredient will be removed from your pantry and
													any future recipes. This action cannot be undone.
												</AlertDialogDescription>
											</AlertDialogHeader>
											<AlertDialogFooter>
												<AlertDialogCancel
													disabled={deletingId === ingredient.id}
												>
													Keep ingredient
												</AlertDialogCancel>
												<AlertDialogAction
													onClick={() => handleDelete(ingredient.id)}
													disabled={deletingId === ingredient.id}
													className="min-w-[100px]"
												>
													{deletingId === ingredient.id ? (
														<>
															<Loader2 className="mr-2 h-4 w-4 animate-spin" />
															Deleting...
														</>
													) : (
														'Delete'
													)}
												</AlertDialogAction>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>
								</div>
							</div>
						</div>
					))}
				</div>
			)}

			{showForm && (
				<IngredientForm
					tenantId={tenantId}
					ingredient={editingIngredient}
					onClose={() => {
						setShowForm(false)
						setEditingIngredient(null)
					}}
					onSuccess={onRefresh}
				/>
			)}
		</div>
	)
}
