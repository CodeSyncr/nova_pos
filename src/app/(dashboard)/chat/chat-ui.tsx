'use client'

/**
 * Presentational pieces for the team chat.
 *
 * Built in the app's own language rather than a messenger pastiche: near-black
 * glass surfaces, heavy backdrop blur, deep soft shadows, generous radii and
 * the red accent — the same vocabulary as the dashboard shell.
 *
 * The one flourish is an ambient gradient field behind the thread, which gives
 * the conversation depth without the noise of a tiled pattern.
 */

import { motion } from 'framer-motion'
import { Check, CheckCheck, Users, Lock, Receipt, ListChecks, Share2, Undo2 } from 'lucide-react'

/**
 * Ambient backdrop for the message area: two slow accent glows over near-black.
 * Pointer-events-none so it never intercepts scrolling or clicks.
 */
export function AmbientField() {
	return (
		<div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
			<div className="absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-[hsl(var(--accent))]/[0.07] blur-[120px]" />
			<div className="absolute -bottom-32 right-[-10%] h-[460px] w-[460px] rounded-full bg-[#4b2ee0]/[0.06] blur-[130px]" />
			<div className="absolute left-1/3 top-1/2 h-[300px] w-[300px] rounded-full bg-[hsl(var(--accent))]/[0.04] blur-[100px]" />
		</div>
	)
}

/** Deterministic gradient per person, so someone keeps the same identity colour. */
const AVATAR_GRADIENTS = [
	'from-[#e0342a] to-[#ff7a5c]',
	'from-[#7c3aed] to-[#c084fc]',
	'from-[#0ea5e9] to-[#38bdf8]',
	'from-[#059669] to-[#34d399]',
	'from-[#d97706] to-[#fbbf24]',
	'from-[#db2777] to-[#f472b6]',
	'from-[#0891b2] to-[#22d3ee]',
	'from-[#4f46e5] to-[#818cf8]'
]

function gradientFor(seed: string): string {
	let hash = 0
	for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
	return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]!
}

function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean)
	if (parts.length === 0) return '?'
	if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
	return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}

export function Avatar({
	name,
	kind = 'direct',
	size = 'md',
	online
}: {
	name: string
	kind?: 'direct' | 'group' | 'channel'
	size?: 'sm' | 'md'
	online?: boolean
}) {
	const dimension = size === 'sm' ? 'h-10 w-10 text-[12px]' : 'h-11 w-11 text-[13px]'

	return (
		<div className="relative flex-shrink-0">
			<div
				className={`${dimension} flex items-center justify-center rounded-2xl bg-gradient-to-br ${
					kind === 'direct' ? gradientFor(name) : 'from-white/20 to-white/5'
				} font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-1 ring-white/10`}
			>
				{kind === 'channel' ? (
					<Lock className="h-4 w-4" />
				) : kind === 'group' ? (
					<Users className="h-[18px] w-[18px]" />
				) : (
					initials(name)
				)}
			</div>
			{online && (
				<span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[hsl(var(--background))] bg-emerald-400" />
			)}
		</div>
	)
}

export function Ticks({ read }: { read: boolean }) {
	return read ? (
		<CheckCheck className="h-3.5 w-3.5 text-sky-300" />
	) : (
		<Check className="h-3.5 w-3.5 text-white/40" />
	)
}

/** Floating glass pill separating days. */
export function DateDivider({ label }: { label: string }) {
	return (
		<div className="my-5 flex justify-center">
			<span className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 backdrop-blur-xl">
				{label}
			</span>
		</div>
	)
}

export type BubbleProps = {
	mine: boolean
	body: string | null
	time: string
	senderName?: string | null
	showSender: boolean
	/** First message of a run — gets the wider corner and more top spacing. */
	showTail: boolean
	deleted?: boolean
	read?: boolean
	index: number
}

export function MessageBubble({
	mine,
	body,
	time,
	senderName,
	showSender,
	showTail,
	deleted,
	read = false,
	index
}: BubbleProps) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			// Stagger only the first handful, so loading a long history does not
			// turn into a slow cascade.
			transition={{ duration: 0.22, delay: Math.min(index, 8) * 0.015 }}
			className={`flex ${mine ? 'justify-end' : 'justify-start'} ${showTail ? 'mt-3' : 'mt-1'}`}
		>
			<div
				className={[
					'relative max-w-[85%] px-3.5 py-2.5 text-[14px] leading-[20px] backdrop-blur-xl sm:max-w-[min(78%,560px)]',
					// The squared corner marks who is speaking, replacing a tail.
					mine
						? 'rounded-3xl bg-gradient-to-br from-[hsl(var(--accent))] to-[hsl(var(--accent))]/80 text-white shadow-[0_10px_30px_-8px_hsl(var(--accent)/0.55)]'
						: 'rounded-3xl border border-white/10 bg-white/[0.06] text-white/90 shadow-[0_10px_30px_rgba(0,0,0,0.35)]',
					showTail ? (mine ? 'rounded-tr-md' : 'rounded-tl-md') : ''
				].join(' ')}
			>
				{showSender && !mine && (
					<p
						className={`mb-1 bg-gradient-to-r ${gradientFor(senderName ?? '?')} bg-clip-text text-[12px] font-semibold text-transparent`}
					>
						{senderName ?? 'Someone'}
					</p>
				)}

				<span className="whitespace-pre-wrap break-words">
					{deleted ? (
						<span className="italic opacity-50">This message was deleted</span>
					) : (
						body
					)}
					{/* Reserves room so the timestamp can sit on the last line. */}
					<span className="inline-block w-[58px]" />
				</span>

				<span
					className={`absolute bottom-1.5 right-3 flex items-center gap-1 text-[10px] ${
						mine ? 'text-white/65' : 'text-white/35'
					}`}
				>
					{time}
					{mine && !deleted && <Ticks read={read} />}
				</span>
			</div>
		</motion.div>
	)
}

/** Empty state for the thread pane. */
export function EmptyThread() {
	return (
		<div className="relative flex flex-1 flex-col items-center justify-center gap-4 text-center">
			<div className="relative">
				<div className="absolute inset-0 rounded-full bg-[hsl(var(--accent))]/20 blur-2xl" />
				<div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
					<Users className="h-8 w-8 text-white/30" />
				</div>
			</div>
			<div>
				<p className="text-sm font-medium text-white/70">No conversation selected</p>
				<p className="mt-1 text-xs text-white/35">Pick a chat, or start a new one</p>
			</div>
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* AI analysis card                                                            */
/* -------------------------------------------------------------------------- */

export type AnalysisCardProps = {
	analysis: {
		kind: 'purchase' | 'list' | 'none'
		entryCount: number
		totalAmount: number | null
		correctedText: string | null
		autoApproved: boolean
		entries: { id: string; itemName: string; category: string; amount: number | null }[]
	}
	mine: boolean
	currency: string
	/** Whether this viewer may see money. Staff get the card, not the figures. */
	showAmounts: boolean
	/** Sharing a vendor order is an owner/admin action. */
	canShare: boolean
	/** Reverses an auto-approved entry. */
	onUndo?: (entryId: string) => void
}

/**
 * The AI's verdict on a message, rendered beneath it.
 *
 * Two shapes: an expense that has been queued for approval, or a shopping list
 * cleaned up and ready to send a vendor.
 */
export function AnalysisCard({
	analysis,
	mine,
	currency,
	showAmounts,
	canShare,
	onUndo
}: AnalysisCardProps) {
	if (analysis.kind === 'none') return null

	if (analysis.kind === 'list') {
		const text = analysis.correctedText ?? ''
		// wa.me carries the corrected list; the vendor's number is picked in
		// WhatsApp itself, so no number needs storing here.
		const shareUrl = `https://wa.me/?text=${encodeURIComponent(text)}`

		return (
			<motion.div
				initial={{ opacity: 0, y: 4 }}
				animate={{ opacity: 1, y: 0 }}
				className={`mt-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}
			>
				<div className="max-w-[85%] rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.07] p-3 backdrop-blur-xl sm:max-w-[min(78%,560px)]">
					<p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">
						<ListChecks className="h-3 w-3" />
						Order list · {analysis.entryCount} items · spelling fixed
					</p>
					<pre className="mt-2 whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-white/80">
						{text}
					</pre>
					{canShare && (
						<a
							href={shareUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-1.5 text-[11px] font-semibold text-white transition-transform hover:scale-105"
						>
							<Share2 className="h-3 w-3" />
							Send to vendor on WhatsApp
						</a>
					)}
				</div>
			</motion.div>
		)
	}

	return (
		<motion.div
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			className={`mt-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}
		>
			<div
				className={`max-w-[85%] rounded-2xl border p-3 backdrop-blur-xl sm:max-w-[min(78%,560px)] ${
					analysis.autoApproved
						? 'border-emerald-400/25 bg-emerald-400/[0.07]'
						: 'border-amber-400/25 bg-amber-400/[0.07]'
				}`}
			>
				<p
					className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ${
						analysis.autoApproved ? 'text-emerald-300' : 'text-amber-300'
					}`}
				>
					<Receipt className="h-3 w-3" />
					{analysis.autoApproved ? 'Added to books' : 'Logged as expense'} ·{' '}
					{analysis.entryCount} {analysis.entryCount === 1 ? 'entry' : 'entries'}
				</p>

				{showAmounts ? (
					<>
						<ul className="mt-2 space-y-1">
							{analysis.entries.map((e, i) => (
								<li key={i} className="flex items-baseline justify-between gap-3 text-[13px]">
									<span className="truncate capitalize text-white/80">
										{e.itemName}
										<span className="ml-1.5 text-[10px] uppercase tracking-wide text-white/35">
											{e.category}
										</span>
									</span>
									<span className="flex-shrink-0 font-medium text-white/90">
										{e.amount == null ? '—' : `${currency}${e.amount.toLocaleString('en-IN')}`}
									</span>
								</li>
							))}
						</ul>
						{analysis.totalAmount != null && analysis.entryCount > 1 && (
							<p className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-1.5 text-[13px]">
								<span className="text-white/50">Total</span>
								<span className="font-semibold text-amber-200">
									{currency}
									{analysis.totalAmount.toLocaleString('en-IN')}
								</span>
							</p>
						)}
						{analysis.autoApproved ? (
							<div className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-1.5">
								<span className="text-[10px] text-white/35">
									Approved automatically — you can approve expenses
								</span>
								{onUndo && analysis.entries.length > 0 && (
									// The extractor can misread an amount, so anything that
									// reached the books without review stays one tap from
									// being taken back out.
									<button
										onClick={() => analysis.entries.forEach((e) => onUndo(e.id))}
										className="flex flex-shrink-0 items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-medium text-white/60 transition-colors hover:border-white/30 hover:text-white"
									>
										<Undo2 className="h-3 w-3" />
										Undo
									</button>
								)}
							</div>
						) : (
							<p className="mt-1.5 text-[10px] text-white/35">Awaiting approval in Review</p>
						)}
					</>
				) : (
					// Staff see that their message was captured, never the figures.
					<p className="mt-1.5 text-[12px] text-white/55">
						Recorded and sent for approval. Amounts are visible to managers only.
					</p>
				)}
			</div>
		</motion.div>
	)
}
