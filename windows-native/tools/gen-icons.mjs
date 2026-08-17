/**
 * Generates windows-native/Styles/Icons.axaml from the lucide-react icon data
 * already installed in node_modules. Every lucide element (path / circle / rect /
 * line / polyline / polygon / ellipse) is converted to plain SVG path data so it
 * can be used as an Avalonia StreamGeometry.
 *
 * Usage (from repo root):  node windows-native/tools/gen-icons.mjs
 */

import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const iconsDir = path.join(repoRoot, 'node_modules', 'lucide-react', 'dist', 'esm', 'icons')
const outFile = path.join(repoRoot, 'windows-native', 'Styles', 'Icons.axaml')

/** lucide icon file name -> resource key used from XAML */
const ICONS = {
	'layout-dashboard': 'LayoutDashboard',
	'square-terminal': 'SquareTerminal',
	receipt: 'Receipt',
	'clipboard-list': 'ClipboardList',
	'chef-hat': 'ChefHat',
	package: 'Package',
	'shopping-cart': 'ShoppingCart',
	users: 'Users',
	'user-cog': 'UserCog',
	'chart-column': 'ChartColumn',
	'file-chart-column': 'FileChartColumn',
	percent: 'Percent',
	brain: 'Brain',
	settings: 'Settings',
	'log-out': 'LogOut',
	search: 'Search',
	plus: 'Plus',
	minus: 'Minus',
	x: 'X',
	mail: 'Mail',
	lock: 'Lock',
	eye: 'Eye',
	'eye-off': 'EyeOff',
	'arrow-right': 'ArrowRight',
	'arrow-up-right': 'ArrowUpRight',
	clock: 'Clock',
	'circle-check-big': 'CircleCheckBig',
	'circle-x': 'CircleX',
	'trending-up': 'TrendingUp',
	'trending-down': 'TrendingDown',
	'indian-rupee': 'IndianRupee',
	calendar: 'Calendar',
	'calendar-check': 'CalendarCheck',
	user: 'User',
	'refresh-cw': 'RefreshCw',
	printer: 'Printer',
	table: 'Table',
	utensils: 'Utensils',
	banknote: 'Banknote',
	wallet: 'Wallet',
	'chevron-down': 'ChevronDown',
	'chevron-right': 'ChevronRight',
	monitor: 'Monitor',
	wifi: 'Wifi',
	sparkles: 'Sparkles',
	list: 'List',
	'credit-card': 'CreditCard',
	hash: 'Hash',
	bike: 'Bike',
	'trash-2': 'Trash2',
	'circle-alert': 'CircleAlert',
	'triangle-alert': 'TriangleAlert',
	store: 'Store',
	power: 'Power',
	'inbox': 'Inbox',
	info: 'Info',
	pencil: 'Pencil',
	'message-circle': 'MessageCircle',
	'dollar-sign': 'DollarSign',
	truck: 'Truck',
	'building-2': 'Building2',
	usb: 'Usb',
	network: 'Network',
	save: 'Save',
	gift: 'Gift',
	'arrow-left': 'ArrowLeft',
	'qr-code': 'QrCode',
	smartphone: 'Smartphone',
	'notebook-pen': 'NotebookPen',
	flame: 'Flame',
	square: 'Square',
	check: 'Check',
	copy: 'Copy',
	'log-in': 'LogIn',
	phone: 'Phone',
	'chevrons-right': 'ChevronsRight',
	'square-arrow-out-up-right': 'SquareArrowOutUpRight'
}

const num = (v) => {
	const n = Number(v)
	return Number.isFinite(n) ? n : 0
}

/** circle -> two arcs (keeps direction so stroke rendering is identical) */
function circleToPath(cx, cy, r) {
	return (
		`M ${cx - r} ${cy} ` +
		`A ${r} ${r} 0 0 1 ${cx + r} ${cy} ` +
		`A ${r} ${r} 0 0 1 ${cx - r} ${cy} Z`
	)
}

function ellipseToPath(cx, cy, rx, ry) {
	return (
		`M ${cx - rx} ${cy} ` +
		`A ${rx} ${ry} 0 0 1 ${cx + rx} ${cy} ` +
		`A ${rx} ${ry} 0 0 1 ${cx - rx} ${cy} Z`
	)
}

function rectToPath(x, y, w, h, rx, ry) {
	const r = rx || ry || 0
	const r2 = ry || rx || 0
	if (!r && !r2) {
		return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`
	}
	const a = Math.min(r, w / 2)
	const b = Math.min(r2 || r, h / 2)
	return (
		`M ${x + a} ${y} ` +
		`H ${x + w - a} ` +
		`A ${a} ${b} 0 0 1 ${x + w} ${y + b} ` +
		`V ${y + h - b} ` +
		`A ${a} ${b} 0 0 1 ${x + w - a} ${y + h} ` +
		`H ${x + a} ` +
		`A ${a} ${b} 0 0 1 ${x} ${y + h - b} ` +
		`V ${y + b} ` +
		`A ${a} ${b} 0 0 1 ${x + a} ${y} Z`
	)
}

function pointsToPath(points, close) {
	const pairs = String(points)
		.trim()
		.split(/[\s,]+/)
		.map(num)
	const out = []
	for (let i = 0; i + 1 < pairs.length; i += 2) {
		out.push(`${i === 0 ? 'M' : 'L'} ${pairs[i]} ${pairs[i + 1]}`)
	}
	return out.join(' ') + (close ? ' Z' : '')
}

/**
 * SVG treats the first moveto of a path as absolute even when written lowercase.
 * Because every element of an icon gets concatenated into one geometry, that
 * leading `m` would otherwise be resolved against the previous subpath's end
 * point. Rewrite it to `M`, and re-introduce the implicit relative lineto that
 * `m` provides for any trailing coordinate pairs.
 */
function absolutiseFirstMoveTo(d) {
	const s = String(d).trim()
	if (!s.startsWith('m')) return s

	// SVG number: optional sign, then `12`, `12.5` or `.5` (exponents included).
	const n = String.raw`[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?`
	const re = new RegExp(String.raw`^m[\s,]*(${n})[\s,]*(${n})`)
	const m = re.exec(s)
	if (!m) return s.replace(/^m/, 'M')

	const rest = s.slice(m[0].length).trim()
	const head = `M ${m[1]} ${m[2]}`
	if (!rest) return head
	// A command letter follows -> nothing implicit to fix up.
	if (/^[a-zA-Z]/.test(rest)) return `${head} ${rest}`
	// Numbers follow -> they were implicit *relative* linetos.
	return `${head} l ${rest}`
}

function elementToPath(tag, attrs) {
	switch (tag) {
		case 'path':
			return absolutiseFirstMoveTo(attrs.d)
		case 'circle':
			return circleToPath(num(attrs.cx), num(attrs.cy), num(attrs.r))
		case 'ellipse':
			return ellipseToPath(num(attrs.cx), num(attrs.cy), num(attrs.rx), num(attrs.ry))
		case 'rect':
			return rectToPath(
				num(attrs.x),
				num(attrs.y),
				num(attrs.width),
				num(attrs.height),
				num(attrs.rx),
				num(attrs.ry)
			)
		case 'line':
			return `M ${num(attrs.x1)} ${num(attrs.y1)} L ${num(attrs.x2)} ${num(attrs.y2)}`
		case 'polyline':
			return pointsToPath(attrs.points, false)
		case 'polygon':
			return pointsToPath(attrs.points, true)
		default:
			return null
	}
}

/**
 * The icon modules are tiny ES modules with a literal `__iconNode` array.
 * Slice out that literal and evaluate it — no import side effects needed.
 */
async function readIconNode(file) {
	const source = await readFile(file, 'utf8')
	const start = source.indexOf('const __iconNode = [')
	if (start === -1) throw new Error(`no __iconNode in ${file}`)
	const open = source.indexOf('[', start)
	let depth = 0
	let end = -1
	for (let i = open; i < source.length; i++) {
		const ch = source[i]
		if (ch === '[') depth++
		else if (ch === ']') {
			depth--
			if (depth === 0) {
				end = i
				break
			}
		}
	}
	if (end === -1) throw new Error(`unbalanced __iconNode in ${file}`)
	const literal = source.slice(open, end + 1)
	// eslint-disable-next-line no-new-func
	return Function(`"use strict"; return (${literal});`)()
}

const escapeXml = (s) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const lines = [
	'<!--',
	'  AUTO-GENERATED — do not edit by hand.',
	'  Source: lucide-react (ISC licence) via windows-native/tools/gen-icons.mjs',
	'  Each geometry is authored in lucide\'s 24x24 coordinate space and is meant to be',
	'  stroked (StrokeThickness 2, round caps/joins) exactly like the SVG icons on web.',
	'-->',
	'<ResourceDictionary xmlns="https://github.com/avaloniaui"',
	'                    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">'
]

const missing = []
for (const [file, key] of Object.entries(ICONS)) {
	const full = path.join(iconsDir, `${file}.js`)
	if (!existsSync(full)) {
		missing.push(file)
		continue
	}
	const nodes = await readIconNode(full)
	const segments = []
	for (const [tag, attrs] of nodes) {
		const d = elementToPath(tag, attrs)
		if (d) segments.push(d.trim())
	}
	const data = segments.join(' ')
	lines.push(`    <StreamGeometry x:Key="Icon.${key}">${escapeXml(data)}</StreamGeometry>`)
}

lines.push('</ResourceDictionary>')
lines.push('')

await writeFile(outFile, lines.join('\n'), 'utf8')

console.log(`wrote ${path.relative(repoRoot, outFile)} with ${Object.keys(ICONS).length - missing.length} icons`)
if (missing.length) console.warn('missing icons:', missing.join(', '))
