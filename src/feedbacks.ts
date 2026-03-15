import type { TalkToMeCompanionInstance } from './main.js'

const TARGET_VOLUME_BAR_SEGMENTS = 10
const TARGET_VOLUME_BAR_MARGIN_X = 7
const TARGET_VOLUME_BAR_MARGIN_BOTTOM = 7
const TARGET_VOLUME_BAR_HEIGHT = 8

type FeedbackDeps = {
	PLACEHOLDER_USER_ID: number
	combineRgb: (r: number, g: number, b: number) => number
	WEB_COLORS: Record<string, number>
	asString: (value: unknown) => string
}

function clampUnitInterval(rawValue: unknown, fallback = 0): number {
	const value = Number(rawValue)
	if (!Number.isFinite(value)) return fallback
	return Math.min(1, Math.max(0, value))
}

function fillRect(
	buffer: Uint8Array,
	bufferWidth: number,
	bufferHeight: number,
	x: number,
	y: number,
	width: number,
	height: number,
	rgba: readonly [number, number, number, number],
): void {
	const startX = Math.max(0, Math.floor(x))
	const startY = Math.max(0, Math.floor(y))
	const endX = Math.min(bufferWidth, Math.ceil(x + width))
	const endY = Math.min(bufferHeight, Math.ceil(y + height))
	if (startX >= endX || startY >= endY) return

	for (let row = startY; row < endY; row += 1) {
		for (let col = startX; col < endX; col += 1) {
			const offset = (row * bufferWidth + col) * 4
			buffer[offset + 0] = rgba[0]
			buffer[offset + 1] = rgba[1]
			buffer[offset + 2] = rgba[2]
			buffer[offset + 3] = rgba[3]
		}
	}
}

function createTargetVolumeBarImage(width: number, height: number, rawVolume: unknown) {
	const safeWidth = Math.max(1, Math.floor(width))
	const safeHeight = Math.max(1, Math.floor(height))
	const normalizedVolume = clampUnitInterval(rawVolume, 0.9)
	const segmentGap = safeWidth >= 80 ? 2 : 1
	const maxBarWidth = Math.max(20, safeWidth - TARGET_VOLUME_BAR_MARGIN_X * 2)
	const segmentWidth = Math.max(
		2,
		Math.floor((maxBarWidth - segmentGap * (TARGET_VOLUME_BAR_SEGMENTS - 1)) / TARGET_VOLUME_BAR_SEGMENTS),
	)
	const barWidth = segmentWidth * TARGET_VOLUME_BAR_SEGMENTS + segmentGap * (TARGET_VOLUME_BAR_SEGMENTS - 1)
	const barHeight = Math.max(6, Math.min(TARGET_VOLUME_BAR_HEIGHT, safeHeight - TARGET_VOLUME_BAR_MARGIN_BOTTOM))
	const buffer = new Uint8Array(barWidth * barHeight * 4)
	const filledColor: readonly [number, number, number, number] = [255, 255, 255, 236]
	const emptyColor: readonly [number, number, number, number] = [255, 255, 255, 72]

	for (let segmentIndex = 0; segmentIndex < TARGET_VOLUME_BAR_SEGMENTS; segmentIndex += 1) {
		const x = segmentIndex * (segmentWidth + segmentGap)
		const segmentFill = Math.min(1, Math.max(0, normalizedVolume * TARGET_VOLUME_BAR_SEGMENTS - segmentIndex))
		const filledWidth = Math.min(segmentWidth, Math.max(0, Math.round(segmentFill * segmentWidth)))

		fillRect(buffer, barWidth, barHeight, x, 0, segmentWidth, barHeight, emptyColor)
		if (filledWidth > 0) {
			fillRect(buffer, barWidth, barHeight, x, 0, filledWidth, barHeight, filledColor)
		}
	}

	return {
		imageBuffer: buffer,
		imageBufferEncoding: { pixelFormat: 'RGBA' as const },
		imageBufferPosition: {
			x: Math.max(0, Math.floor((safeWidth - barWidth) / 2)),
			y: Math.max(0, safeHeight - barHeight - TARGET_VOLUME_BAR_MARGIN_BOTTOM),
			width: barWidth,
			height: barHeight,
		},
	}
}

export function initFeedbacks(self: TalkToMeCompanionInstance, deps: FeedbackDeps): void {
	const { PLACEHOLDER_USER_ID, combineRgb, WEB_COLORS, asString } = deps
	const defaultUserId = self.userChoices[0]?.id ?? PLACEHOLDER_USER_ID

	self.setFeedbackDefinitions({
		connection_ok: {
			type: 'boolean',
			name: 'Connected',
			description: 'True when socket or snapshot connection is active',
			defaultStyle: {
				bgcolor: combineRgb(0, 140, 70),
				color: combineRgb(255, 255, 255),
			},
			options: [],
			callback: () => self.connectionState === 'connected',
		},
		module_not_running: {
			type: 'boolean',
			name: 'No connection',
			defaultStyle: {
				bgcolor: WEB_COLORS.offline,
				color: WEB_COLORS.offlineText,
				text: 'NO\\nCONNECTION',
			},
			options: [],
			callback: () => self.connectionState !== 'connected',
		},
		user_online: {
			type: 'boolean',
			name: 'User online',
			defaultStyle: {
				bgcolor: WEB_COLORS.blue,
				color: WEB_COLORS.blueText,
			},
			options: [
				{
					type: 'dropdown',
					id: 'userId',
					label: 'User',
					default: defaultUserId,
					choices: self.userChoices,
				},
			],
			callback: (feedback) => {
				const userId = self.resolveChoiceId(feedback.options.userId)
				if (!userId) return false
				return Boolean(self.users.get(userId)?.online)
			},
		},
		user_talking: {
			type: 'boolean',
			name: 'User talking',
			defaultStyle: {
				bgcolor: WEB_COLORS.purple,
				color: WEB_COLORS.purpleText,
			},
			options: [
				{
					type: 'dropdown',
					id: 'userId',
					label: 'User',
					default: defaultUserId,
					choices: self.userChoices,
				},
			],
			callback: (feedback) => {
				const userId = self.resolveChoiceId(feedback.options.userId)
				if (!userId) return false
				return Boolean(self.users.get(userId)?.talking)
			},
		},
		user_talking_target: {
			type: 'boolean',
			name: 'User talking to target',
			defaultStyle: {
				bgcolor: WEB_COLORS.purple,
				color: WEB_COLORS.purpleText,
			},
			options: [
				{
					type: 'dropdown',
					id: 'userId',
					label: 'Operator User',
					default: defaultUserId,
					choices: self.userChoices,
				},
				{
					type: 'dropdown',
					id: 'targetType',
					label: 'Target Type',
					default: 'user',
					choices: [
						{ id: 'user', label: 'user' },
						{ id: 'conference', label: 'conference' },
					],
				},
				{
					type: 'number',
					id: 'targetId',
					label: 'Target ID',
					default: defaultUserId,
					min: 1,
					max: 100000,
				},
			],
			callback: (feedback) => {
				const userId = self.resolveChoiceId(feedback.options.userId)
				if (!userId) return false
				const targetType = asString(feedback.options.targetType).toLowerCase()
				const targetId = self.resolveChoiceId(feedback.options.targetId)
				if (!targetId) return false
				return self.isUserTalkingToExactTarget(userId, targetType, targetId)
			},
		},
		user_talking_reply: {
			type: 'boolean',
			name: 'User talking via reply',
			defaultStyle: {
				bgcolor: WEB_COLORS.purple,
				color: WEB_COLORS.purpleText,
			},
			options: [
				{
					type: 'dropdown',
					id: 'userId',
					label: 'Operator User',
					default: defaultUserId,
					choices: self.userChoices,
				},
			],
			callback: (feedback) => {
				const userId = self.resolveChoiceId(feedback.options.userId)
				if (!userId) return false
				return self.isUserTalkingToReply(userId)
			},
		},
		reply_available: {
			type: 'boolean',
			name: 'Reply available',
			defaultStyle: {
				bgcolor: WEB_COLORS.blue,
				color: WEB_COLORS.blueText,
			},
			options: [
				{
					type: 'dropdown',
					id: 'userId',
					label: 'Operator User',
					default: defaultUserId,
					choices: self.userChoices,
				},
			],
			callback: (feedback) => {
				const userId = self.resolveChoiceId(feedback.options.userId)
				if (!userId) return false
				return self.hasReplyTarget(userId)
			},
		},
		user_locked: {
			type: 'boolean',
			name: 'User talk lock',
			defaultStyle: {
				bgcolor: combineRgb(222, 125, 0),
				color: combineRgb(20, 20, 20),
			},
			options: [
				{
					type: 'dropdown',
					id: 'userId',
					label: 'User',
					default: defaultUserId,
					choices: self.userChoices,
				},
			],
			callback: (feedback) => {
				const userId = self.resolveChoiceId(feedback.options.userId)
				if (!userId) return false
				return Boolean(self.users.get(userId)?.talkLocked)
			},
		},
		target_muted: {
			type: 'boolean',
			name: 'Target muted',
			defaultStyle: {
				bgcolor: WEB_COLORS.red,
				color: WEB_COLORS.redText,
			},
			options: [
				{
					type: 'dropdown',
					id: 'userId',
					label: 'Operator User',
					default: defaultUserId,
					choices: self.userChoices,
				},
				{
					type: 'dropdown',
					id: 'targetType',
					label: 'Target Type',
					default: 'user',
					choices: [
						{ id: 'user', label: 'user' },
						{ id: 'conference', label: 'conference' },
						{ id: 'feed', label: 'feed' },
					],
				},
				{
					type: 'number',
					id: 'targetId',
					label: 'Target ID',
					default: defaultUserId,
					min: 1,
					max: 100000,
				},
			],
			callback: (feedback) => {
				const operatorUserId = self.resolveChoiceId(feedback.options.userId)
				if (!operatorUserId) return false
				if (!self.users.get(operatorUserId)?.online) return false

				const targetId = self.resolveChoiceId(feedback.options.targetId)
				if (!targetId) return false
				const targetType = asString(feedback.options.targetType).toLowerCase()

				return self.isTargetMuted(operatorUserId, targetType, targetId)
			},
		},
		target_volume_bar: {
			type: 'advanced',
			name: 'Target volume bar',
			description: 'Draw the current target volume as a segmented bar',
			options: [
				{
					type: 'dropdown',
					id: 'userId',
					label: 'Operator User',
					default: defaultUserId,
					choices: self.userChoices,
				},
				{
					type: 'dropdown',
					id: 'targetType',
					label: 'Target Type',
					default: 'user',
					choices: [
						{ id: 'user', label: 'user' },
						{ id: 'conference', label: 'conference' },
						{ id: 'feed', label: 'feed' },
					],
				},
				{
					type: 'number',
					id: 'targetId',
					label: 'Target ID',
					default: defaultUserId,
					min: 1,
					max: 100000,
				},
			],
			callback: (feedback) => {
				const image = feedback.image
				if (!image?.width || !image?.height) return {}
				if (self.connectionState !== 'connected') return {}

				const operatorUserId = self.resolveChoiceId(feedback.options.userId)
				if (!operatorUserId) return {}
				if (!self.users.get(operatorUserId)?.online) return {}

				const targetId = self.resolveChoiceId(feedback.options.targetId)
				if (!targetId) return {}
				const targetType = asString(feedback.options.targetType).toLowerCase()

				if (targetType !== 'feed' && !self.resolveTargetOnline(targetType, targetId)) {
					return {}
				}

				return createTargetVolumeBarImage(
					image.width,
					image.height,
					self.getTargetVolume(operatorUserId, targetType, targetId),
				)
			},
		},
		target_online: {
			type: 'boolean',
			name: 'Target online',
			defaultStyle: {
				bgcolor: WEB_COLORS.blue,
				color: WEB_COLORS.blueText,
			},
			options: [
				{
					type: 'dropdown',
					id: 'userId',
					label: 'Operator User',
					default: defaultUserId,
					choices: self.userChoices,
				},
				{
					type: 'dropdown',
					id: 'targetType',
					label: 'Target Type',
					default: 'user',
					choices: [
						{ id: 'user', label: 'user' },
						{ id: 'conference', label: 'conference' },
					],
				},
				{
					type: 'number',
					id: 'targetId',
					label: 'Target ID',
					default: defaultUserId,
					min: 1,
					max: 100000,
				},
			],
			callback: (feedback) => {
				const operatorUserId = self.resolveChoiceId(feedback.options.userId)
				if (!operatorUserId) return false
				if (!self.users.get(operatorUserId)?.online) return false

				const targetId = self.resolveChoiceId(feedback.options.targetId)
				if (!targetId) return false
				const targetType = asString(feedback.options.targetType).toLowerCase()

				return self.resolveTargetOnline(targetType, targetId)
			},
		},
		target_offline: {
			type: 'boolean',
			name: 'Target offline',
			defaultStyle: {
				bgcolor: WEB_COLORS.offline,
				color: WEB_COLORS.offlineText,
			},
			options: [
				{
					type: 'dropdown',
					id: 'userId',
					label: 'Operator User',
					default: defaultUserId,
					choices: self.userChoices,
				},
				{
					type: 'dropdown',
					id: 'targetType',
					label: 'Target Type',
					default: 'user',
					choices: [
						{ id: 'user', label: 'user' },
						{ id: 'conference', label: 'conference' },
					],
				},
				{
					type: 'number',
					id: 'targetId',
					label: 'Target ID',
					default: defaultUserId,
					min: 1,
					max: 100000,
				},
			],
			callback: (feedback) => {
				const operatorUserId = self.resolveChoiceId(feedback.options.userId)
				if (!operatorUserId) return false

				const targetId = self.resolveChoiceId(feedback.options.targetId)
				if (!targetId) return false
				const targetType = asString(feedback.options.targetType).toLowerCase()

				return !self.resolveTargetOnline(targetType, targetId)
			},
		},
		target_addressed_now: {
			type: 'boolean',
			name: 'Target speaks to user (now)',
			defaultStyle: {
				bgcolor: WEB_COLORS.green,
				color: WEB_COLORS.greenText,
			},
			options: [
				{
					type: 'dropdown',
					id: 'userId',
					label: 'Operator User',
					default: defaultUserId,
					choices: self.userChoices,
				},
				{
					type: 'dropdown',
					id: 'targetType',
					label: 'Target Type',
					default: 'user',
					choices: [
						{ id: 'user', label: 'user' },
						{ id: 'conference', label: 'conference' },
					],
				},
				{
					type: 'number',
					id: 'targetId',
					label: 'Target ID',
					default: defaultUserId,
					min: 1,
					max: 100000,
				},
			],
			callback: (feedback) => {
				const userId = self.resolveChoiceId(feedback.options.userId)
				if (!userId) return false
				const targetType = asString(feedback.options.targetType).toLowerCase()
				const targetId = self.resolveChoiceId(feedback.options.targetId)
				if (!targetId) return false
				return self.isUserAddressedByTargetNow(userId, targetType, targetId)
			},
		},
		last_target_offline: {
			type: 'boolean',
			name: 'Last pressed target offline',
			defaultStyle: {
				bgcolor: WEB_COLORS.offline,
				color: WEB_COLORS.offlineText,
				text: 'TARGET\\nOFFLINE',
			},
			options: [
				{
					type: 'dropdown',
					id: 'userId',
					label: 'Operator User',
					default: defaultUserId,
					choices: self.userChoices,
				},
				{
					type: 'dropdown',
					id: 'targetType',
					label: 'Target Type',
					default: 'user',
					choices: [
						{ id: 'user', label: 'user' },
						{ id: 'conference', label: 'conference' },
					],
				},
				{
					type: 'number',
					id: 'targetId',
					label: 'Target ID',
					default: defaultUserId,
					min: 1,
					max: 100000,
				},
			],
			callback: (feedback) => {
				const userId = self.resolveChoiceId(feedback.options.userId)
				if (!userId) return false
				if (asString(self.lastCommand.reason) !== 'Target offline') return false
				if (asString(self.lastCommand.userId) !== String(userId)) return false
				if (Date.now() - Number(self.lastCommand.at || 0) > 1500) return false

				const targetType = asString(feedback.options.targetType).toLowerCase()
				const targetId = self.resolveChoiceId(feedback.options.targetId)
				if (!targetId) return false

				return (
					asString(self.lastCommand.targetType).toLowerCase() === targetType &&
					Number(self.lastCommand.targetId) === Number(targetId)
				)
			},
		},
		user_addressed_now: {
			type: 'boolean',
			name: 'User is being addressed (now)',
			defaultStyle: {
				bgcolor: WEB_COLORS.green,
				color: WEB_COLORS.greenText,
			},
			options: [
				{
					type: 'dropdown',
					id: 'userId',
					label: 'User',
					default: defaultUserId,
					choices: self.userChoices,
				},
			],
			callback: (feedback) => {
				const userId = self.resolveChoiceId(feedback.options.userId)
				if (!userId) return false
				return self.currentAddressedBy.has(userId)
			},
		},
		operator_not_logged_in: {
			type: 'boolean',
			name: 'User not logged in',
			defaultStyle: {
				bgcolor: WEB_COLORS.offline,
				color: WEB_COLORS.offlineText,
				text: 'LOGIN TO TALK',
			},
			options: [
				{
					type: 'dropdown',
					id: 'userId',
					label: 'User',
					default: defaultUserId,
					choices: self.userChoices,
				},
			],
			callback: (feedback) => {
				const userId = self.resolveChoiceId(feedback.options.userId)
				if (!userId) return true
				return !self.users.get(userId)?.online
			},
		},
		user_cut_camera: {
			type: 'boolean',
			name: 'User on-air (cut-camera)',
			defaultStyle: {
				bgcolor: combineRgb(140, 0, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					type: 'dropdown',
					id: 'userId',
					label: 'User',
					default: defaultUserId,
					choices: self.userChoices,
				},
			],
			callback: (feedback) => {
				const userId = self.resolveChoiceId(feedback.options.userId)
				if (!userId) return false
				const user = self.users.get(userId)
				return Boolean(user?.name && self.cutCameraUser && user.name === self.cutCameraUser)
			},
		},
		last_command_failed: {
			type: 'boolean',
			name: 'Last command failed',
			defaultStyle: {
				bgcolor: combineRgb(180, 0, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [],
			callback: () => {
				const status = asString(self.lastCommand.status).toLowerCase()
				return status === 'failed' || status === 'error'
			},
			showInvert: true,
		},
	})
}
