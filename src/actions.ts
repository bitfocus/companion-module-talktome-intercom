import type { TalkToMeCompanionInstance } from './main.js'
import type { CompanionActionEvent } from '@companion-module/base'

type ActionDeps = {
	PLACEHOLDER_USER_ID: number
	PLACEHOLDER_CONFERENCE_ID: number
	PLACEHOLDER_FEED_ID: number
	InstanceStatus: typeof import('@companion-module/base').InstanceStatus
	asString: (value: unknown) => string
}

function resolveTargetIdForEvent(event: CompanionActionEvent, asString: (value: unknown) => string): string {
	const targetType = asString(event.options.targetType)
	if (targetType === 'conference') return asString(event.options.targetConferenceId)
	if (targetType === 'user') return asString(event.options.targetUserId)
	if (targetType === 'feed') return asString(event.options.targetFeedId)
	return ''
}

function handleCommandFailure(
	self: TalkToMeCompanionInstance,
	event: CompanionActionEvent,
	error: unknown,
	defaultMessage: string,
	InstanceStatus: typeof import('@companion-module/base').InstanceStatus,
	asString: (value: unknown) => string,
): void {
	const rawError = error && typeof error === 'object' ? (error as Record<string, unknown>) : {}
	const message = asString(rawError.message) || defaultMessage
	if (message.toLowerCase().includes('auth')) {
		self.connectionState = 'auth_failure'
		self.updateStatus(InstanceStatus.AuthenticationFailure, message)
	}

	const reason = self.normalizeCommandReason(message)
	const eventUserId = self.resolveChoiceId(event.options.userId)
	const targetType = asString(event.options.targetType)
	self.lastCommand = {
		commandId: '',
		status: 'failed',
		reason,
		userId: eventUserId ? String(eventUserId) : '',
		targetType,
		targetId: resolveTargetIdForEvent(event, asString),
		at: Date.now(),
	}
	self.updateVariableValuesFromState()
	self.checkFeedbacks('last_command_failed')
	if (reason === 'Target offline') {
		self.triggerTargetOfflineFeedbackFlash()
	}
	self.log(rawError.authFailure ? 'error' : 'warn', message)
}

export function initActions(self: TalkToMeCompanionInstance, deps: ActionDeps): void {
	const { PLACEHOLDER_USER_ID, PLACEHOLDER_CONFERENCE_ID, PLACEHOLDER_FEED_ID, InstanceStatus, asString } = deps
	const defaultUserId = self.userChoices[0]?.id ?? PLACEHOLDER_USER_ID
	const defaultConferenceId = self.conferenceChoices[0]?.id ?? PLACEHOLDER_CONFERENCE_ID
	const defaultFeedId = self.feedChoices[0]?.id ?? PLACEHOLDER_FEED_ID

	self.setActionDefinitions({
		send_talk_command: {
			name: 'Send talk command',
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
					id: 'action',
					label: 'Action',
					default: 'press',
					choices: [
						{ id: 'press', label: 'press' },
						{ id: 'release', label: 'release' },
						{ id: 'lock-toggle', label: 'lock-toggle' },
					],
				},
				{
					type: 'dropdown',
					id: 'targetType',
					label: 'Target Type',
					default: 'conference',
					choices: [
						{ id: 'conference', label: 'conference' },
						{ id: 'user', label: 'user' },
						{ id: 'reply', label: 'reply' },
					],
				},
				{
					type: 'dropdown',
					id: 'targetConferenceId',
					label: 'Conference',
					default: defaultConferenceId,
					choices: self.conferenceChoices,
					isVisibleExpression: "$(options:targetType) == 'conference'",
				},
				{
					type: 'dropdown',
					id: 'targetUserId',
					label: 'Target User',
					default: defaultUserId,
					choices: self.userChoices,
					isVisibleExpression: "$(options:targetType) == 'user'",
				},
			],
			callback: async (event: CompanionActionEvent) => {
				try {
					await self.executeTalkCommand(event.options, event)
				} catch (error: unknown) {
					handleCommandFailure(self, event, error, 'Talk command failed', InstanceStatus, asString)
				}
			},
		},
		change_target_volume: {
			name: 'Change target volume',
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
					id: 'action',
					label: 'Volume',
					default: 'volume-up',
					choices: [
						{ id: 'volume-up', label: 'up' },
						{ id: 'volume-down', label: 'down' },
					],
				},
				{
					type: 'dropdown',
					id: 'targetType',
					label: 'Target Type',
					default: 'conference',
					choices: [
						{ id: 'conference', label: 'conference' },
						{ id: 'user', label: 'user' },
						{ id: 'feed', label: 'feed' },
					],
				},
				{
					type: 'dropdown',
					id: 'targetConferenceId',
					label: 'Conference',
					default: defaultConferenceId,
					choices: self.conferenceChoices,
					isVisibleExpression: "$(options:targetType) == 'conference'",
				},
				{
					type: 'dropdown',
					id: 'targetUserId',
					label: 'Target User',
					default: defaultUserId,
					choices: self.userChoices,
					isVisibleExpression: "$(options:targetType) == 'user'",
				},
				{
					type: 'dropdown',
					id: 'targetFeedId',
					label: 'Feed',
					default: defaultFeedId,
					choices: self.feedChoices,
					isVisibleExpression: "$(options:targetType) == 'feed'",
				},
			],
			callback: async (event: CompanionActionEvent) => {
				try {
					await self.executeTargetAudioCommand(event.options)
				} catch (error: unknown) {
					handleCommandFailure(self, event, error, 'Change target volume failed', InstanceStatus, asString)
				}
			},
		},
		mute_target: {
			name: 'Mute target',
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
					default: 'conference',
					choices: [
						{ id: 'conference', label: 'conference' },
						{ id: 'user', label: 'user' },
						{ id: 'feed', label: 'feed' },
					],
				},
				{
					type: 'dropdown',
					id: 'targetConferenceId',
					label: 'Conference',
					default: defaultConferenceId,
					choices: self.conferenceChoices,
					isVisibleExpression: "$(options:targetType) == 'conference'",
				},
				{
					type: 'dropdown',
					id: 'targetUserId',
					label: 'Target User',
					default: defaultUserId,
					choices: self.userChoices,
					isVisibleExpression: "$(options:targetType) == 'user'",
				},
				{
					type: 'dropdown',
					id: 'targetFeedId',
					label: 'Feed',
					default: defaultFeedId,
					choices: self.feedChoices,
					isVisibleExpression: "$(options:targetType) == 'feed'",
				},
			],
			callback: async (event: CompanionActionEvent) => {
				try {
					await self.executeTargetAudioCommand({
						...event.options,
						action: 'mute-toggle',
					})
				} catch (error: unknown) {
					handleCommandFailure(self, event, error, 'Mute target failed', InstanceStatus, asString)
				}
			},
		},
		send_tally: {
			name: 'Send tally',
			options: [
				{
					type: 'dropdown',
					id: 'action',
					label: 'Action',
					default: 'set',
					choices: [
						{ id: 'set', label: 'set user' },
						{ id: 'clear', label: 'clear' },
					],
				},
				{
					type: 'dropdown',
					id: 'userId',
					label: 'Tally User',
					default: defaultUserId,
					choices: self.userChoices,
					isVisibleExpression: "$(options:action) == 'set'",
				},
			],
			callback: async (event: CompanionActionEvent) => {
				try {
					await self.executeTallyCommand(event.options)
				} catch (error: unknown) {
					handleCommandFailure(self, event, error, 'Send tally failed', InstanceStatus, asString)
				}
			},
		},
	})
}
