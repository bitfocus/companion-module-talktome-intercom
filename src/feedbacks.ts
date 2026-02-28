import type { TalkToMeCompanionInstance } from './main'

type FeedbackDeps = {
	PLACEHOLDER_USER_ID: number
	combineRgb: (r: number, g: number, b: number) => number
	WEB_COLORS: Record<string, number>
	asString: (value: unknown) => string
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
