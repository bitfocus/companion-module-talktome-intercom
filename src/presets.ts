import type { CompanionPresetDefinitions } from '@companion-module/base'
import type { TalkToMeCompanionInstance } from './main.js'

type PresetDeps = {
	PLACEHOLDER_CONFERENCE_ID: number
	WEB_COLORS: Record<string, number>
	truncateLabel: (text: unknown, maxLength?: number) => string
	combineRgb: (r: number, g: number, b: number) => number
}

export function initPresets(self: TalkToMeCompanionInstance, deps: PresetDeps): void {
	const { PLACEHOLDER_CONFERENCE_ID, WEB_COLORS, truncateLabel, combineRgb } = deps
	const presets: CompanionPresetDefinitions = {}

	const users = self.getScopedUsers()
	for (const user of users) {
		const userId = user.id
		const userName = user.name || `User ${userId}`
		const category = `Users/${userName}`
		const defaultConferenceId = self.conferenceChoices[0]?.id ?? PLACEHOLDER_CONFERENCE_ID
		const userTargets = self.userTargets.get(userId) || []

		presets[`user_${userId}_reply_ptt`] = {
			type: 'button',
			category,
			name: `${userName} Reply PTT`,
			style: {
				text: 'NO\\nCONNECTION',
				size: '14',
				color: WEB_COLORS.offlineText,
				bgcolor: WEB_COLORS.offline,
			},
			feedbacks: [
				{
					feedbackId: 'connection_ok',
					options: {},
					style: {
						bgcolor: WEB_COLORS.offline,
						color: WEB_COLORS.offlineText,
						text: `REPLY\n${self.replyFromVariableToken(userId)}`,
					},
				},
				{
					feedbackId: 'reply_available',
					options: { userId },
					style: {
						bgcolor: WEB_COLORS.blue,
						color: WEB_COLORS.blueText,
					},
				},
				{
					feedbackId: 'user_talking_reply',
					options: { userId },
					style: {
						bgcolor: WEB_COLORS.purple,
						color: WEB_COLORS.purpleText,
					},
				},
				{
					feedbackId: 'operator_not_logged_in',
					options: { userId },
					style: {
						bgcolor: WEB_COLORS.offline,
						color: WEB_COLORS.offlineText,
						text: 'LOGIN TO TALK',
					},
				},
				{
					feedbackId: 'module_not_running',
					options: {},
					style: {
						bgcolor: WEB_COLORS.offline,
						color: WEB_COLORS.offlineText,
						text: 'NO\\nCONNECTION',
					},
				},
			],
			steps: [
				{
					down: [
						{
							actionId: 'send_talk_command',
							options: {
								userId,
								action: 'press',
								targetType: 'reply',
								targetConferenceId: defaultConferenceId,
								targetUserId: userId,
							},
						},
					],
					up: [
						{
							actionId: 'send_talk_command',
							options: {
								userId,
								action: 'release',
								targetType: 'reply',
								targetConferenceId: defaultConferenceId,
								targetUserId: userId,
							},
						},
					],
				},
			],
		}

		const seenTargetKeys = new Set()
		for (const target of userTargets) {
			const dedupeKey = `${target.targetType}:${target.targetId}`
			if (seenTargetKeys.has(dedupeKey)) continue
			seenTargetKeys.add(dedupeKey)

			if (target.targetType === 'user' && Number(target.targetId) === userId) {
				continue
			}

			const targetLabel = truncateLabel(target.name, 10)
			const presetKey = `user_${userId}_target_${target.targetType}_${target.targetId}_ptt`
			const commandOptions = {
				userId,
				targetType: target.targetType,
				targetConferenceId: target.targetType === 'conference' ? target.targetId : defaultConferenceId,
				targetUserId: target.targetType === 'user' ? target.targetId : userId,
			}

			presets[presetKey] = {
				type: 'button',
				category,
				name: `${userName} -> ${target.name}`,
				style: {
					text: 'NO\\nCONNECTION',
					size: '14',
					color: WEB_COLORS.offlineText,
					bgcolor: WEB_COLORS.offline,
				},
				feedbacks: [
					{
						feedbackId: 'connection_ok',
						options: {},
						style: {
							text: targetLabel,
							color: combineRgb(255, 255, 255),
							bgcolor: WEB_COLORS.baseTarget,
						},
					},
					{
						feedbackId: 'target_offline',
						options: {
							userId,
							targetType: target.targetType,
							targetId: target.targetId,
						},
						style: {
							bgcolor: WEB_COLORS.offline,
							color: WEB_COLORS.offlineText,
						},
					},
					{
						feedbackId: 'target_online',
						options: {
							userId,
							targetType: target.targetType,
							targetId: target.targetId,
						},
						style: {
							bgcolor: WEB_COLORS.blue,
							color: WEB_COLORS.blueText,
						},
					},
					{
						feedbackId: 'target_muted',
						options: {
							userId,
							targetType: target.targetType,
							targetId: target.targetId,
						},
						style: {
							bgcolor: WEB_COLORS.red,
							color: WEB_COLORS.redText,
						},
					},
					{
						feedbackId: 'target_addressed_now',
						options: {
							userId,
							targetType: target.targetType,
							targetId: target.targetId,
						},
						style: {
							bgcolor: WEB_COLORS.green,
							color: WEB_COLORS.greenText,
						},
					},
					{
						feedbackId: 'user_talking_target',
						options: {
							userId,
							targetType: target.targetType,
							targetId: target.targetId,
						},
						style: {
							bgcolor: WEB_COLORS.purple,
							color: WEB_COLORS.purpleText,
						},
					},
					{
						feedbackId: 'last_target_offline',
						options: {
							userId,
							targetType: target.targetType,
							targetId: target.targetId,
						},
						style: {
							bgcolor: WEB_COLORS.offline,
							color: WEB_COLORS.offlineText,
							text: 'TARGET\\nOFFLINE',
						},
					},
					{
						feedbackId: 'operator_not_logged_in',
						options: { userId },
						style: {
							bgcolor: WEB_COLORS.offline,
							color: WEB_COLORS.offlineText,
							text: 'LOGIN TO TALK',
						},
					},
					{
						feedbackId: 'module_not_running',
						options: {},
						style: {
							bgcolor: WEB_COLORS.offline,
							color: WEB_COLORS.offlineText,
							text: 'NO\\nCONNECTION',
						},
					},
				],
				steps: [
					{
						down: [
							{
								actionId: 'send_talk_command',
								options: {
									...commandOptions,
									action: 'press',
								},
							},
						],
						up: [
							{
								actionId: 'send_talk_command',
								options: {
									...commandOptions,
									action: 'release',
								},
							},
						],
					},
				],
			}
		}
	}

	self.setPresetDefinitions(presets)
}
