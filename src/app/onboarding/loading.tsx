export default function OnboardingLoading() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#040516] via-[#050A1F] to-[#020308] text-white">
			<div className="rounded-3xl border border-white/10 bg-white/5 px-10 py-16 text-center backdrop-blur-2xl">
				<p className="text-sm uppercase tracking-[0.4em] text-white/40">
					Checking tenant
				</p>
				<p className="mt-4 text-xl text-white/70">
					Preparing your onboarding experience…
				</p>
			</div>
		</div>
	)
}
