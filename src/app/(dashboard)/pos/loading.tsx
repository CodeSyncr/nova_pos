export default function POSLoading() {
	return (
		<div className="flex h-[calc(100vh-120px)] items-center justify-center">
			<div className="text-center">
				<div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white/60 mx-auto" />
				<p className="text-white/60">Loading POS...</p>
			</div>
		</div>
	)
}
