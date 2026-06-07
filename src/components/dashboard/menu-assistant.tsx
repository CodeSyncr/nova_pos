'use client'

import { FormEvent, useMemo, useState } from 'react'
import { Sparkles, RefreshCcw, Flame, Leaf, Fish } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type MenuIdea = {
	id: string
	title: string
	summary: string
	variants: string[]
	toppings: string[]
	sop: string
	icon: 'flame' | 'leaf' | 'fish'
}

type Theme = {
	id: string
	matchers: RegExp[]
	label: string
	palette: {
		primary: string
		accent: string
	}
}

const THEMES: Theme[] = [
	{
		id: 'pasta',
		matchers: [/pasta/i, /ital/i, /linguine/i, /penne/i],
		label: 'Neo-Trattoria',
		palette: { primary: '#FF7A7A', accent: '#FFD89D' }
	},
	{
		id: 'smoke',
		matchers: [/smok/i, /grill/i, /bbq/i],
		label: 'Ember Lab',
		palette: { primary: '#FFB347', accent: '#FFD194' }
	},
	{
		id: 'plant',
		matchers: [/vegan/i, /plant/i, /garden/i],
		label: 'Botanical Atelier',
		palette: { primary: '#7ED957', accent: '#C3FF93' }
	},
	{
		id: 'sea',
		matchers: [/sea/i, /ocean/i, /sushi/i, /tide/i],
		label: 'Tidal Works',
		palette: { primary: '#6DD5ED', accent: '#F6F9FF' }
	},
	{
		id: 'default',
		matchers: [/./],
		label: 'Future Bistro',
		palette: { primary: '#9C6BFF', accent: '#C9A8FF' }
	}
]

const SAMPLE_PROMPTS = [
	'Smoky pasta bar with vegan-forward toppings',
	'High-volume POS concept for craft ramen & bao',
	'Upscale tapas bar with tableside flambé desserts'
]

function detectTheme(prompt: string): Theme {
	const entry = THEMES.find((theme) =>
		theme.matchers.some((regex) => regex.test(prompt))
	)
	return entry ?? THEMES[THEMES.length - 1]!
}

function buildIdeas(prompt: string): MenuIdea[] {
	const theme = detectTheme(prompt)
	const baseHash = Math.abs(
		Array.from(prompt).reduce((acc, char) => acc + char.charCodeAt(0), 0)
	)
	const focusWords = prompt.toLowerCase().split(/\W+/).filter(Boolean)
	const hasSpice = focusWords.some((word) =>
		['spicy', 'chili', 'fiery', 'smoke'].includes(word)
	)
	const hasVegan = focusWords.some(
		(word) => word.includes('vegan') || word.includes('plant')
	)
	const hasSea = focusWords.some((word) =>
		['seafood', 'salmon', 'ocean'].includes(word)
	)

	const blueprints: MenuIdea[] = [
		{
			id: `${theme.id}-1`,
			title:
				theme.id === 'pasta'
					? 'Coal-Fired Chili Linguine'
					: theme.id === 'plant'
						? 'Forest Umami Tagliatelle'
						: 'Midnight Ember Pasta',
			summary:
				'Hand-cut pasta finished in a carbon-steel wok with smoked Calabrian butter, charred lemon, and a table-side aromatic mist.',
			variants: [
				'Linguine · Fermented chili glaze',
				'Penne · Black garlic cream',
				'Rigatoni · Bone marrow crumble'
			],
			toppings: [
				'Truffle ember oil',
				'Burrata snow',
				'Fire-kissed broccolini',
				'Smoked tomato dust'
			],
			sop: 'Step 2 holds the key: emulsify pasta water with the smoked butter, then finish with a 8-second flambé for aroma.',
			icon: hasSpice ? 'flame' : hasVegan ? 'leaf' : 'flame'
		},
		{
			id: `${theme.id}-2`,
			title:
				hasSea && theme.id !== 'plant'
					? 'Tidal Saffron Casarecce'
					: hasVegan
						? 'Green Lab Trofie'
						: 'Velvet Porcini Coil',
			summary:
				'An AI-curated balance of texture and aroma—designed for lightning-fast POS builds yet plating like a chef’s table.',
			variants: [
				'Fresh casarecce · kombu beurre blanc',
				'Cuttlefish ink pici · burnt yuzu butter',
				'Chickpea trofie · pistachio pesto espuma'
			],
			toppings: [
				'Candied fennel pollen',
				'Crisp maitake shards',
				'Charcoal sesame crumble',
				'Compressed citrus pearls'
			],
			sop: 'SOP emphasizes mise: weigh pasta into color-coded bins, batch roast aromatics, finish with rapid thermal gun for consistent warmth.',
			icon: hasSea ? 'fish' : hasVegan ? 'leaf' : 'flame'
		},
		{
			id: `${theme.id}-3`,
			title:
				hasVegan && !hasSea
					? 'Solar Garden Cappellini'
					: 'Black Lime Prawn Fettuccine',
			summary:
				'Designed for modular toppings—guests pick their noodle, heat profile, and finishers, while the kitchen follows a 4-step SOP.',
			variants: [
				'Capellini · lemongrass confit tomato',
				'Fettuccine · burnt miso crème',
				'Parpadelle · citrus-cured prawn butter'
			],
			toppings: [
				'Smoked hazelnut pangrattato',
				'Pickled jalapeño relish',
				'Micro shiso bouquet',
				'Activated charcoal ricotta'
			],
			sop: 'Step 3 is interactive: a “finish station” where burrata, oils, and dusts sit in a chilled rail for quick assembly.',
			icon: hasVegan ? 'leaf' : hasSea ? 'fish' : 'flame'
		}
	]

	// Deterministic shuffle so the UI changes slightly per prompt without randomness
	return blueprints.map((idea, index) => ({
		...idea,
		title: idea.title.replace('Pasta', theme.label.split(' ')[0]),
		summary:
			index === 1
				? `${idea.summary} AI focus: ${theme.label} vibe with ${focusWords.slice(0, 3).join(', ')} accents.`
				: idea.summary,
		id: `${idea.id}-${(baseHash + index) % 9999}`
	}))
}

export function MenuAssistant() {
	const [prompt, setPrompt] = useState(SAMPLE_PROMPTS[0]!)
	const [ideas, setIdeas] = useState<MenuIdea[]>(() =>
		buildIdeas(SAMPLE_PROMPTS[0]!)
	)
	const [isGenerating, setIsGenerating] = useState(false)
	const theme = useMemo(() => detectTheme(prompt), [prompt])

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault()
		setIsGenerating(true)
		setTimeout(() => {
			setIdeas(buildIdeas(prompt))
			setIsGenerating(false)
		}, 450)
	}

	const handleShuffle = () => {
		const nextPrompt =
			SAMPLE_PROMPTS[Math.floor(Math.random() * SAMPLE_PROMPTS.length)] ??
			SAMPLE_PROMPTS[0]!
		setPrompt(nextPrompt)
		setIdeas(buildIdeas(nextPrompt))
	}

	return (
		<section
			className="rounded-[28px] border p-6 backdrop-blur-2xl shadow-[0_40px_120px_rgba(6,9,20,0.55)]"
			style={{
				borderColor: `${theme.palette.primary}40`,
				backgroundImage: `linear-gradient(135deg, ${theme.palette.primary}15, ${theme.palette.accent}0f)`
			}}
		>
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<p className="text-xs uppercase tracking-[0.4em] text-white/60">
						AI sous-chef
					</p>
					<h2 className="mt-2 text-2xl font-semibold text-white">
						Menu co-pilot
					</h2>
					<p className="text-white/70">
						Describe the vibe. We’ll mock up dishes, variants, toppings, and SOP
						cues for your team.
					</p>
				</div>
				<div className="flex gap-2">
					<Button variant="ghost" size="sm" onClick={handleShuffle}>
						<RefreshCcw className="mr-2 h-4 w-4" />
						Inspire me
					</Button>
				</div>
			</div>

			<form onSubmit={handleSubmit} className="mt-6 space-y-4">
				<label className="text-xs uppercase tracking-[0.3em] text-white/50">
					Describe your concept
				</label>
				<div className="flex flex-col gap-3 md:flex-row">
					<textarea
						value={prompt}
						onChange={(event) => setPrompt(event.target.value)}
						className="flex-1 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/40"
						rows={3}
						placeholder="e.g. Neon pasta bar with smoky notes and a vegan counter"
					/>
					<Button
						type="submit"
						className="h-fit min-w-[180px] self-end"
						disabled={isGenerating}
					>
						<Sparkles className="mr-2 h-4 w-4" />
						{isGenerating ? 'Sketching…' : 'Generate'}
					</Button>
				</div>
			</form>

			<div className="mt-6 grid gap-4 md:grid-cols-3">
				{ideas.map((idea) => {
					const Icon =
						idea.icon === 'leaf' ? Leaf : idea.icon === 'fish' ? Fish : Flame
					return (
						<div
							key={idea.id}
							className={cn(
								'rounded-3xl border px-4 py-5 backdrop-blur-xl transition hover:-translate-y-1',
								idea.icon === 'leaf'
									? 'border-emerald-200/40 bg-emerald-200/5'
									: idea.icon === 'fish'
										? 'border-cyan-200/40 bg-cyan-200/5'
										: 'border-rose-200/40 bg-rose-200/5'
							)}
						>
							<div className="flex items-center gap-2 text-sm uppercase tracking-[0.3em] text-white/60">
								<Icon className="h-4 w-4" />
								AI concept
							</div>
							<h3 className="mt-2 text-xl font-semibold text-white">
								{idea.title}
							</h3>
							<p className="text-sm text-white/65">{idea.summary}</p>
							<div className="mt-3 space-y-1.5 text-xs text-white/70">
								<p className="font-semibold text-white/80">Variants</p>
								{idea.variants.map((variant) => (
									<p key={variant}>• {variant}</p>
								))}
							</div>
							<div className="mt-3 space-y-1.5 text-xs text-white/70">
								<p className="font-semibold text-white/80">
									Toppings & finishes
								</p>
								{idea.toppings.map((topping) => (
									<p key={topping}>• {topping}</p>
								))}
							</div>
							<p className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
								<strong className="text-white/90">SOP tip:</strong> {idea.sop}
							</p>
						</div>
					)
				})}
			</div>
		</section>
	)
}
