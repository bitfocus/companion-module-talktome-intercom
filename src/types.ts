export type AuthMode = 'apiKey' | 'credentials'
export type ScopeMode = 'all' | 'self'
export type ConnectionState =
	| 'disconnected'
	| 'bad_config'
	| 'auth_failure'
	| 'connection_failure'
	| 'connecting'
	| 'connected'

export type TargetType = 'user' | 'conference'
export type AudioTargetType = 'user' | 'conference' | 'feed'

export interface ModuleConfig {
	host: string
	port: number
	allowSelfSigned: boolean
	authMode: AuthMode
	apiKey: string
	username: string
	password: string
}

export interface ModuleSecrets {
	password: string
}

export interface ChoiceItem {
	id: number
	label: string
}

export interface NormalizedTarget {
	type: TargetType
	id: number | string
}

export interface PresetTarget {
	targetType: AudioTargetType
	targetId: number
	name: string
}

export interface AddressedEntry {
	fromUserId: number
	fromName: string
	targetType: TargetType
	targetId: number
	at: number
}

export interface TargetAudioState {
	targetType: AudioTargetType
	targetId: number
	muted: boolean
	volume: number | null
}

export interface UserState {
	id: number
	name: string
	online: boolean
	talking: boolean
	talkLocked: boolean
	socketId: string
	currentTarget: NormalizedTarget | null
	lastTarget: NormalizedTarget | null
	lastCommandId?: string
	lastCommandResult?: string
	targetAudioStates: TargetAudioState[]
	lastSpokeAt: number | null
	updatedAt: number | null
}

export interface LastCommandState {
	commandId: string
	status: string
	reason: string
	userId: string
	targetType: string
	targetId: string
	at: number
}

export interface CommandPayload {
	action: string
	targetType: string
	waitMs: number
	targetId?: number
}

export interface TargetAudioCommandPayload {
	action: string
	targetType: AudioTargetType
	targetId: number
	step?: number
}

export type CompanionError = Error & {
	authFailure?: boolean
	statusCode?: number
	responseData?: unknown
}
