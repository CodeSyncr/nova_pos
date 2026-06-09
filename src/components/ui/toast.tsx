'use client'

import {
	createContext,
	useContext,
	useState,
	useCallback,
	ReactNode
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastType = 'success' | 'error' | 'info' | 'warning'

type Toast = {
	id: string
	message: string
	type: ToastType
	duration?: number
}

type ToastContextType = {
	toast: (message: string, type?: ToastType, duration?: number) => void
	success: (message: string, duration?: number) => void
	error: (message: string, duration?: number) => void
	info: (message: string, duration?: number) => void
	warning: (message: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([])

	const removeToast = useCallback((id: string) => {
		setToasts((prev) => prev.filter((toast) => toast.id !== id))
	}, [])

	const addToast = useCallback(
		(message: string, type: ToastType = 'info', duration = 3000) => {
			const id = Math.random().toString(36).substring(7)
			const newToast: Toast = { id, message, type, duration }

			setToasts((prev) => [...prev, newToast])

			if (duration > 0) {
				setTimeout(() => {
					removeToast(id)
				}, duration)
			}
		},
		[removeToast]
	)

	const toast = useCallback(
		(message: string, type: ToastType = 'info', duration?: number) => {
			addToast(message, type, duration)
		},
		[addToast]
	)

	const success = useCallback(
		(message: string, duration?: number) => {
			addToast(message, 'success', duration)
		},
		[addToast]
	)

	const error = useCallback(
		(message: string, duration?: number) => {
			addToast(message, 'error', duration)
		},
		[addToast]
	)

	const info = useCallback(
		(message: string, duration?: number) => {
			addToast(message, 'info', duration)
		},
		[addToast]
	)

	const warning = useCallback(
		(message: string, duration?: number) => {
			addToast(message, 'warning', duration)
		},
		[addToast]
	)

	const getIcon = (type: ToastType) => {
		switch (type) {
			case 'success':
				return <CheckCircle2 className="h-5 w-5 text-white" />
			case 'error':
				return <AlertCircle className="h-5 w-5 text-[#E0342A]" />
			case 'warning':
				return <AlertTriangle className="h-5 w-5 text-[#E0342A]" />
			case 'info':
			default:
				return <Info className="h-5 w-5 text-white/70" />
		}
	}

	const getBgColor = (type: ToastType) => {
		switch (type) {
			case 'success':
				return 'bg-white/10 border-white/20'
			case 'error':
				return 'bg-[#E0342A]/15 border-[#E0342A]/30'
			case 'warning':
				return 'bg-[#E0342A]/10 border-[#E0342A]/30'
			case 'info':
			default:
				return 'bg-white/[0.03] border-white/10'
		}
	}

	return (
		<ToastContext.Provider value={{ toast, success, error, info, warning }}>
			{children}
			<div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
				<AnimatePresence>
					{toasts.map((toast) => (
						<motion.div
							key={toast.id}
							initial={{ opacity: 0, y: 20, scale: 0.95 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: -20, scale: 0.95 }}
							className={cn(
								'flex items-center gap-3 rounded-xl border p-4 backdrop-blur-2xl shadow-lg min-w-[300px] max-w-[400px]',
								getBgColor(toast.type)
							)}
						>
							{getIcon(toast.type)}
							<p className="flex-1 text-sm font-medium text-white">
								{toast.message}
							</p>
							<button
								onClick={() => removeToast(toast.id)}
								className="rounded-lg p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
							>
								<X className="h-4 w-4" />
							</button>
						</motion.div>
					))}
				</AnimatePresence>
			</div>
		</ToastContext.Provider>
	)
}

export function useToast() {
	const context = useContext(ToastContext)
	if (!context) {
		throw new Error('useToast must be used within ToastProvider')
	}
	return context
}
