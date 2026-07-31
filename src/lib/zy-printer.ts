/**
 * Client-side interface to communicate with the native Windows ZyPrinter.dll hardware bridge.
 * When NovaPOS.exe is running on a Windows machine, it exposes a local HTTP server
 * on http://localhost:18181/ that proxies print commands to ZyPrinter.dll.
 *
 * The deployed web app at pos.pizzeriacafe.in calls these functions to trigger
 * native thermal printing and cash drawer operations from the browser.
 */

const BRIDGE_URL = 'http://localhost:18181'

export type PrinterType = 'usb' | 'net' | 'com'

export interface BridgeStatus {
	active: boolean
	sdk?: string
	version?: string
	error?: string
}

export interface PrinterConfig {
	type: PrinterType
	/** Network printer IP (e.g. "192.168.1.100") */
	ip?: string
	/** Network printer port (default: 9100) */
	port?: number
	/** Serial COM port number */
	comPort?: number
	/** Serial baud rate (default: 19200) */
	comBaud?: number
}

/**
 * Checks if the NovaPOS Windows hardware bridge is running locally.
 * Returns { active: true } if the bridge is reachable.
 */
export async function checkHardwareBridge(): Promise<BridgeStatus> {
	try {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 1500)

		const res = await fetch(`${BRIDGE_URL}/status`, {
			signal: controller.signal
		})
		clearTimeout(timeoutId)

		if (res.ok) {
			const data = await res.json()
			return { active: true, sdk: data.sdk, version: data.version }
		}
		return { active: false, error: 'Bridge responded with error' }
	} catch {
		return { active: false, error: 'NovaPOS hardware bridge not running on this machine' }
	}
}

/**
 * Sends raw ESC/POS byte buffer to the thermal printer via the native bridge.
 *
 * @param buffer - Raw ESC/POS bytes (from EscPosEncoder.encode())
 * @param config - Printer connection configuration
 * @returns true if printed successfully
 */
export async function printViaBridge(
	buffer: Uint8Array,
	config: PrinterConfig = { type: 'usb' }
): Promise<boolean> {
	try {
		const headers: Record<string, string> = {
			'Content-Type': 'application/octet-stream',
			'X-Printer-Type': config.type
		}

		if (config.type === 'net') {
			headers['X-Printer-Ip'] = config.ip || '192.168.1.100'
			headers['X-Printer-Port'] = String(config.port || 9100)
		} else if (config.type === 'com') {
			headers['X-Com-Port'] = String(config.comPort || 1)
			headers['X-Com-Baud'] = String(config.comBaud || 19200)
		}

		const res = await fetch(`${BRIDGE_URL}/print`, {
			method: 'POST',
			headers,
			body: buffer
		})

		if (!res.ok) return false
		const data = await res.json()
		return data.success === true
	} catch (err) {
		console.error('[NovaPOS Bridge] Print failed:', err)
		return false
	}
}

/**
 * Triggers the cash drawer kick pulse via the native hardware bridge.
 * Sends ESC p 0 30 255 (0x1B, 0x70, 0x00, 0x1E, 0xFF) to the USB printer.
 */
export async function openCashDrawer(): Promise<boolean> {
	try {
		const res = await fetch(`${BRIDGE_URL}/open-drawer`, { method: 'POST' })
		if (!res.ok) return false
		const data = await res.json()
		return data.success === true
	} catch (err) {
		console.error('[NovaPOS Bridge] Drawer kick failed:', err)
		return false
	}
}
