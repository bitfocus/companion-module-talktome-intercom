import type {
	CompanionPresetDefinitions,
	CompanionPresetFeedback,
	CompanionPresetLayeredFeedback,
	CompanionPresetSection,
} from '@companion-module/base'
import type { ModuleSchema, TalkToMeCompanionInstance } from './main.js'

const PRESET_VOLUME_BAR_PNG =
	'iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAAR0lEQVR42u3QsQkAMAwDQY+X/efIDgrp3LoKhDtQo/KrAAAAAAAAAAAAAAAAAAAAAK4ku+/xt/omn0ACCSSQQAIJJBAA8LMDmFSl/VFLNXQAAAAASUVORK5CYII='
const PRESET_MUTED_ICON_PNG =
	'iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNT6AAAFMmlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iWE1QIENvcmUgNS41LjAiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIgogICAgeG1sbnM6ZXhpZj0iaHR0cDovL25zLmFkb2JlLmNvbS9leGlmLzEuMC8iCiAgICB4bWxuczpwaG90b3Nob3A9Imh0dHA6Ly9ucy5hZG9iZS5jb20vcGhvdG9zaG9wLzEuMC8iCiAgICB4bWxuczp0aWZmPSJodHRwOi8vbnMuYWRvYmUuY29tL3RpZmYvMS4wLyIKICAgIHhtbG5zOnhtcD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLyIKICAgIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIgogICAgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIKICAgZXhpZjpDb2xvclNwYWNlPSIxIgogICBleGlmOlBpeGVsWERpbWVuc2lvbj0iNTEyIgogICBleGlmOlBpeGVsWURpbWVuc2lvbj0iNTEyIgogICBwaG90b3Nob3A6Q29sb3JNb2RlPSIzIgogICBwaG90b3Nob3A6SUNDUHJvZmlsZT0ic1JHQiBJRUM2MTk2Ni0yLjEiCiAgIHRpZmY6SW1hZ2VMZW5ndGg9IjUxMiIKICAgdGlmZjpJbWFnZVdpZHRoPSI1MTIiCiAgIHRpZmY6UmVzb2x1dGlvblVuaXQ9IjIiCiAgIHRpZmY6WFJlc29sdXRpb249Ijk2LzEiCiAgIHRpZmY6WVJlc29sdXRpb249Ijk2LzEiCiAgIHhtcDpNZXRhZGF0YURhdGU9IjIw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'

const AUDIO_BACKGROUND_ELEMENT_ID = 'audio_background'
const AUDIO_LABEL_ELEMENT_ID = 'audio_label'
const AUDIO_GAUGE_ELEMENT_ID = 'audio_gauge'
const AUDIO_MUTED_ICON_ELEMENT_ID = 'audio_muted_icon'
// A shallow text box makes Companion's auto-shrink choose a smaller one-line
// label before it can accept an awkward one-character second line.
const TARGET_LABEL_Y = 35
const TARGET_LABEL_HEIGHT = 30
const TARGET_LABEL_FONT_SIZE = 100

type PresetDeps = {
	PLACEHOLDER_CONFERENCE_ID: number
	PLACEHOLDER_FEED_ID: number
	WEB_COLORS: Record<string, number>
	truncateLabel: (text: unknown, maxLength?: number) => string
	combineRgb: (r: number, g: number, b: number) => number
}

function createLayeredTargetFeedbacks(
	feedbacks: CompanionPresetFeedback<ModuleSchema['feedbacks']>[],
	hasVolumeGauge: boolean,
): CompanionPresetLayeredFeedback<ModuleSchema['feedbacks']>[] {
	const layeredFeedbacks: CompanionPresetLayeredFeedback<ModuleSchema['feedbacks']>[] = []

	for (const feedback of feedbacks) {
		if (feedback.feedbackId === 'target_volume_bar') continue

		const styleOverrides = []
		const showMutedIcon = feedback.feedbackId === 'target_muted'
		if (!showMutedIcon && feedback.style?.bgcolor !== undefined) {
			styleOverrides.push({
				elementId: AUDIO_BACKGROUND_ELEMENT_ID,
				elementProperty: 'color',
				override: {
					isExpression: false,
					value: feedback.style.bgcolor,
				},
			})
		}
		if (!showMutedIcon && feedback.style?.color !== undefined) {
			styleOverrides.push({
				elementId: AUDIO_LABEL_ELEMENT_ID,
				elementProperty: 'color',
				override: {
					isExpression: false,
					value: feedback.style.color,
				},
			})
		}
		if (feedback.style?.text !== undefined) {
			styleOverrides.push({
				elementId: AUDIO_LABEL_ELEMENT_ID,
				elementProperty: 'text',
				override: {
					isExpression: false,
					value: feedback.style.text,
				},
			})
		}

		if (showMutedIcon) {
			styleOverrides.push({
				elementId: AUDIO_MUTED_ICON_ELEMENT_ID,
				elementProperty: 'enabled',
				override: {
					isExpression: false,
					value: true,
				},
			})
		} else if (hasVolumeGauge && feedback.feedbackId === 'connection_ok') {
			styleOverrides.push({
				elementId: AUDIO_GAUGE_ELEMENT_ID,
				elementProperty: 'enabled',
				override: {
					isExpression: false,
					value: true,
				},
			})
		} else if (
			hasVolumeGauge &&
			(feedback.feedbackId === 'target_offline' ||
				feedback.feedbackId === 'operator_not_logged_in' ||
				feedback.feedbackId === 'module_not_running')
		) {
			styleOverrides.push({
				elementId: AUDIO_GAUGE_ELEMENT_ID,
				elementProperty: 'enabled',
				override: {
					isExpression: false,
					value: false,
				},
			})
		}

		layeredFeedbacks.push({
			feedbackId: feedback.feedbackId,
			options: feedback.options,
			styleOverrides,
		})
	}

	return layeredFeedbacks
}

export function initPresets(self: TalkToMeCompanionInstance, deps: PresetDeps): void {
	const { PLACEHOLDER_CONFERENCE_ID, PLACEHOLDER_FEED_ID, WEB_COLORS, truncateLabel, combineRgb } = deps
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}
	const structure: CompanionPresetSection<ModuleSchema>[] = []

	const users = self.getScopedUsers()
	for (const user of users) {
		const userId = user.id
		const userName = user.name || `User ${userId}`
		const userPresetKeys: string[] = []
		const defaultConferenceId = self.conferenceChoices[0]?.id ?? PLACEHOLDER_CONFERENCE_ID
		const userTargets = self.userTargets.get(userId) || []

		const replyPresetKey = `user_${userId}_reply_ptt`
		userPresetKeys.push(replyPresetKey)
		presets[replyPresetKey] = {
			type: 'simple',
			name: `${userName} Reply PTT`,
			style: {
				text: 'NO\\nCONNECTION',
				size: '14',
				color: WEB_COLORS.offlineText,
				bgcolor: WEB_COLORS.offline,
			},
			previewStyle: {
				text: 'REPLY',
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
			const audioPresetKey = `user_${userId}_target_${target.targetType}_${target.targetId}_audio`
			userPresetKeys.push(audioPresetKey)
			const audioCommandOptions = {
				userId,
				targetType: target.targetType,
				targetConferenceId: defaultConferenceId,
				targetUserId: userId,
				targetFeedId: target.targetType === 'feed' ? target.targetId : PLACEHOLDER_FEED_ID,
			}
			if (target.targetType === 'conference') {
				audioCommandOptions.targetConferenceId = target.targetId
			} else if (target.targetType === 'user') {
				audioCommandOptions.targetUserId = target.targetId
			}
			const talkCommandOptions =
				target.targetType === 'feed'
					? null
					: {
							userId,
							targetType: target.targetType,
							targetConferenceId: target.targetType === 'conference' ? target.targetId : defaultConferenceId,
							targetUserId: target.targetType === 'user' ? target.targetId : userId,
						}

			const audioFeedbacks: CompanionPresetFeedback<ModuleSchema['feedbacks']>[] = [
				{
					feedbackId: 'connection_ok',
					options: {},
					style: {
						color: combineRgb(255, 255, 255),
						bgcolor: WEB_COLORS.baseTarget,
					},
				},
				{
					feedbackId: 'target_volume_bar',
					options: {
						userId,
						targetType: target.targetType,
						targetId: target.targetId,
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
			]

			if (target.targetType !== 'feed') {
				audioFeedbacks.splice(
					1,
					0,
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
				)
				audioFeedbacks.splice(
					audioFeedbacks.length - 2,
					0,
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
				)
			}

			const audioSteps = [
				{
					down: talkCommandOptions
						? [
								{
									actionId: 'send_talk_command',
									options: {
										...talkCommandOptions,
										action: 'press',
									},
								},
							]
						: [],
					up: talkCommandOptions
						? [
								{
									actionId: 'send_talk_command',
									options: {
										...talkCommandOptions,
										action: 'release',
									},
								},
							]
						: [],
					rotate_left: [
						{
							actionId: 'change_target_volume',
							options: {
								...audioCommandOptions,
								action: 'volume-down',
							},
						},
					],
					rotate_right: [
						{
							actionId: 'change_target_volume',
							options: {
								...audioCommandOptions,
								action: 'volume-up',
							},
						},
					],
				},
			]
			const simpleAudioPreset = {
				type: 'simple' as const,
				name: `${userName} -> ${target.name} Audio`,
				style: {
					text: targetLabel,
					size: 14,
					alignment: 'center:center' as const,
					color: WEB_COLORS.offlineText,
					bgcolor: WEB_COLORS.offline,
				},
				previewStyle: {
					text: targetLabel,
					png64: PRESET_VOLUME_BAR_PNG,
					pngalignment: 'center:bottom' as const,
				},
				feedbacks: audioFeedbacks,
				steps: audioSteps,
			}
			const layeredAudioPreset = {
				type: 'layered' as const,
				name: `${userName} -> ${target.name} Audio`,
				elements: [
					{
						id: AUDIO_BACKGROUND_ELEMENT_ID,
						name: 'Background',
						type: 'box' as const,
						x: 0,
						y: 0,
						width: 100,
						height: 100,
						color: WEB_COLORS.offline,
					},
					{
						id: AUDIO_LABEL_ELEMENT_ID,
						name: 'Target',
						type: 'text' as const,
						x: 2,
						y: TARGET_LABEL_Y,
						width: 96,
						height: TARGET_LABEL_HEIGHT,
						text: targetLabel,
						fontsize: TARGET_LABEL_FONT_SIZE,
						fontsizeAllowShrink: true,
						color: WEB_COLORS.offlineText,
						halign: 'center' as const,
						valign: 'center' as const,
					},
					{
						id: AUDIO_GAUGE_ELEMENT_ID,
						name: 'Volume',
						type: 'gauge' as const,
						enabled: true,
						x: 8,
						y: 82,
						width: 84,
						height: 10,
						value: {
							isExpression: true as const,
							value: '$(local:target_volume)',
						},
						min: 0,
						max: 1,
						origin: 0,
						orientation: 'horizontal' as const,
						roundedEnds: true,
						fillEnabled: true,
						multiColour: false,
						stops: [
							{
								value: 0,
								color: combineRgb(255, 255, 255),
								gradient: false,
							},
						],
						trackStyle: 'dimmed' as const,
						trackAmount: 28,
						trackWidth: 72,
					},
					{
						id: AUDIO_MUTED_ICON_ELEMENT_ID,
						name: 'Muted',
						type: 'image' as const,
						enabled: false,
						x: 75,
						y: 4,
						width: 21,
						height: 21,
						base64Image: PRESET_MUTED_ICON_PNG,
						halign: 'center' as const,
						valign: 'center' as const,
						fillMode: 'fit' as const,
					},
				],
				localVariables: [
					{
						variableType: 'feedback' as const,
						variableName: 'target_volume',
						feedbackId: 'target_volume',
						options: {
							userId,
							targetType: target.targetType,
							targetId: target.targetId,
						},
					},
				],
				feedbacks: createLayeredTargetFeedbacks(audioFeedbacks, true),
				steps: audioSteps,
			}

			presets[audioPresetKey] = {
				type: 'alternatives',
				variants: [layeredAudioPreset, simpleAudioPreset],
			}

			if (target.targetType === 'feed') {
				continue
			}

			const presetKey = `user_${userId}_target_${target.targetType}_${target.targetId}_ptt`
			userPresetKeys.push(presetKey)
			const commandOptions = {
				userId,
				targetType: target.targetType,
				targetConferenceId: target.targetType === 'conference' ? target.targetId : defaultConferenceId,
				targetUserId: target.targetType === 'user' ? target.targetId : userId,
			}

			const pttFeedbacks: CompanionPresetFeedback<ModuleSchema['feedbacks']>[] = [
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
			]
			const pttSteps = [
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
			]
			const simplePttPreset = {
				type: 'simple' as const,
				name: `${userName} -> ${target.name}`,
				style: {
					text: 'NO\\nCONNECTION',
					size: 14,
					alignment: 'center:center' as const,
					color: WEB_COLORS.offlineText,
					bgcolor: WEB_COLORS.offline,
				},
				previewStyle: {
					text: targetLabel,
				},
				feedbacks: pttFeedbacks,
				steps: pttSteps,
			}
			const layeredPttPreset = {
				type: 'layered' as const,
				name: `${userName} -> ${target.name}`,
				elements: [
					{
						id: AUDIO_BACKGROUND_ELEMENT_ID,
						name: 'Background',
						type: 'box' as const,
						x: 0,
						y: 0,
						width: 100,
						height: 100,
						color: WEB_COLORS.offline,
					},
					{
						id: AUDIO_LABEL_ELEMENT_ID,
						name: 'Target',
						type: 'text' as const,
						x: 2,
						y: TARGET_LABEL_Y,
						width: 96,
						height: TARGET_LABEL_HEIGHT,
						text: targetLabel,
						fontsize: TARGET_LABEL_FONT_SIZE,
						fontsizeAllowShrink: true,
						color: WEB_COLORS.offlineText,
						halign: 'center' as const,
						valign: 'center' as const,
					},
					{
						id: AUDIO_MUTED_ICON_ELEMENT_ID,
						name: 'Muted',
						type: 'image' as const,
						enabled: false,
						x: 75,
						y: 4,
						width: 21,
						height: 21,
						base64Image: PRESET_MUTED_ICON_PNG,
						halign: 'center' as const,
						valign: 'center' as const,
						fillMode: 'fit' as const,
					},
				],
				feedbacks: createLayeredTargetFeedbacks(pttFeedbacks, false),
				steps: pttSteps,
			}

			presets[presetKey] = {
				type: 'alternatives',
				variants: [layeredPttPreset, simplePttPreset],
			}
		}

		structure.push({
			id: `user_${userId}`,
			name: userName,
			description:
				'Buttons with a volume gauge support rotary volume control. Turn left or right to adjust the target volume.',
			definitions: userPresetKeys,
		})
	}

	self.setPresetDefinitions(structure, presets)
}
