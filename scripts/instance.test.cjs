const assert = require('node:assert/strict')
const test = require('node:test')

async function makeInstance() {
	// The test suite builds the module before loading it.
	const { default: Instance } = await import('../dist/main.js')
	return new Instance({
		id: 'test',
		_isInstanceContext: true,
		setStatus() {},
		checkFeedbacks() {},
		updateStatus() {},
	})
}

test('acknowledges Companion initialization while the server connection is pending', async () => {
	const instance = await makeInstance()
	for (const method of [
		'initVariableDefinitions',
		'initActions',
		'initFeedbacks',
		'initPresets',
		'updateVariableValuesFromState',
	]) {
		instance[method] = () => {}
	}
	instance.cleanup = async () => {}
	instance.updateStatus = () => {}
	instance.checkFeedbacks = () => {}
	let signal
	instance.reconnect = async (attemptSignal) => {
		signal = attemptSignal
		await new Promise((resolve) => attemptSignal.addEventListener('abort', resolve, { once: true }))
	}
	await instance.init({}, true, {})
	assert.equal(signal.aborted, false)
	await instance.destroy()
	assert.equal(signal.aborted, true)
})

test('presets tag a paired short press on release and keep a longer hold momentary', async () => {
	const instance = await makeInstance()
	// eslint-disable-next-line n/no-unpublished-import
	const { PresetPtt } = await import('../dist/presetPtt.js')
	let now = 0
	instance.presetPtt = new PresetPtt(() => now)
	const requests = []
	instance.apiRequest = async (_method, _path, payload) => {
		requests.push(payload)
		return { status: 200, data: {} }
	}
	instance.updateVariableValuesFromState = () => {}
	instance.checkFeedbacks = () => {}
	const options = { userId: 1, targetType: 'conference', targetConferenceId: 2, tapToLock: true }
	const event = { controlId: 'button', surfaceId: 'deck' }
	for (const duration of [299, 300]) {
		const pressed = instance.executeTalkCommand({ ...options, action: 'press' }, event)
		now += duration
		await Promise.all([pressed, instance.executeTalkCommand({ ...options, action: 'release' }, event)])
	}
	assert.deepEqual(
		requests.map(({ action, tapToLock }) => [action, tapToLock]),
		[
			['press', undefined],
			['release', true],
			['press', undefined],
			['release', false],
		],
	)
	assert.equal(new Set(requests.map(({ inputKey }) => inputKey)).size, 1)
})
