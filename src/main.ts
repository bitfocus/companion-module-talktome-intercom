import https from 'node:https'
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { io, Socket } from 'socket.io-client'
import { InstanceBase, InstanceStatus, Regex, combineRgb, runEntrypoint } from '@companion-module/base'
import type { CompanionActionEvent } from '@companion-module/base'
import { getConfigFields } from './config.js'
import { initActions as defineActions } from './actions.js'
import { initFeedbacks as defineFeedbacks } from './feedbacks.js'
import {
	initVariableDefinitions as defineVariableDefinitions,
	updateVariableValuesFromState as updateVariablesFromState,
} from './variables.js'
import { initPresets as definePresets } from './presets.js'
import { UpgradeScripts } from './upgrades.js'
import type {
	AddressedEntry,
	ChoiceItem,
	CommandPayload,
	CompanionError,
	ConnectionState,
	LastCommandState,
	ModuleConfig,
	ModuleSecrets,
	NormalizedTarget,
	PresetTarget,
	ScopeMode,
	TargetAudioCommandPayload,
	TargetAudioState,
	UserState,
} from './types.js'

const PLACEHOLDER_USER_ID = -1
const PLACEHOLDER_CONFERENCE_ID = -1
const PLACEHOLDER_FEED_ID = -1
const FIXED_HTTP_TIMEOUT_MS = 5000
const FIXED_COMMAND_WAIT_MS = 1500
const FIXED_VOLUME_STEP = 0.04
const DEFAULT_TARGET_VOLUME = 0.9
const DEFAULT_CONFIG: ModuleConfig = {
	host: 'localhost',
	port: 443,
	allowSelfSigned: true,
	authMode: 'apiKey',
	apiKey: '',
	username: '',
	password: '',
}

const WEB_COLORS = {
	blue: combineRgb(37, 99, 235),
	blueText: combineRgb(255, 255, 255),
	purple: combineRgb(94, 12, 94),
	purpleText: combineRgb(237, 233, 254),
	green: combineRgb(34, 197, 94),
	greenText: combineRgb(187, 247, 208),
	red: combineRgb(185, 28, 28),
	redText: combineRgb(254, 242, 242),
	offline: combineRgb(15, 23, 42),
	offlineText: combineRgb(148, 163, 184),
	baseTarget: combineRgb(50, 50, 50),
}

function clampNumber(rawValue: unknown, min: number, max: number, fallback: number): number {
	const value = Number(rawValue)
	if (!Number.isFinite(value)) return fallback
	return Math.min(max, Math.max(min, Math.round(value)))
}

function asString(value: unknown): string {
	if (value === null || value === undefined) return ''
	return String(value).trim()
}

function truncateLabel(text: unknown, maxLength = 12): string {
	const safe = asString(text)
	if (safe.length <= maxLength) return safe
	return `${safe.slice(0, Math.max(0, maxLength - 1))}.`
}

function clampUnitInterval(rawValue: unknown, fallback = 0): number {
	const value = Number(rawValue)
	if (!Number.isFinite(value)) return fallback
	return Math.min(1, Math.max(0, value))
}

function asObject(value: unknown): Record<string, unknown> {
	if (value && typeof value === 'object') return value as Record<string, unknown>
	return {}
}

function toCompanionError(error: unknown): CompanionError {
	if (error instanceof Error) return error as CompanionError

	const raw = asObject(error)
	const fallbackMessage = asString(raw.message) || asString(error) || 'Unknown error'
	const wrapped: CompanionError = new Error(fallbackMessage)

	if (typeof raw.authFailure === 'boolean') {
		wrapped.authFailure = raw.authFailure
	}

	const statusCode = Number(raw.statusCode)
	if (Number.isFinite(statusCode)) {
		wrapped.statusCode = statusCode
	}

	if ('responseData' in raw) {
		wrapped.responseData = raw.responseData
	}

	return wrapped
}

export class TalkToMeCompanionInstance extends InstanceBase<ModuleConfig, ModuleSecrets> {
	config: ModuleConfig
	http: AxiosInstance | null
	socket: Socket | null
	pollTimer: NodeJS.Timeout | null
	offlineFlashTimer: NodeJS.Timeout | null
	uiRefreshTimer: NodeJS.Timeout | null
	reauthPromise: Promise<void> | null
	users: Map<number, UserState>
	conferences: Map<number, { id: number; name: string }>
	feeds: Map<number, { id: number; name: string }>
	userTargets: Map<number, PresetTarget[]>
	userChoices: ChoiceItem[]
	conferenceChoices: ChoiceItem[]
	feedChoices: ChoiceItem[]
	cutCameraUser: string
	connectionState: ConnectionState
	authToken: string
	scopeMode: ScopeMode
	scopeUserId: number | null
	scopeUserName: string
	lastCommand: LastCommandState
	pendingVariableRefresh: boolean
	pendingDefinitionRefresh: boolean
	pendingFeedbackChecks: Set<string>

	constructor(internal: unknown) {
		super(internal)

		this.config = { ...DEFAULT_CONFIG }
		this.http = null
		this.socket = null
		this.pollTimer = null
		this.offlineFlashTimer = null
		this.uiRefreshTimer = null
		this.reauthPromise = null

		this.users = new Map<number, UserState>()
		this.conferences = new Map<number, { id: number; name: string }>()
		this.feeds = new Map<number, { id: number; name: string }>()
		this.userTargets = new Map<number, PresetTarget[]>()

		this.userChoices = [{ id: PLACEHOLDER_USER_ID, label: 'No users available' }]
		this.conferenceChoices = [{ id: PLACEHOLDER_CONFERENCE_ID, label: 'No conferences available' }]
		this.feedChoices = [{ id: PLACEHOLDER_FEED_ID, label: 'No feeds available' }]

		this.cutCameraUser = ''
		this.connectionState = 'disconnected'
		this.authToken = ''
		this.scopeMode = 'all'
		this.scopeUserId = null
		this.scopeUserName = ''
		this.lastCommand = {
			commandId: '',
			status: 'idle',
			reason: '',
			userId: '',
			targetType: '',
			targetId: '',
			at: 0,
		}
		this.pendingVariableRefresh = false
		this.pendingDefinitionRefresh = false
		this.pendingFeedbackChecks = new Set()
	}

	async init(config: ModuleConfig, _isFirstInit: boolean, secrets: ModuleSecrets): Promise<void> {
		this.config = this.applyConfigDefaults(config, secrets)
		this.initVariableDefinitions()
		this.initActions()
		this.initFeedbacks()
		this.initPresets()
		this.updateVariableValuesFromState()
		await this.reconnect()
	}

	async destroy(): Promise<void> {
		this.connectionState = 'disconnected'
		this.updateStatus(InstanceStatus.Disconnected, 'Connection stopped')
		this.updateVariableValuesFromState()
		this.checkFeedbacks('connection_ok', 'module_not_running', 'target_volume_bar')
		await this.cleanup({ keepState: false })
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecrets): Promise<void> {
		this.config = this.applyConfigDefaults(config, secrets)
		await this.reconnect()
	}

	applyConfigDefaults(
		config: Partial<ModuleConfig> | null | undefined,
		secrets: Partial<ModuleSecrets> | null | undefined = {},
	): ModuleConfig {
		const safeConfig = config || {}
		const safeSecrets = secrets || {}
		const authMode: ModuleConfig['authMode'] =
			asString(safeConfig.authMode).toLowerCase() === 'credentials' ? 'credentials' : 'apiKey'
		return {
			host: asString(safeConfig.host) || DEFAULT_CONFIG.host,
			port: clampNumber(safeConfig.port, 1, 65535, DEFAULT_CONFIG.port),
			allowSelfSigned: safeConfig.allowSelfSigned !== false,
			authMode,
			apiKey: asString(safeConfig.apiKey),
			username: asString(safeConfig.username),
			password: asString(safeSecrets.password || safeConfig.password),
		}
	}

	getConfigFields() {
		return getConfigFields({ DEFAULT_CONFIG, Regex })
	}

	hasRequiredConfig(): boolean {
		if (!asString(this.config.host)) return false
		if (this.usesCredentialAuth()) {
			return Boolean(asString(this.config.username) && asString(this.config.password))
		}
		return Boolean(asString(this.config.apiKey))
	}

	usesCredentialAuth(): boolean {
		return asString(this.config.authMode).toLowerCase() === 'credentials'
	}

	resetAuthContext(): void {
		this.authToken = ''
		if (this.usesCredentialAuth()) {
			this.scopeMode = 'self'
			this.scopeUserId = null
			this.scopeUserName = ''
			return
		}
		this.scopeMode = 'all'
		this.scopeUserId = null
		this.scopeUserName = ''
	}

	applyScope(rawScope: unknown, fallback: { mode?: ScopeMode; userId?: number | null; userName?: string } = {}): void {
		const raw = (rawScope ?? {}) as Record<string, unknown>
		const modeRaw = asString(raw.mode).toLowerCase()
		const fallbackMode = asString(fallback?.mode).toLowerCase()
		const mode: ScopeMode =
			modeRaw === 'all' || modeRaw === 'self'
				? modeRaw
				: fallbackMode === 'all' || fallbackMode === 'self'
					? fallbackMode
					: this.usesCredentialAuth()
						? 'self'
						: 'all'
		const parsedUserId = Number(raw.userId)
		const fallbackUserId = Number(fallback?.userId)
		const userId = Number.isFinite(parsedUserId)
			? parsedUserId
			: Number.isFinite(fallbackUserId)
				? fallbackUserId
				: null
		const userName = asString(raw.userName || fallback?.userName)

		this.scopeMode = mode
		this.scopeUserId = userId
		this.scopeUserName = userName
	}

	hasGlobalOperatorAccess(): boolean {
		return this.scopeMode === 'all'
	}

	canControlUser(userId: unknown): boolean {
		const normalized = Number(userId)
		if (!Number.isFinite(normalized)) return false
		if (this.hasGlobalOperatorAccess()) return true
		return Number(this.scopeUserId) === normalized
	}

	getScopedUsers(): UserState[] {
		const users = Array.from(this.users.values()).sort((a, b) => a.name.localeCompare(b.name))
		if (this.hasGlobalOperatorAccess()) {
			return users
		}
		const scopedId = Number(this.scopeUserId)
		if (!Number.isFinite(scopedId)) return []
		return users.filter((user) => Number(user?.id) === scopedId)
	}

	getAuthHeaders(): Record<string, string> {
		const headers: Record<string, string> = {}
		if (this.usesCredentialAuth()) {
			if (!this.authToken) {
				const error: CompanionError = new Error('Companion login required')
				error.authFailure = true
				throw error
			}
			headers.authorization = `Bearer ${this.authToken}`
			return headers
		}
		headers['x-api-key'] = this.config.apiKey
		return headers
	}

	async authenticateWithCredentials(): Promise<void> {
		if (!this.usesCredentialAuth()) {
			this.resetAuthContext()
			return
		}
		if (!this.http) {
			this.createHttpClient()
		}

		const response = await this.http!.request({
			method: 'POST',
			url: '/api/v1/companion/auth/login',
			data: {
				name: this.config.username,
				password: this.config.password,
			},
			headers: {},
		})

		if (response.status === 401 || response.status === 403) {
			const error: CompanionError = new Error(response.data?.error || 'Authentication failed')
			error.authFailure = true
			error.statusCode = response.status
			error.responseData = response.data
			throw error
		}
		if (response.status < 200 || response.status >= 300) {
			const error: CompanionError = new Error(response.data?.error || `HTTP ${response.status}`)
			error.statusCode = response.status
			error.responseData = response.data
			throw error
		}

		const token = asString(response.data?.token)
		if (!token) {
			const error: CompanionError = new Error('Companion auth response missing token')
			error.authFailure = true
			throw error
		}

		const userId = Number(response.data?.user?.id)
		const userName = asString(response.data?.user?.name)
		const isSuperadmin = Boolean(response.data?.user?.isSuperadmin)

		this.authToken = token
		this.applyScope(response.data?.scope, {
			mode: isSuperadmin ? 'all' : 'self',
			userId: Number.isFinite(userId) ? userId : null,
			userName,
		})
	}

	buildBaseUrl(): string {
		return `https://${this.config.host}:${this.config.port}`
	}

	createHttpClient(): void {
		const axiosConfig: AxiosRequestConfig = {
			baseURL: this.buildBaseUrl(),
			timeout: FIXED_HTTP_TIMEOUT_MS,
			validateStatus: () => true,
		}

		axiosConfig.httpsAgent = new https.Agent({
			rejectUnauthorized: !this.config.allowSelfSigned,
		})

		this.http = axios.create(axiosConfig)
	}

	async reconnect(): Promise<void> {
		await this.cleanup({ keepState: true })
		this.resetAuthContext()
		this.refreshChoiceCaches()
		this.refreshDefinitions()
		this.updateVariableValuesFromState()

		if (!this.hasRequiredConfig()) {
			this.connectionState = 'bad_config'
			this.updateVariableValuesFromState()
			this.checkFeedbacks('connection_ok', 'module_not_running', 'target_volume_bar')
			this.updateStatus(InstanceStatus.BadConfig, 'Host and authentication fields are required')
			return
		}

		this.createHttpClient()
		let hasInitialAuth = !this.usesCredentialAuth()
		if (this.usesCredentialAuth()) {
			try {
				await this.authenticateWithCredentials()
				hasInitialAuth = true
			} catch (error) {
				const companionError = toCompanionError(error)
				if (companionError.authFailure) {
					this.connectionState = 'auth_failure'
					this.updateStatus(InstanceStatus.AuthenticationFailure, companionError.message)
				} else {
					this.connectionState = 'connection_failure'
					this.updateStatus(InstanceStatus.ConnectionFailure, companionError.message)
				}
				this.updateVariableValuesFromState()
				this.checkFeedbacks('connection_ok', 'module_not_running', 'target_volume_bar')
			}
		}

		if (this.connectionState === 'disconnected') {
			this.connectionState = 'connecting'
			this.updateVariableValuesFromState()
			this.checkFeedbacks('connection_ok', 'module_not_running', 'target_volume_bar')
			this.updateStatus(InstanceStatus.Connecting, 'Connecting to talktome ...')
		}

		if (hasInitialAuth) {
			this.ensureRealtimeConnection()
		}
		this.startPoller()

		try {
			await this.refreshSnapshot('startup')
		} catch (error) {
			const companionError = toCompanionError(error)
			this.log('debug', `Initial startup snapshot failed: ${companionError.message}`)
		}
	}

	async cleanup({ keepState }: { keepState: boolean }): Promise<void> {
		this.connectionState = 'disconnected'
		this.updateStatus(InstanceStatus.Disconnected, 'Connection stopped')
		this.updateVariableValuesFromState()
		this.checkFeedbacks('connection_ok', 'module_not_running', 'target_volume_bar')

		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = null
		}

		if (this.offlineFlashTimer) {
			clearTimeout(this.offlineFlashTimer)
			this.offlineFlashTimer = null
		}

		if (this.uiRefreshTimer) {
			clearTimeout(this.uiRefreshTimer)
			this.uiRefreshTimer = null
		}
		this.pendingVariableRefresh = false
		this.pendingDefinitionRefresh = false
		this.pendingFeedbackChecks.clear()

		if (this.socket) {
			this.socket.removeAllListeners()
			this.socket.disconnect()
			this.socket = null
		}

		this.http = null
		this.authToken = ''
		this.reauthPromise = null
		this.resetAuthContext()

		if (!keepState) {
			this.users.clear()
			this.conferences.clear()
			this.feeds.clear()
			this.userTargets.clear()
			this.cutCameraUser = ''
			this.refreshChoiceCaches()
			this.refreshDefinitions()
		}
	}

	startPoller(): void {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
		}

		this.pollTimer = setInterval(() => {
			if (this.socket?.connected) return
			this.refreshSnapshot('poll').catch((error) => {
				const companionError = toCompanionError(error)
				this.log('debug', `Snapshot poll failed: ${companionError.message}`)
			})
		}, 10000)
	}

	scheduleUiRefresh(
		feedbackIds: string[] = [],
		{
			refreshVariables = true,
			refreshDefinitions = false,
		}: { refreshVariables?: boolean; refreshDefinitions?: boolean } = {},
	): void {
		if (refreshVariables) {
			this.pendingVariableRefresh = true
		}
		if (refreshDefinitions) {
			this.pendingDefinitionRefresh = true
		}
		for (const feedbackId of feedbackIds) {
			const normalized = asString(feedbackId)
			if (!normalized) continue
			this.pendingFeedbackChecks.add(normalized)
		}
		if (this.uiRefreshTimer) return

		this.uiRefreshTimer = setTimeout(() => {
			this.flushScheduledUiRefresh()
		}, 20)
	}

	flushScheduledUiRefresh(): void {
		if (this.uiRefreshTimer) {
			clearTimeout(this.uiRefreshTimer)
			this.uiRefreshTimer = null
		}

		const shouldRefreshDefinitions = this.pendingDefinitionRefresh
		const shouldRefreshVariables = this.pendingVariableRefresh
		const feedbackIds = Array.from(this.pendingFeedbackChecks)

		this.pendingDefinitionRefresh = false
		this.pendingVariableRefresh = false
		this.pendingFeedbackChecks.clear()

		if (shouldRefreshDefinitions) {
			this.refreshChoiceCaches()
			this.refreshDefinitions()
		}
		if (shouldRefreshVariables) {
			this.updateVariableValuesFromState()
		}
		if (feedbackIds.length > 0) {
			this.checkFeedbacks(...feedbackIds)
		}
	}

	async apiRequest(method: string, path: string, data?: unknown): Promise<AxiosResponse> {
		if (!this.http) {
			this.createHttpClient()
		}
		const headers = this.getAuthHeaders()

		const response = await this.http!.request({
			method,
			url: path,
			data,
			headers,
		})

		if (response.status === 401) {
			if (this.usesCredentialAuth()) {
				await this.refreshCredentialSession()
				const retryHeaders = this.getAuthHeaders()
				const retryResponse = await this.http!.request({
					method,
					url: path,
					data,
					headers: retryHeaders,
				})

				if (retryResponse.status >= 200 && retryResponse.status < 300) {
					return retryResponse
				}

				if (retryResponse.status === 401 || retryResponse.status === 403) {
					const error: CompanionError = new Error(retryResponse.data?.error || 'Authentication failed')
					error.authFailure = true
					error.statusCode = retryResponse.status
					error.responseData = retryResponse.data
					throw error
				}

				const message = retryResponse.data?.error || `HTTP ${retryResponse.status}`
				const error: CompanionError = new Error(message)
				error.statusCode = retryResponse.status
				error.responseData = retryResponse.data
				throw error
			}

			const error: CompanionError = new Error(response.data?.error || 'Authentication failed')
			error.authFailure = true
			error.statusCode = response.status
			error.responseData = response.data
			throw error
		}

		if (response.status < 200 || response.status >= 300) {
			const message = response.data?.error || `HTTP ${response.status}`
			const error: CompanionError = new Error(message)
			error.statusCode = response.status
			error.responseData = response.data
			throw error
		}

		return response
	}

	async refreshCredentialSession(): Promise<void> {
		if (!this.usesCredentialAuth()) return
		if (!this.reauthPromise) {
			this.reauthPromise = (async () => {
				await this.authenticateWithCredentials()
				if (this.socket) {
					try {
						this.applySocketAuthContext()
					} catch (error) {
						const companionError = toCompanionError(error)
						this.log('debug', `Socket auth refresh failed: ${companionError.message}`)
					}
				}
			})().finally(() => {
				this.reauthPromise = null
			})
		}

		return this.reauthPromise
	}

	getSocketAuthPayload(): { token: string } | { apiKey: string } {
		if (this.usesCredentialAuth()) {
			return { token: this.authToken }
		}
		return { apiKey: this.config.apiKey }
	}

	applySocketAuthContext(): void {
		if (!this.socket) return
		const headers = this.getAuthHeaders()
		this.socket.auth = this.getSocketAuthPayload()
		if (this.socket.io?.opts) {
			this.socket.io.opts.extraHeaders = headers
		}
	}

	ensureRealtimeConnection(): void {
		if (!this.hasRequiredConfig()) return
		if (!this.socket) {
			this.connectRealtime()
			return
		}

		try {
			this.applySocketAuthContext()
		} catch (_error) {
			return
		}

		if (!this.socket.connected) {
			this.socket.connect()
		}
	}

	async refreshSnapshot(reason: string): Promise<void> {
		try {
			if (this.usesCredentialAuth() && !this.authToken) {
				await this.refreshCredentialSession()
			}

			const response = await this.apiRequest('GET', '/api/v1/companion/state')
			this.applySnapshot(response.data)
			await this.refreshTargetsForAllUsers()
			if (!this.socket?.connected) {
				this.connectionState = 'connected'
				this.updateStatus(InstanceStatus.Ok)
				this.updateVariableValuesFromState()
				this.checkFeedbacks('connection_ok', 'module_not_running', 'target_volume_bar')
				this.ensureRealtimeConnection()
			}
		} catch (error) {
			const companionError = toCompanionError(error)
			if (companionError.authFailure) {
				this.connectionState = 'auth_failure'
				this.updateStatus(InstanceStatus.AuthenticationFailure, companionError.message)
			} else {
				this.connectionState = 'connection_failure'
				this.updateStatus(InstanceStatus.ConnectionFailure, companionError.message)
			}
			this.updateVariableValuesFromState()
			this.checkFeedbacks('connection_ok', 'module_not_running', 'target_volume_bar')

			if (reason !== 'poll') {
				this.log('error', `Snapshot request failed: ${companionError.message}`)
			}
			throw companionError
		}
	}

	connectRealtime(): void {
		if (!this.hasRequiredConfig()) return

		const socketUrl = `${this.buildBaseUrl()}/companion`
		const requestAuthHeaders = this.getAuthHeaders()
		const socketAuth = this.getSocketAuthPayload()
		const options: Record<string, unknown> = {
			transports: ['websocket', 'polling'],
			timeout: FIXED_HTTP_TIMEOUT_MS,
			auth: socketAuth,
			extraHeaders: requestAuthHeaders,
			reconnection: true,
			reconnectionDelayMax: 5000,
		}

		if (this.config.allowSelfSigned) {
			options.rejectUnauthorized = false
		}

		this.socket = io(socketUrl, options)

		this.socket.on('connect', () => {
			this.connectionState = 'connected'
			this.updateStatus(InstanceStatus.Ok)
			this.updateVariableValuesFromState()
			this.checkFeedbacks('connection_ok', 'module_not_running', 'target_volume_bar')
			this.socket?.emit('request-snapshot')
		})

		this.socket.on('disconnect', (reason) => {
			this.connectionState = 'disconnected'
			this.updateStatus(InstanceStatus.Disconnected, reason || 'Socket disconnected')
			this.updateVariableValuesFromState()
			this.checkFeedbacks('connection_ok', 'module_not_running', 'target_volume_bar')
		})

		this.socket.on('connect_error', (error) => {
			const message = error?.message || 'Socket connect error'
			const lower = message.toLowerCase()
			if (lower.includes('unauthorized') || lower.includes('auth')) {
				this.connectionState = 'auth_failure'
				this.updateStatus(InstanceStatus.AuthenticationFailure, message)
				if (this.usesCredentialAuth()) {
					this.refreshCredentialSession()
						.then(() => {
							this.ensureRealtimeConnection()
						})
						.catch((reauthError: unknown) => {
							const companionError = toCompanionError(reauthError)
							this.log('debug', `Credential re-auth failed: ${companionError.message}`)
						})
				}
			} else {
				this.connectionState = 'connection_failure'
				this.updateStatus(InstanceStatus.ConnectionFailure, message)
			}
			this.updateVariableValuesFromState()
			this.checkFeedbacks('connection_ok', 'module_not_running', 'target_volume_bar')
		})

		this.socket.on('snapshot', (snapshot) => {
			this.applySnapshot(snapshot)
			this.refreshTargetsForAllUsers().catch((error) => {
				const companionError = toCompanionError(error)
				this.log('debug', `Target refresh after snapshot failed: ${companionError.message}`)
			})
		})

		this.socket.on('user-targets-updated', (payload) => {
			const userId = Number(payload?.userId)
			if (Number.isFinite(userId)) {
				this.refreshTargetsForSingleUser(userId).catch((error) => {
					const companionError = toCompanionError(error)
					this.log('debug', `Target refresh for user ${userId} failed: ${companionError.message}`)
				})
				return
			}
			this.refreshTargetsForAllUsers().catch((error) => {
				const companionError = toCompanionError(error)
				this.log('debug', `Target refresh failed: ${companionError.message}`)
			})
		})

		this.socket.on('user-state', (payload) => {
			if (payload?.state) {
				this.applyUserState(payload.state)
			}
		})

		this.socket.on('cut-camera', (payload) => {
			this.cutCameraUser = asString(payload?.user)
			this.scheduleUiRefresh(['user_cut_camera'])
		})

		this.socket.on('command-result', (payload) => {
			this.applyCommandResult(payload)
		})
	}

	applySnapshot(snapshot: unknown): void {
		const rawSnapshot = (snapshot ?? {}) as Record<string, unknown>
		this.applyScope(rawSnapshot.scope, {
			mode: this.scopeMode,
			userId: this.scopeUserId,
			userName: this.scopeUserName,
		})
		this.users.clear()
		this.conferences.clear()
		this.feeds.clear()

		this.cutCameraUser = asString(rawSnapshot.cutCameraUser)

		const users = Array.isArray(rawSnapshot.users) ? rawSnapshot.users : []
		for (const row of users) {
			const rawRow = (row ?? {}) as Record<string, unknown>
			const state = (rawRow.state ?? {}) as Record<string, unknown>
			const id = Number(rawRow.id ?? state.userId)
			if (!Number.isFinite(id)) continue

			const user = this.makeEmptyUserState(id)
			user.name = asString(rawRow.name || state.name || user.name)
			this.mergeUserState(user, state)
			this.users.set(id, user)
		}

		const conferences = Array.isArray(rawSnapshot.conferences) ? rawSnapshot.conferences : []
		for (const row of conferences) {
			const rawConference = (row ?? {}) as Record<string, unknown>
			const id = Number(rawConference.id)
			if (!Number.isFinite(id)) continue
			this.conferences.set(id, {
				id,
				name: asString(rawConference.name) || `Conference ${id}`,
			})
		}

		const feeds = Array.isArray(rawSnapshot.feeds) ? rawSnapshot.feeds : []
		for (const row of feeds) {
			const rawFeed = (row ?? {}) as Record<string, unknown>
			const id = Number(rawFeed.id)
			if (!Number.isFinite(id)) continue
			this.feeds.set(id, {
				id,
				name: asString(rawFeed.name) || `Feed ${id}`,
			})
		}

		this.refreshChoiceCaches()
		this.refreshDefinitions()
		this.updateVariableValuesFromState()
		this.checkFeedbacks(
			'connection_ok',
			'module_not_running',
			'user_online',
			'user_talking',
			'user_talking_target',
			'user_talking_reply',
			'user_locked',
			'target_volume_bar',
			'target_muted',
			'target_online',
			'target_offline',
			'target_addressed_now',
			'reply_available',
			'user_addressed_now',
			'operator_not_logged_in',
			'user_cut_camera',
			'last_command_failed',
		)
	}

	normalizePresetTargetRow(rawTarget: unknown): PresetTarget | null {
		const raw = (rawTarget ?? {}) as Record<string, unknown>
		const targetType = asString(raw.targetType).toLowerCase()
		if (targetType !== 'conference' && targetType !== 'user' && targetType !== 'feed') return null

		const targetId = Number(raw.targetId)
		if (!Number.isFinite(targetId)) return null

		return {
			targetType: targetType as PresetTarget['targetType'],
			targetId,
			name: asString(raw.name) || `${targetType} ${targetId}`,
		}
	}

	areSameTargetLists(left: PresetTarget[], right: PresetTarget[]): boolean {
		if (left.length !== right.length) return false

		for (let i = 0; i < left.length; i += 1) {
			const a = left[i]
			const b = right[i]
			if (
				asString(a?.targetType) !== asString(b?.targetType) ||
				Number(a?.targetId) !== Number(b?.targetId) ||
				asString(a?.name) !== asString(b?.name)
			) {
				return false
			}
		}

		return true
	}

	async fetchTargetsForUser(userId: number): Promise<PresetTarget[]> {
		const response = await this.apiRequest('GET', `/api/v1/companion/users/${userId}/targets`)
		const rawTargets = Array.isArray(response.data) ? response.data : []
		const normalizedTargets: PresetTarget[] = []
		for (const row of rawTargets) {
			const normalized = this.normalizePresetTargetRow(row)
			if (normalized) normalizedTargets.push(normalized)
		}
		return normalizedTargets
	}

	async refreshTargetsForUsers(
		userIds: unknown[],
		{ pruneMissing = false }: { pruneMissing?: boolean } = {},
	): Promise<void> {
		const normalizedUserIds = Array.from(
			new Set((userIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && this.users.has(id))),
		)

		let changed = false
		if (pruneMissing) {
			const activeIdSet = new Set(normalizedUserIds.map((id) => String(id)))
			for (const existingKey of Array.from(this.userTargets.keys())) {
				if (!activeIdSet.has(String(existingKey))) {
					this.userTargets.delete(existingKey)
					changed = true
				}
			}
		}

		const results = await Promise.all(
			normalizedUserIds.map(async (userId) => {
				try {
					const targets = await this.fetchTargetsForUser(userId)
					return { userId, targets }
				} catch (error) {
					const companionError = toCompanionError(error)
					this.log('debug', `Targets for user ${userId} failed: ${companionError.message}`)
					return { userId, targets: this.userTargets.get(userId) || [] }
				}
			}),
		)

		for (const result of results) {
			const previous = this.userTargets.get(result.userId) || []
			if (!this.areSameTargetLists(previous, result.targets)) {
				this.userTargets.set(result.userId, result.targets)
				changed = true
			}
		}

		if (changed) {
			this.scheduleUiRefresh(
				[
					'target_volume_bar',
					'target_muted',
					'target_online',
					'target_offline',
					'user_talking_target',
					'user_talking_reply',
					'target_addressed_now',
					'reply_available',
					'user_addressed_now',
				],
				{ refreshDefinitions: true },
			)
		}
	}

	async refreshTargetsForAllUsers() {
		const scopedUserIds = this.hasGlobalOperatorAccess()
			? Array.from(this.users.keys())
			: Number.isFinite(Number(this.scopeUserId))
				? [Number(this.scopeUserId)]
				: []
		await this.refreshTargetsForUsers(scopedUserIds, { pruneMissing: true })
	}

	async refreshTargetsForSingleUser(userId: unknown): Promise<void> {
		const normalizedUserId = Number(userId)
		if (!Number.isFinite(normalizedUserId) || !this.users.has(normalizedUserId)) {
			return
		}
		if (!this.canControlUser(normalizedUserId)) {
			return
		}
		await this.refreshTargetsForUsers([normalizedUserId], { pruneMissing: false })
	}

	applyUserState(rawState: unknown): void {
		const raw = (rawState ?? {}) as Record<string, unknown>
		const userId = Number(raw.userId)
		if (!Number.isFinite(userId)) return

		const existingUser = this.users.get(userId) || null
		const user = existingUser || this.makeEmptyUserState(userId)
		const previousName = existingUser?.name || ''
		this.mergeUserState(user, raw)
		this.users.set(userId, user)

		this.scheduleUiRefresh(
			[
				'module_not_running',
				'user_online',
				'user_talking',
				'user_talking_target',
				'user_talking_reply',
				'user_locked',
				'target_volume_bar',
				'target_muted',
				'target_online',
				'target_offline',
				'target_addressed_now',
				'reply_available',
				'user_addressed_now',
				'operator_not_logged_in',
				'user_cut_camera',
			],
			{
				refreshDefinitions: !existingUser || previousName !== user.name,
			},
		)
	}

	makeEmptyUserState(userId: number): UserState {
		return {
			id: userId,
			name: `User ${userId}`,
			online: false,
			talking: false,
			talkLocked: false,
			socketId: '',
			currentTarget: null,
			currentTargets: [],
			lastTarget: null,
			lastTargets: [],
			addressedNow: [],
			replyTarget: null,
			targetAudioStates: [],
			lastSpokeAt: null,
			updatedAt: null,
		}
	}

	mergeUserState(target: UserState, rawState: unknown): void {
		const raw = (rawState ?? {}) as Record<string, unknown>
		target.name = asString(raw.name || target.name)
		target.online = Boolean(raw.online)
		target.talking = Boolean(raw.talking)
		target.talkLocked = Boolean(raw.talkLocked)
		target.socketId = asString(raw.socketId)
		const currentTarget = this.normalizeStateTarget(raw.currentTarget)
		const currentTargets = this.normalizeStateTargets(raw.currentTargets)
		const lastTarget = this.normalizeStateTarget(raw.lastTarget)
		const lastTargets = this.normalizeStateTargets(raw.lastTargets)
		target.currentTargets = currentTargets.length > 0 ? currentTargets : currentTarget ? [currentTarget] : []
		target.currentTarget = target.currentTargets[0] || currentTarget
		target.lastTargets = lastTargets.length > 0 ? lastTargets : lastTarget ? [lastTarget] : []
		target.lastTarget = target.lastTargets[0] || lastTarget
		target.addressedNow = this.normalizeAddressedEntries(raw.addressedNow)
		target.replyTarget = this.normalizeAddressedEntry(raw.replyTarget)
		target.lastCommandId = asString(raw.lastCommandId)
		target.lastCommandResult = asString(raw.lastCommandResult)
		target.targetAudioStates = this.normalizeTargetAudioStates(raw.targetAudioStates)
		target.lastSpokeAt = this.normalizeTimestamp(raw.lastSpokeAt)
		target.updatedAt = this.normalizeTimestamp(raw.updatedAt)
	}

	normalizeAddressedEntry(rawEntry: unknown): AddressedEntry | null {
		const raw = (rawEntry ?? {}) as Record<string, unknown>
		const targetType = asString(raw.targetType).toLowerCase()
		if (targetType !== 'user' && targetType !== 'conference') return null

		const targetId = Number(raw.targetId)
		if (!Number.isFinite(targetId)) return null

		const fromUserId = Number(raw.fromUserId)

		return {
			fromUserId: Number.isFinite(fromUserId) ? fromUserId : 0,
			fromName: asString(raw.fromName),
			targetType: targetType as AddressedEntry['targetType'],
			targetId,
			at: this.normalizeTimestamp(raw.at) || 0,
		}
	}

	normalizeAddressedEntries(rawEntries: unknown): AddressedEntry[] {
		if (!Array.isArray(rawEntries)) return []
		const normalized: AddressedEntry[] = []
		const seen = new Set<string>()
		for (const rawEntry of rawEntries) {
			const entry = this.normalizeAddressedEntry(rawEntry)
			if (!entry) continue
			const key = `${entry.targetType}:${entry.targetId}`
			if (seen.has(key)) continue
			seen.add(key)
			normalized.push(entry)
		}
		normalized.sort((left, right) => Number(right.at || 0) - Number(left.at || 0))
		return normalized
	}

	normalizeTargetAudioState(rawState: unknown): TargetAudioState | null {
		const raw = (rawState ?? {}) as Record<string, unknown>
		const targetType = asString(raw.targetType).toLowerCase()
		if (targetType !== 'user' && targetType !== 'conference' && targetType !== 'feed') return null

		const targetId = Number(raw.targetId)
		if (!Number.isFinite(targetId)) return null

		const rawVolume = Number(raw.volume)
		const volume = Number.isFinite(rawVolume) ? clampUnitInterval(rawVolume) : null

		return {
			targetType: targetType as TargetAudioState['targetType'],
			targetId,
			muted: Boolean(raw.muted),
			volume,
		}
	}

	normalizeTargetAudioStates(rawStates: unknown): TargetAudioState[] {
		if (!Array.isArray(rawStates)) return []
		const normalized: TargetAudioState[] = []
		const seen = new Set<string>()
		for (const rawState of rawStates) {
			const state = this.normalizeTargetAudioState(rawState)
			if (!state) continue
			const key = `${state.targetType}:${state.targetId}`
			if (seen.has(key)) continue
			seen.add(key)
			normalized.push(state)
		}
		return normalized
	}

	normalizeStateTarget(rawTarget: unknown): NormalizedTarget | null {
		const raw = (rawTarget ?? {}) as Record<string, unknown>
		const type = asString(raw.type).toLowerCase()
		if (type !== 'user' && type !== 'conference') return null
		const rawId = raw.id
		if (rawId === null || rawId === undefined || rawId === '') return null
		const numericId = Number(rawId)
		const id = Number.isFinite(numericId) ? numericId : asString(rawId)
		if (id === '') return null
		return { type: type as NormalizedTarget['type'], id }
	}

	normalizeStateTargets(rawTargets: unknown): NormalizedTarget[] {
		if (!Array.isArray(rawTargets)) return []
		const normalizedTargets: NormalizedTarget[] = []
		const seen = new Set<string>()
		for (const rawTarget of rawTargets) {
			const target = this.normalizeStateTarget(rawTarget)
			if (!target) continue
			const key = `${target.type}:${target.id}`
			if (seen.has(key)) continue
			seen.add(key)
			normalizedTargets.push(target)
		}
		return normalizedTargets
	}

	normalizeTimestamp(rawValue: unknown): number | null {
		if (rawValue === null || rawValue === undefined || rawValue === '') return null
		const numeric = Number(rawValue)
		if (Number.isFinite(numeric)) return numeric
		const parsed = Date.parse(String(rawValue))
		return Number.isFinite(parsed) ? parsed : null
	}

	replyFromVariableId(userId: number | string): string {
		return `reply_from_user_${Number(userId)}`
	}

	replyFromVariableToken(userId: number | string): string {
		const instanceId = asString(this.id || this.label) || 'talktome'
		return `$(${instanceId}:${this.replyFromVariableId(userId)})`
	}

	resolveUserIdFromTargetId(rawTargetId: unknown): number | null {
		const numericId = Number(rawTargetId)
		if (Number.isFinite(numericId)) return numericId

		const socketId = asString(rawTargetId)
		if (!socketId) return null

		for (const user of this.users.values()) {
			const userId = Number(user?.id)
			if (!Number.isFinite(userId)) continue
			if (asString(user?.socketId) === socketId) {
				return userId
			}
		}

		return null
	}

	areTargetsEquivalent(left: unknown, right: unknown): boolean {
		const a = this.normalizeStateTarget(left)
		const b = this.normalizeStateTarget(right)
		if (!a || !b) return false
		if (a.type !== b.type) return false

		if (a.type === 'conference') {
			return Number(a.id) === Number(b.id)
		}

		const aUserId = this.resolveUserIdFromTargetId(a.id)
		const bUserId = this.resolveUserIdFromTargetId(b.id)
		if (!Number.isFinite(aUserId) || !Number.isFinite(bUserId)) return false
		return aUserId === bUserId
	}

	resolveReplyReferenceTarget(userId: unknown): NormalizedTarget | null {
		const normalizedUserId = Number(userId)
		if (!Number.isFinite(normalizedUserId)) return null
		const addressed = this.users.get(normalizedUserId)?.replyTarget
		if (!addressed) return null
		return this.normalizeStateTarget({
			type: addressed.targetType,
			id: addressed.targetId,
		})
	}

	getUserCurrentTargets(userId: unknown): NormalizedTarget[] {
		const normalizedUserId = Number(userId)
		if (!Number.isFinite(normalizedUserId)) return []
		const user = this.users.get(normalizedUserId)
		if (!user?.talking) return []

		const explicitTargets = this.normalizeStateTargets(user.currentTargets)
		if (explicitTargets.length > 0) {
			return explicitTargets
		}

		const singleTarget = this.normalizeStateTarget(user.currentTarget)
		return singleTarget ? [singleTarget] : []
	}

	isUserTalkingToExactTarget(userId: unknown, targetType: unknown, targetId: unknown): boolean {
		const normalizedUserId = Number(userId)
		if (!Number.isFinite(normalizedUserId)) return false
		const expectedTarget = this.normalizeStateTarget({ type: targetType, id: targetId })
		if (!expectedTarget) return false

		return this.getUserCurrentTargets(normalizedUserId).some((currentTarget) =>
			this.areTargetsEquivalent(currentTarget, expectedTarget),
		)
	}

	isUserTalkingToReply(userId: unknown): boolean {
		const normalizedUserId = Number(userId)
		if (!Number.isFinite(normalizedUserId)) return false

		const replyTarget = this.resolveReplyReferenceTarget(normalizedUserId)
		if (!replyTarget) return false

		return this.getUserCurrentTargets(normalizedUserId).some((currentTarget) =>
			this.areTargetsEquivalent(currentTarget, replyTarget),
		)
	}

	isAddressingEntryMatchingTarget(
		entry: AddressedEntry | null | undefined,
		targetType: unknown,
		targetId: unknown,
	): boolean {
		if (!entry) return false
		const entryTarget = this.normalizeStateTarget({
			type: entry.targetType,
			id: entry.targetId,
		})
		const expectedTarget = this.normalizeStateTarget({
			type: targetType,
			id: targetId,
		})
		return this.areTargetsEquivalent(entryTarget, expectedTarget)
	}

	isUserAddressedByTargetNow(userId: unknown, targetType: unknown, targetId: unknown): boolean {
		const normalizedUserId = Number(userId)
		if (!Number.isFinite(normalizedUserId)) return false
		const user = this.users.get(normalizedUserId)
		if (!user) return false
		return user.addressedNow.some((entry) => this.isAddressingEntryMatchingTarget(entry, targetType, targetId))
	}

	hasReplyTarget(userId: unknown): boolean {
		const normalizedUserId = Number(userId)
		if (!Number.isFinite(normalizedUserId)) return false
		return Boolean(this.users.get(normalizedUserId)?.replyTarget)
	}

	resolveReplyLabelForEntry(entry: AddressedEntry | null | undefined, userId: unknown): string {
		if (!entry) return ''
		const entryTargetType = asString(entry.targetType).toLowerCase()
		const normalizedUserId = Number(userId)

		if (entryTargetType === 'conference') {
			const conferenceId = Number(entry.targetId)
			if (Number.isFinite(conferenceId)) {
				const conferenceName = asString(this.conferences.get(conferenceId)?.name)
				if (conferenceName) return conferenceName
			}
		}

		if (entryTargetType === 'user') {
			const targetUserId = Number(this.resolveUserIdFromTargetId(entry.targetId))
			if (Number.isFinite(targetUserId) && targetUserId !== normalizedUserId) {
				const targetUserName = asString(this.users.get(targetUserId)?.name)
				if (targetUserName) return targetUserName
			}
			const fromName = asString(entry.fromName)
			if (fromName) return fromName
			const fromUserId = Number(entry.fromUserId)
			if (Number.isFinite(fromUserId)) {
				const fallbackName = asString(this.users.get(fromUserId)?.name)
				if (fallbackName) return fallbackName
			}
		}

		return asString(entry.fromName)
	}

	formatReplyTargetForUser(userId: unknown): string {
		const normalizedUserId = Number(userId)
		if (!Number.isFinite(normalizedUserId)) return ''

		const replyEntry = this.users.get(normalizedUserId)?.replyTarget
		const label = this.resolveReplyLabelForEntry(replyEntry, normalizedUserId)

		return label ? `(${label})` : ''
	}

	normalizeCommandReason(rawReason: unknown): string {
		const reason = asString(rawReason)
		const lower = reason.toLowerCase()
		if (
			lower.includes('offline') ||
			lower.includes('not connected') ||
			lower.includes('target-not-available') ||
			lower.includes('http 409')
		) {
			return 'Target offline'
		}
		return reason
	}

	triggerTargetOfflineFeedbackFlash() {
		if (this.offlineFlashTimer) {
			clearTimeout(this.offlineFlashTimer)
			this.offlineFlashTimer = null
		}
		this.checkFeedbacks('last_target_offline')
		this.offlineFlashTimer = setTimeout(() => {
			this.offlineFlashTimer = null
			this.checkFeedbacks('last_target_offline')
		}, 1500)
	}

	userHasConferenceTarget(userId: unknown, conferenceId: unknown): boolean {
		const targets = this.userTargets.get(Number(userId)) || []
		return targets.some(
			(target) => target.targetType === 'conference' && Number(target.targetId) === Number(conferenceId),
		)
	}

	resolveTargetOnline(targetType: unknown, targetId: unknown): boolean {
		const normalizedType = asString(targetType).toLowerCase()

		if (normalizedType === 'user') {
			const resolvedUserId = Number(this.resolveUserIdFromTargetId(targetId))
			if (!Number.isFinite(resolvedUserId)) return false
			const user = this.users.get(resolvedUserId)
			return Boolean(user?.online && asString(user?.socketId))
		}

		if (normalizedType === 'conference') {
			const normalizedId = Number(targetId)
			if (!Number.isFinite(normalizedId)) return false
			for (const user of this.users.values()) {
				if (!user?.online || !asString(user?.socketId)) continue
				if (this.userHasConferenceTarget(user.id, normalizedId)) {
					return true
				}
			}
		}

		return false
	}

	isTargetMuted(userId: unknown, targetType: unknown, targetId: unknown): boolean {
		const normalizedUserId = Number(userId)
		if (!Number.isFinite(normalizedUserId)) return false

		const user = this.users.get(normalizedUserId)
		if (!user?.online) return false

		const normalizedTargetType = asString(targetType).toLowerCase()
		const normalizedTargetId = Number(targetId)
		if (!Number.isFinite(normalizedTargetId)) return false

		return Boolean(this.getTargetAudioState(normalizedUserId, normalizedTargetType, normalizedTargetId)?.muted)
	}

	getTargetAudioState(userId: unknown, targetType: unknown, targetId: unknown): TargetAudioState | null {
		const normalizedUserId = Number(userId)
		if (!Number.isFinite(normalizedUserId)) return null

		const user = this.users.get(normalizedUserId)
		if (!user) return null

		const normalizedTargetType = asString(targetType).toLowerCase()
		const normalizedTargetId = Number(targetId)
		if (!Number.isFinite(normalizedTargetId)) return null

		return (
			user.targetAudioStates.find(
				(entry) =>
					asString(entry.targetType).toLowerCase() === normalizedTargetType &&
					Number(entry.targetId) === normalizedTargetId,
			) || null
		)
	}

	getTargetVolume(userId: unknown, targetType: unknown, targetId: unknown): number {
		const state = this.getTargetAudioState(userId, targetType, targetId)
		if (state?.volume === null || state?.volume === undefined) {
			return DEFAULT_TARGET_VOLUME
		}
		return clampUnitInterval(state.volume, DEFAULT_TARGET_VOLUME)
	}

	applyCommandResult(payload: unknown): void {
		const raw = (payload ?? {}) as Record<string, unknown>
		const status = raw.ok ? 'ok' : 'failed'
		const reason = this.normalizeCommandReason(raw.reason)
		this.lastCommand = {
			commandId: asString(raw.commandId),
			status,
			reason,
			userId: Number.isFinite(Number(raw.userId)) ? String(Number(raw.userId)) : '',
			targetType: asString(raw.targetType),
			targetId: asString(raw.targetId),
			at: Date.now(),
		}

		if (raw.state) {
			this.applyUserState(raw.state)
		}

		this.scheduleUiRefresh([
			'last_command_failed',
			'user_talking',
			'user_talking_target',
			'user_talking_reply',
			'user_locked',
			'target_volume_bar',
			'target_muted',
			'target_online',
			'target_offline',
			'target_addressed_now',
			'reply_available',
			'user_addressed_now',
			'operator_not_logged_in',
		])

		if (reason === 'Target offline') {
			this.triggerTargetOfflineFeedbackFlash()
		}
	}

	refreshChoiceCaches(): void {
		const sortedUsers = this.getScopedUsers()
		this.userChoices =
			sortedUsers.length > 0
				? sortedUsers.map((user) => ({ id: user.id, label: `${user.name}` }))
				: [{ id: PLACEHOLDER_USER_ID, label: 'No users available' }]

		const sortedConferences = Array.from(this.conferences.values()).sort((a, b) => a.name.localeCompare(b.name))
		this.conferenceChoices =
			sortedConferences.length > 0
				? sortedConferences.map((conference) => ({
						id: conference.id,
						label: `${conference.name}`,
					}))
				: [{ id: PLACEHOLDER_CONFERENCE_ID, label: 'No conferences available' }]

		const sortedFeeds = Array.from(this.feeds.values()).sort((a, b) => a.name.localeCompare(b.name))
		this.feedChoices =
			sortedFeeds.length > 0
				? sortedFeeds.map((feed) => ({
						id: feed.id,
						label: `${feed.name}`,
					}))
				: [{ id: PLACEHOLDER_FEED_ID, label: 'No feeds available' }]
	}

	refreshDefinitions() {
		this.initVariableDefinitions()
		this.initActions()
		this.initFeedbacks()
		this.initPresets()
	}

	resolveChoiceId(rawValue: unknown): number | null {
		const id = Number(rawValue)
		if (!Number.isFinite(id) || id < 0) return null
		return id
	}

	buildCompanionTalkInputKey(actionEvent: CompanionActionEvent | undefined, userId: number): string | null {
		if (!actionEvent) return null
		const instanceId = asString(this.id || this.label) || 'talktome'
		const controlId = asString(actionEvent.controlId)
		if (!controlId) return null
		const surfaceId = asString(actionEvent.surfaceId) || 'surface'
		return `companion:${instanceId}:user:${userId}:surface:${surfaceId}:control:${controlId}`
	}

	async executeTalkCommand(options: Record<string, unknown>, actionEvent?: CompanionActionEvent): Promise<void> {
		const userId = this.resolveChoiceId(options.userId)
		if (!userId) {
			throw new Error('Invalid user')
		}
		if (!this.canControlUser(userId)) {
			const error: CompanionError = new Error('Forbidden for this companion account')
			error.authFailure = true
			throw error
		}

		const action = asString(options.action) || 'press'
		const targetType = asString(options.targetType) || 'conference'
		const waitMs = FIXED_COMMAND_WAIT_MS

		const payload: CommandPayload = {
			action,
			targetType,
			waitMs,
		}
		const inputKey = this.buildCompanionTalkInputKey(actionEvent, userId)
		if (inputKey) {
			payload.inputKey = inputKey
		}

		if (targetType === 'conference') {
			const conferenceId = this.resolveChoiceId(options.targetConferenceId)
			if (!conferenceId) {
				throw new Error('Invalid conference')
			}
			payload.targetId = conferenceId
		} else if (targetType === 'user') {
			const targetUserId = this.resolveChoiceId(options.targetUserId)
			if (!targetUserId) {
				throw new Error('Invalid target user')
			}
			payload.targetId = targetUserId
		}

		let response: AxiosResponse
		try {
			response = await this.apiRequest('POST', `/api/v1/companion/users/${userId}/talk`, payload)
		} catch (error) {
			const companionError = toCompanionError(error)
			if (companionError.statusCode === 409) {
				const result = asObject(companionError.responseData)
				const nestedResult = asObject(result.result)
				const commandId = asString(result.commandId || nestedResult.commandId)
				const reason = this.normalizeCommandReason(nestedResult.reason || result.error || companionError.message)
				this.lastCommand = {
					commandId,
					status: 'failed',
					reason,
					userId: String(userId),
					targetType,
					targetId: asString(payload.targetId),
					at: Date.now(),
				}
				this.updateVariableValuesFromState()
				this.checkFeedbacks('last_command_failed')
				if (reason === 'Target offline') {
					this.triggerTargetOfflineFeedbackFlash()
				}
				return
			}
			throw companionError
		}
		const result = asObject(response.data)
		const nestedResult = asObject(result.result)
		const status = asString(result.status) || (response.status === 202 ? 'pending' : 'ok')
		const reason = this.normalizeCommandReason(nestedResult.reason || result.error)
		const commandId = asString(result.commandId || nestedResult.commandId)

		this.lastCommand = {
			commandId,
			status,
			reason,
			userId: String(userId),
			targetType,
			targetId: asString(payload.targetId),
			at: Date.now(),
		}
		this.updateVariableValuesFromState()
		this.checkFeedbacks('last_command_failed')
		if (reason === 'Target offline') {
			this.triggerTargetOfflineFeedbackFlash()
		}
	}

	async executeTargetAudioCommand(options: Record<string, unknown>): Promise<void> {
		const userId = this.resolveChoiceId(options.userId)
		if (!userId) {
			throw new Error('Invalid user')
		}
		if (!this.canControlUser(userId)) {
			const error: CompanionError = new Error('Forbidden for this companion account')
			error.authFailure = true
			throw error
		}

		const action = asString(options.action) || 'volume-up'
		const targetType = asString(options.targetType).toLowerCase() || 'conference'

		let targetId: number | null = null
		if (targetType === 'conference') {
			targetId = this.resolveChoiceId(options.targetConferenceId)
			if (!targetId) {
				throw new Error('Invalid conference')
			}
		} else if (targetType === 'user') {
			targetId = this.resolveChoiceId(options.targetUserId)
			if (!targetId) {
				throw new Error('Invalid target user')
			}
		} else if (targetType === 'feed') {
			targetId = this.resolveChoiceId(options.targetFeedId)
			if (!targetId) {
				throw new Error('Invalid feed')
			}
		} else {
			throw new Error('Invalid target type')
		}

		const payload: TargetAudioCommandPayload = {
			action,
			targetType: targetType as TargetAudioCommandPayload['targetType'],
			targetId,
		}

		if (action === 'volume-up' || action === 'volume-down') {
			payload.step = FIXED_VOLUME_STEP
		}

		let response: AxiosResponse
		try {
			response = await this.apiRequest('POST', `/api/v1/companion/users/${userId}/target-audio`, payload)
		} catch (error) {
			const companionError = toCompanionError(error)
			if (companionError.statusCode === 409) {
				const result = asObject(companionError.responseData)
				const nestedResult = asObject(result.result)
				const commandId = asString(result.commandId || nestedResult.commandId)
				const reason = this.normalizeCommandReason(nestedResult.reason || result.error || companionError.message)
				this.lastCommand = {
					commandId,
					status: 'failed',
					reason,
					userId: String(userId),
					targetType,
					targetId: String(targetId),
					at: Date.now(),
				}
				this.updateVariableValuesFromState()
				this.checkFeedbacks('last_command_failed')
				if (reason === 'Target offline') {
					this.triggerTargetOfflineFeedbackFlash()
				}
				return
			}
			throw companionError
		}

		const result = asObject(response.data)
		const nestedResult = asObject(result.result)
		const status = asString(result.status) || (response.status === 202 ? 'pending' : 'ok')
		const reason = this.normalizeCommandReason(nestedResult.reason || result.error)
		const commandId = asString(result.commandId || nestedResult.commandId)

		this.lastCommand = {
			commandId,
			status,
			reason,
			userId: String(userId),
			targetType,
			targetId: String(targetId),
			at: Date.now(),
		}
		this.updateVariableValuesFromState()
		this.checkFeedbacks('last_command_failed')
		if (reason === 'Target offline') {
			this.triggerTargetOfflineFeedbackFlash()
		}
	}

	async executeTallyCommand(options: Record<string, unknown>): Promise<void> {
		const action = asString(options.action).toLowerCase() || 'set'
		let targetUserId: number | null = null
		let targetUserName = ''

		if (action === 'set') {
			targetUserId = this.resolveChoiceId(options.userId)
			if (!targetUserId) {
				throw new Error('Invalid user')
			}
			if (!this.canControlUser(targetUserId)) {
				const error: CompanionError = new Error('Forbidden for this companion account')
				error.authFailure = true
				throw error
			}

			targetUserName = asString(this.users.get(targetUserId)?.name)
			if (!targetUserName) {
				throw new Error('Target user missing name')
			}
		} else if (action !== 'clear') {
			throw new Error('Invalid tally action')
		}

		let response: AxiosResponse
		try {
			response = await this.apiRequest('POST', '/cut-camera', {
				user: targetUserName,
			})
		} catch (error) {
			throw toCompanionError(error)
		}

		if (response.status < 200 || response.status >= 300) {
			const result = asObject(response.data)
			const error: CompanionError = new Error(asString(result.error) || `HTTP ${response.status}`)
			error.statusCode = response.status
			error.responseData = response.data
			throw error
		}

		this.cutCameraUser = asString(response.data?.user)
		this.lastCommand = {
			commandId: '',
			status: 'ok',
			reason: '',
			userId: targetUserId ? String(targetUserId) : '',
			targetType: 'tally',
			targetId: targetUserId ? String(targetUserId) : '',
			at: Date.now(),
		}
		this.updateVariableValuesFromState()
		this.checkFeedbacks('last_command_failed', 'user_cut_camera')
	}

	initActions() {
		return defineActions(this, {
			PLACEHOLDER_USER_ID,
			PLACEHOLDER_CONFERENCE_ID,
			PLACEHOLDER_FEED_ID,
			InstanceStatus,
			asString,
		})
	}

	initFeedbacks() {
		return defineFeedbacks(this, {
			PLACEHOLDER_USER_ID,
			combineRgb,
			WEB_COLORS,
			asString,
		})
	}

	initVariableDefinitions() {
		return defineVariableDefinitions(this, { asString })
	}

	updateVariableValuesFromState() {
		return updateVariablesFromState(this)
	}

	initPresets() {
		return definePresets(this, {
			PLACEHOLDER_CONFERENCE_ID,
			PLACEHOLDER_FEED_ID,
			WEB_COLORS,
			truncateLabel,
			combineRgb,
		})
	}
}

runEntrypoint(TalkToMeCompanionInstance, UpgradeScripts)

export {}
