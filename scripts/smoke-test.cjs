#!/usr/bin/env node

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const https = require('node:https')
const { spawn, spawnSync } = require('node:child_process')
const axios = require('axios')
const { io } = require('socket.io-client')

function findTalkToMeRepoRoot(startDir) {
	let current = path.resolve(startDir)
	while (true) {
		const candidate = path.join(current, 'server.js')
		if (fs.existsSync(candidate)) {
			return current
		}

		const parent = path.dirname(current)
		if (parent === current) {
			return null
		}
		current = parent
	}
}

const port = Number(process.env.SMOKE_PORT || 18443)
const apiKey = process.env.SMOKE_API_KEY || 'smoke-api-key'
const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talktome-smoke-'))
const baseUrl = `https://127.0.0.1:${port}`
const httpsAgent = new https.Agent({ rejectUnauthorized: false })

function fail(message, details) {
	const error = new Error(message)
	if (details !== undefined) {
		error.details = details
	}
	throw error
}

function assert(condition, message, details) {
	if (!condition) {
		fail(message, details)
	}
}

const configuredRepoRoot = process.env.TALKTOME_REPO_ROOT ? path.resolve(process.env.TALKTOME_REPO_ROOT) : null
const repoRoot = configuredRepoRoot || findTalkToMeRepoRoot(__dirname)
if (!repoRoot) {
	fail('Could not locate talktome app repo. Set TALKTOME_REPO_ROOT or TALKTOME_SERVER_ENTRY for standalone use.')
}

const serverEntry = process.env.TALKTOME_SERVER_ENTRY
	? path.resolve(process.env.TALKTOME_SERVER_ENTRY)
	: path.join(repoRoot, 'server.js')

async function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForServerReady(http, timeoutMs = 30000) {
	const started = Date.now()
	while (Date.now() - started < timeoutMs) {
		try {
			const response = await http.get('/api/v1/companion/config', {
				headers: { 'x-api-key': apiKey },
				validateStatus: () => true,
			})
			if (response.status === 200) {
				return
			}
		} catch (_error) {
			// ignore while server boots
		}
		await wait(300)
	}
	fail(`Server did not become ready within ${timeoutMs}ms`)
}

async function waitForSocketEvent(socket, eventName, predicate, timeoutMs = 5000) {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			socket.off(eventName, onEvent)
			reject(new Error(`Timeout waiting for socket event "${eventName}"`))
		}, timeoutMs)

		const onEvent = (payload) => {
			try {
				if (!predicate || predicate(payload)) {
					clearTimeout(timeout)
					socket.off(eventName, onEvent)
					resolve(payload)
				}
			} catch (error) {
				clearTimeout(timeout)
				socket.off(eventName, onEvent)
				reject(error)
			}
		}

		socket.on(eventName, onEvent)
	})
}

async function main() {
	const startedAt = Date.now()
	let socket = null
	let appSocket = null
	let runError = null
	const resultLines = []
	const nodeCandidates = []

	const uniquePush = (value) => {
		if (!value) return
		if (!nodeCandidates.includes(value)) {
			nodeCandidates.push(value)
		}
	}

	const detectNodeCandidates = () => {
		uniquePush(process.env.SMOKE_SERVER_NODE)
		uniquePush(process.execPath)

		const whichNodes = spawnSync('/usr/bin/env', ['which', '-a', 'node'], {
			encoding: 'utf8',
		})
		if (whichNodes.status === 0 && typeof whichNodes.stdout === 'string') {
			for (const line of whichNodes.stdout.split('\n')) {
				uniquePush(line.trim())
			}
		}
	}

	const supportsBetterSqlite = (nodeBinary) => {
		if (!nodeBinary) return false
		const probe = spawnSync(
			nodeBinary,
			[
				'-e',
				"try { const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.prepare('select 1').get(); db.close(); process.exit(0) } catch (e) { process.exit(1) }",
			],
			{ cwd: repoRoot, stdio: 'ignore' },
		)
		return probe.status === 0
	}

	detectNodeCandidates()
	const serverNode = nodeCandidates.find((candidate) => supportsBetterSqlite(candidate))
	assert(serverNode, 'No compatible node runtime found for server smoke test', { nodeCandidates })

	const serverEnv = {
		...process.env,
		TALKTOME_NO_WIZARD: '1',
		TALKTOME_DATA_DIR: tempDataDir,
		PORT: String(port),
		HTTP_PORT: 'off',
		MDNS_HOST: 'off',
		COMPANION_API_KEY: apiKey,
	}

	const server = spawn(serverNode, [serverEntry], {
		cwd: repoRoot,
		env: serverEnv,
		stdio: ['ignore', 'pipe', 'pipe'],
	})

	const serverLogs = []
	const onServerOut = (chunk) => {
		serverLogs.push(String(chunk))
	}
	server.stdout.on('data', onServerOut)
	server.stderr.on('data', onServerOut)

	const http = axios.create({
		baseURL: baseUrl,
		httpsAgent,
		timeout: 5000,
		validateStatus: () => true,
	})

	try {
		await waitForServerReady(http)
		resultLines.push('server startup: ok')

		const unauthorized = await http.get('/api/v1/companion/state')
		assert(unauthorized.status === 401, 'expected 401 for missing companion auth', {
			status: unauthorized.status,
		})
		resultLines.push('companion auth required: ok')

		const configResponse = await http.get('/api/v1/companion/config', {
			headers: { 'x-api-key': apiKey },
		})
		assert(configResponse.status === 200, 'expected /companion/config with API key to return 200')
		assert(configResponse.data?.scope?.mode === 'all', 'expected API key scope mode "all"', configResponse.data)
		resultLines.push('api key auth + scope(all): ok')

		const adminLogin = await http.post('/admin/login', {
			name: 'admin',
			password: 'admin',
		})
		assert(adminLogin.status === 200, 'admin login failed', {
			status: adminLogin.status,
			body: adminLogin.data,
		})
		const adminCookie = Array.isArray(adminLogin.headers['set-cookie'])
			? String(adminLogin.headers['set-cookie'][0]).split(';')[0]
			: ''
		assert(adminCookie.includes('admin_session='), 'admin session cookie missing')
		resultLines.push('admin login cookie: ok')

		const suffix = Date.now()
		const operatorAName = `operator_a_${suffix}`
		const operatorBName = `operator_b_${suffix}`
		const operatorPassword = 'pw1234'

		const createUserA = await http.post(
			'/users',
			{ name: operatorAName, password: operatorPassword },
			{ headers: { Cookie: adminCookie } },
		)
		assert(createUserA.status === 200, 'create operator A failed', createUserA.data)
		const operatorAId = Number(createUserA.data?.id)
		assert(Number.isFinite(operatorAId), 'operator A id missing', createUserA.data)

		const createUserB = await http.post(
			'/users',
			{ name: operatorBName, password: operatorPassword },
			{ headers: { Cookie: adminCookie } },
		)
		assert(createUserB.status === 200, 'create operator B failed', createUserB.data)
		const operatorBId = Number(createUserB.data?.id)
		assert(Number.isFinite(operatorBId), 'operator B id missing', createUserB.data)

		const conferenceA = await http.post(
			'/conferences',
			{ name: `Conference_${suffix}` },
			{ headers: { Cookie: adminCookie } },
		)
		assert(conferenceA.status === 200, 'create conference A failed', conferenceA.data)
		const conferenceAId = Number(conferenceA.data?.id)
		assert(Number.isFinite(conferenceAId), 'conference A id missing', conferenceA.data)

		const conferenceB = await http.post(
			'/conferences',
			{ name: `Conference_extra_${suffix}` },
			{ headers: { Cookie: adminCookie } },
		)
		assert(conferenceB.status === 200, 'create conference B failed', conferenceB.data)
		const conferenceBId = Number(conferenceB.data?.id)
		assert(Number.isFinite(conferenceBId), 'conference B id missing', conferenceB.data)
		resultLines.push('admin create users/conferences: ok')

		const addUserTarget = await http.post(
			`/users/${operatorAId}/targets`,
			{ targetType: 'user', targetId: operatorBId },
			{ headers: { Cookie: adminCookie } },
		)
		assert(addUserTarget.status === 204, 'add user target failed', {
			status: addUserTarget.status,
			body: addUserTarget.data,
		})

		const addConferenceTarget = await http.post(
			`/users/${operatorAId}/targets`,
			{ targetType: 'conference', targetId: conferenceAId },
			{ headers: { Cookie: adminCookie } },
		)
		assert(addConferenceTarget.status === 204, 'add conference target failed', {
			status: addConferenceTarget.status,
			body: addConferenceTarget.data,
		})
		resultLines.push('admin target assignment: ok')

		const operatorLogin = await http.post('/api/v1/companion/auth/login', {
			name: operatorAName,
			password: operatorPassword,
		})
		assert(operatorLogin.status === 200, 'operator companion login failed', {
			status: operatorLogin.status,
			body: operatorLogin.data,
		})
		const operatorToken = String(operatorLogin.data?.token || '')
		assert(operatorToken.length > 20, 'operator token missing', operatorLogin.data)
		assert(operatorLogin.data?.scope?.mode === 'self', 'operator scope should be self', operatorLogin.data)
		assert(
			Number(operatorLogin.data?.scope?.userId) === operatorAId,
			'operator scope userId mismatch',
			operatorLogin.data,
		)
		resultLines.push('operator login scope(self): ok')

		const operatorUsers = await http.get('/api/v1/companion/users', {
			headers: { authorization: `Bearer ${operatorToken}` },
		})
		assert(operatorUsers.status === 200, 'operator users request failed')
		assert(Array.isArray(operatorUsers.data), 'operator users should be array', operatorUsers.data)
		assert(
			operatorUsers.data.length === 1 && Number(operatorUsers.data[0]?.id) === operatorAId,
			'operator should only see self in /users',
			operatorUsers.data,
		)

		const operatorState = await http.get('/api/v1/companion/state', {
			headers: { authorization: `Bearer ${operatorToken}` },
		})
		assert(operatorState.status === 200, 'operator state request failed')
		assert(operatorState.data?.scope?.mode === 'self', 'operator state scope should be self', operatorState.data)
		assert(
			Number(operatorState.data?.scope?.userId) === operatorAId,
			'operator state scope userId mismatch',
			operatorState.data,
		)
		resultLines.push('operator scoped state/users: ok')

		const operatorTargets = await http.get(`/api/v1/companion/users/${operatorAId}/targets`, {
			headers: { authorization: `Bearer ${operatorToken}` },
		})
		assert(operatorTargets.status === 200, 'operator targets request failed')
		assert(Array.isArray(operatorTargets.data), 'operator targets should be array', operatorTargets.data)
		const hasUserTarget = operatorTargets.data.some(
			(target) => target?.targetType === 'user' && Number(target?.targetId) === operatorBId,
		)
		const hasConferenceTarget = operatorTargets.data.some(
			(target) => target?.targetType === 'conference' && Number(target?.targetId) === conferenceAId,
		)
		assert(hasUserTarget && hasConferenceTarget, 'assigned targets missing from operator targets', operatorTargets.data)
		resultLines.push('operator targets visible: ok')

		socket = io(`${baseUrl}/companion`, {
			transports: ['websocket'],
			rejectUnauthorized: false,
			auth: { apiKey },
			extraHeaders: { 'x-api-key': apiKey },
			timeout: 4000,
		})

		await new Promise((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('socket connect timeout')), 5000)
			socket.once('connect', () => {
				clearTimeout(timeout)
				resolve()
			})
			socket.once('connect_error', (err) => {
				clearTimeout(timeout)
				reject(err)
			})
		})

		const snapshotPayload = await waitForSocketEvent(
			socket,
			'snapshot',
			(payload) => payload && Array.isArray(payload.users),
		)
		assert(snapshotPayload.scope?.mode === 'all', 'socket snapshot scope should be all for api key', snapshotPayload)
		resultLines.push('socket connect + snapshot: ok')

		const userTargetsUpdatedWait = waitForSocketEvent(
			socket,
			'user-targets-updated',
			(payload) => Number(payload?.userId) === operatorAId,
		)
		const addConferenceTarget2 = await http.post(
			`/users/${operatorAId}/targets`,
			{ targetType: 'conference', targetId: conferenceBId },
			{ headers: { Cookie: adminCookie } },
		)
		assert(addConferenceTarget2.status === 204, 'add extra conference target failed', addConferenceTarget2.data)
		await userTargetsUpdatedWait
		resultLines.push('socket user-targets-updated event: ok')

		const cutCameraWait = waitForSocketEvent(socket, 'cut-camera', (payload) => payload?.user === operatorAName)
		const cutCameraResponse = await http.post('/cut-camera', { user: operatorAName })
		assert(cutCameraResponse.status === 200, 'cut-camera request failed', cutCameraResponse.data)
		await cutCameraWait
		resultLines.push('socket cut-camera event: ok')

		const commandResultWait = waitForSocketEvent(
			socket,
			'command-result',
			(payload) =>
				Number(payload?.userId) === operatorAId &&
				payload?.ok === false &&
				String(payload?.reason || '')
					.toLowerCase()
					.includes('user not connected'),
		)
		const talkOffline = await http.post(
			`/api/v1/companion/users/${operatorAId}/talk`,
			{
				action: 'press',
				targetType: 'conference',
				targetId: conferenceAId,
				waitMs: 400,
			},
			{
				headers: { 'x-api-key': apiKey },
			},
		)
		assert(talkOffline.status === 404, 'offline talk should return 404 user not connected', {
			status: talkOffline.status,
			body: talkOffline.data,
		})
		await commandResultWait
		resultLines.push('socket command-result event on failed talk: ok')

		const targetAudioCommandResultWait = waitForSocketEvent(
			socket,
			'command-result',
			(payload) =>
				Number(payload?.userId) === operatorAId &&
				payload?.ok === false &&
				String(payload?.reason || '')
					.toLowerCase()
					.includes('user not connected'),
		)
		const targetAudioOffline = await http.post(
			`/api/v1/companion/users/${operatorAId}/target-audio`,
			{
				action: 'mute-toggle',
				targetType: 'conference',
				targetId: conferenceAId,
				waitMs: 400,
			},
			{
				headers: { 'x-api-key': apiKey },
			},
		)
		assert(targetAudioOffline.status === 404, 'offline target-audio should return 404 user not connected', {
			status: targetAudioOffline.status,
			body: targetAudioOffline.data,
		})
		await targetAudioCommandResultWait
		resultLines.push('socket command-result event on failed target-audio: ok')

		appSocket = io(baseUrl, {
			transports: ['websocket'],
			rejectUnauthorized: false,
			timeout: 4000,
		})

		await new Promise((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('app socket connect timeout')), 5000)
			appSocket.once('connect', () => {
				clearTimeout(timeout)
				resolve()
			})
			appSocket.once('connect_error', (err) => {
				clearTimeout(timeout)
				reject(err)
			})
		})

		const onlineStateWait = waitForSocketEvent(
			socket,
			'user-state',
			(payload) => Number(payload?.state?.userId) === operatorAId && payload?.state?.online === true,
		)
		const registerResponse = await new Promise((resolve, reject) => {
			appSocket.emit('register-user', { id: operatorAId, name: operatorAName, kind: 'user' }, (resp) => {
				if (!resp || resp.error) {
					reject(new Error(`register-user failed: ${resp?.error || 'unknown error'}`))
					return
				}
				resolve(resp)
			})
		})
		assert(registerResponse?.ok === true, 'register-user should acknowledge ok', registerResponse)
		await onlineStateWait
		resultLines.push('app socket register-user: ok')

		const expectedVolume = 0.35
		const targetAudioStateWait = waitForSocketEvent(socket, 'user-state', (payload) => {
			if (Number(payload?.state?.userId) !== operatorAId) return false
			const states = Array.isArray(payload?.state?.targetAudioStates) ? payload.state.targetAudioStates : []
			return states.some(
				(entry) =>
					entry?.targetType === 'conference' &&
					Number(entry?.targetId) === conferenceAId &&
					Number(entry?.volume) === expectedVolume &&
					entry?.muted === false,
			)
		})
		appSocket.emit('target-audio-state-snapshot', {
			reason: 'smoke-volume-state',
			states: [
				{
					targetType: 'conference',
					targetId: conferenceAId,
					muted: false,
					volume: expectedVolume,
				},
			],
		})
		const targetAudioStatePayload = await targetAudioStateWait
		const volumeState = Array.isArray(targetAudioStatePayload?.state?.targetAudioStates)
			? targetAudioStatePayload.state.targetAudioStates.find(
					(entry) => entry?.targetType === 'conference' && Number(entry?.targetId) === conferenceAId,
				)
			: null
		assert(
			Number(volumeState?.volume) === expectedVolume,
			'target audio volume should round-trip to companion socket',
			{
				targetAudioStates: targetAudioStatePayload?.state?.targetAudioStates,
			},
		)
		resultLines.push('target-audio-state volume round-trip: ok')

		const durationMs = Date.now() - startedAt
		console.log(`Smoke test passed in ${durationMs}ms`)
		for (const line of resultLines) {
			console.log(`- ${line}`)
		}
	} catch (error) {
		runError = error
		throw error
	} finally {
		if (socket) {
			socket.removeAllListeners()
			socket.disconnect()
		}
		if (appSocket) {
			appSocket.removeAllListeners()
			appSocket.disconnect()
		}

		server.stdout.off('data', onServerOut)
		server.stderr.off('data', onServerOut)

		if (!server.killed) {
			server.kill('SIGTERM')
		}
		await Promise.race([new Promise((resolve) => server.once('exit', resolve)), wait(5000)])
		if (!server.killed) {
			server.kill('SIGKILL')
		}

		try {
			fs.rmSync(tempDataDir, { recursive: true, force: true })
		} catch (_error) {
			// ignore cleanup errors
		}

		if (process.env.DEBUG_SMOKE_SERVER_LOGS === '1' || runError) {
			const joined = serverLogs.join('')
			if (joined.trim()) {
				console.log('\n--- server logs ---')
				console.log(joined)
				console.log('--- end server logs ---')
			}
		}
	}
}

main().catch((error) => {
	process.exitCode = 1
	console.error(`Smoke test failed: ${error.message}`)
	if (error.details !== undefined) {
		console.error('Details:', JSON.stringify(error.details, null, 2))
	}
})
