type Button = { pressedAt: number | null; queue: Promise<void>; pressSent: boolean }

/** Measure the button locally and preserve the order of its HTTP commands. */
export class PresetPtt {
	private readonly buttons = new Map<string, Button>()

	constructor(private readonly now = () => performance.now()) {}

	async run(key: string, action: 'press' | 'release', send: (tapToLock?: boolean) => Promise<void>): Promise<void> {
		const button = this.buttons.get(key) ?? { pressedAt: null, queue: Promise.resolve(), pressSent: false }
		if (action === 'press' && button.pressedAt !== null) return button.queue
		const time = this.now()
		const tap = button.pressedAt !== null && time - button.pressedAt < 300
		button.pressedAt = action === 'press' ? time : null
		this.buttons.set(key, button)

		const queued = button.queue
			.catch(() => {})
			.then(async () => {
				if (this.buttons.get(key) !== button) return
				if (action === 'press') {
					button.pressSent = false
					await send()
					button.pressSent = true
				} else {
					const latch = tap && button.pressSent
					button.pressSent = false
					await send(latch)
				}
			})
		button.queue = queued
		return queued.finally(() => {
			if (this.buttons.get(key) === button && button.queue === queued && button.pressedAt === null) {
				this.buttons.delete(key)
			}
		})
	}

	reset(): void {
		this.buttons.clear()
	}
}
