/**
 * ESC/POS binary command encoder for thermal receipt printers.
 */
export class EscPosEncoder {
	private buffer: number[] = []

	/**
	 * Initialize the printer to default settings and force Font A (standard monospaced font).
	 */
	initialize() {
		this.buffer.push(0x1B, 0x40) // ESC @ (Initialize)
		this.buffer.push(0x1B, 0x4D, 0x00) // ESC M 0 (Select Font A)
		return this
	}

	/**
	 * Set text alignment to Left.
	 */
	alignLeft() {
		this.buffer.push(0x1B, 0x61, 0x00)
		return this
	}

	/**
	 * Set text alignment to Center.
	 */
	alignCenter() {
		this.buffer.push(0x1B, 0x61, 0x01)
		return this
	}

	/**
	 * Set text alignment to Right.
	 */
	alignRight() {
		this.buffer.push(0x1B, 0x61, 0x02)
		return this
	}

	/**
	 * Toggle bold text mode.
	 */
	bold(value = true) {
		this.buffer.push(0x1B, 0x45, value ? 0x01 : 0x00)
		return this
	}

	/**
	 * Make text double height and width.
	 */
	sizeDouble() {
		this.buffer.push(0x1D, 0x21, 0x11)
		return this
	}

	/**
	 * Set text size back to normal.
	 */
	sizeNormal() {
		this.buffer.push(0x1D, 0x21, 0x00)
		return this
	}

	/**
	 * Append standard text. Replaces Unicode symbols like Indian Rupee with safe equivalents
	 * and strips non-ASCII/emojis.
	 */
	text(value: string) {
		const safeStr = value
			.replace(/₹/g, 'Rs')
			.replace(/[^\x20-\x7E\n\r]/g, '')
		for (let i = 0; i < safeStr.length; i++) {
			this.buffer.push(safeStr.charCodeAt(i))
		}
		return this
	}

	/**
	 * Append text followed by a new line.
	 */
	line(value = '') {
		this.text(value + '\n')
		return this
	}

	/**
	 * Append a divider line (e.g. dashed separator).
	 */
	divider(charWidth = 32, char = '-') {
		this.line(char.repeat(charWidth))
		return this
	}

	/**
	 * Print a row with left-aligned and right-aligned text.
	 */
	row(left: string, right: string, charWidth = 32) {
		const safeLeft = left.replace(/₹/g, 'Rs').replace(/[^\x20-\x7E]/g, '')
		const safeRight = right.replace(/₹/g, 'Rs').replace(/[^\x20-\x7E]/g, '')
		const spaceNeeded = charWidth - (safeLeft.length + safeRight.length)
		
		if (spaceNeeded > 0) {
			this.text(safeLeft + ' '.repeat(spaceNeeded) + safeRight + '\n')
		} else {
			// Truncate left side to fit the width
			const maxLeftLen = charWidth - safeRight.length - 2
			const truncatedLeft = safeLeft.length > maxLeftLen ? safeLeft.slice(0, maxLeftLen) + '..' : safeLeft
			const newSpaceNeeded = Math.max(1, charWidth - (truncatedLeft.length + safeRight.length))
			this.text(truncatedLeft + ' '.repeat(newSpaceNeeded) + safeRight + '\n')
		}
		return this
	}

	/**
	 * Print a row formatted as 3 columns with aligned boundaries.
	 */
	threeColumnRow(col1: string, col2: string, col3: string, charWidth = 32) {
		const safeCol1 = col1.replace(/₹/g, 'Rs').replace(/[^\x20-\x7E]/g, '')
		const safeCol2 = col2.replace(/₹/g, 'Rs').replace(/[^\x20-\x7E]/g, '')
		const safeCol3 = col3.replace(/₹/g, 'Rs').replace(/[^\x20-\x7E]/g, '')

		// Calculate columns:
		// 32-col (58mm): 17-char Col1, 5-char Col2, 10-char Col3
		// 48-col (80mm): 29-char Col1, 7-char Col2, 12-char Col3
		let w1 = 17
		let w2 = 5
		let w3 = 10

		if (charWidth >= 48) {
			w1 = 29
			w2 = 7
			w3 = 12
		}

		// Pad or truncate Col1 (Left-aligned)
		let c1 = safeCol1
		if (c1.length > w1) {
			c1 = c1.slice(0, w1 - 2) + '..'
		} else {
			c1 = c1.padEnd(w1, ' ')
		}

		// Pad Col2 (Right-aligned inside Col2 width)
		let c2 = safeCol2
		if (c2.length > w2) {
			c2 = c2.slice(0, w2)
		}
		c2 = c2.padStart(w2, ' ')

		// Pad Col3 (Right-aligned inside Col3 width)
		let c3 = safeCol3
		if (c3.length > w3) {
			c3 = c3.slice(0, w3)
		}
		c3 = c3.padStart(w3, ' ')

		this.text(c1 + c2 + c3 + '\n')
		return this
	}

	/**
	 * Print a standard item line with item name, quantity and total price.
	 */
	itemRow(name: string, qty: number, total: string, charWidth = 32) {
		this.threeColumnRow(name, `x${qty}`, total, charWidth)
		return this
	}

	/**
	 * Append a hardware-rendered QR code.
	 */
	qrcode(data: string) {
		const bytes = []
		for (let i = 0; i < data.length; i++) {
			bytes.push(data.charCodeAt(i))
		}

		// 1. Set QR Code Model (Model 2)
		this.buffer.push(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00)

		// 2. Set QR Code Size (Module width 6 dots is standard)
		this.buffer.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06)

		// 3. Set QR Code Error Correction Level (Level M = 49)
		this.buffer.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31)

		// 4. Store QR Code Data
		const numBytes = bytes.length + 3
		const lenLow = numBytes & 0xFF
		const lenHigh = (numBytes >> 8) & 0xFF
		this.buffer.push(0x1D, 0x28, 0x6B, lenLow, lenHigh, 0x31, 0x50, 0x30)
		this.buffer.push(...bytes)

		// 5. Print the QR Code Symbol
		this.buffer.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30)
		return this
	}

	/**
	 * Feed paper and trigger hardware paper cutter.
	 */
	cut() {
		this.buffer.push(0x1B, 0x64, 0x05) // Feed 5 lines
		this.buffer.push(0x1D, 0x56, 0x41, 0x08) // Cut paper
		return this
	}

	/**
	 * Compile all inputs into a Uint8Array ready for BLE/USB raw transmissions.
	 */
	encode(): Uint8Array {
		return new Uint8Array(this.buffer)
	}
}
