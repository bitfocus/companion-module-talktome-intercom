import type { TalkToMeCompanionInstance } from './main'
import type { CompanionActionEvent } from '@companion-module/base'

type ActionDeps = {
	PLACEHOLDER_USER_ID: number
	PLACEHOLDER_CONFERENCE_ID: number
	InstanceStatus: typeof import('@companion-module/base').InstanceStatus
	asString: (value: unknown) => string
}

export function initActions(self: TalkToMeCompanionInstance, deps: ActionDeps): void {
	const { PLACEHOLDER_USER_ID, PLACEHOLDER_CONFERENCE_ID, InstanceStatus, asString } = deps
	const defaultUserId = self.userChoices[0]?.id ?? PLACEHOLDER_USER_ID
	const defaultConferenceId = self.conferenceChoices[0]?.id ?? PLACEHOLDER_CONFERENCE_ID

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
					await self.executeTalkCommand(event.options)
				} catch (error: unknown) {
					const rawError = error && typeof error === 'object' ? (error as Record<string, unknown>) : {}
					const message = asString(rawError.message) || 'Talk command failed'
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
						targetId: asString(
							targetType === 'conference'
								? event.options.targetConferenceId
								: targetType === 'user'
									? event.options.targetUserId
									: ''
						),
						at: Date.now(),
					}
					self.updateVariableValuesFromState()
					self.checkFeedbacks('last_command_failed')
					if (reason === 'Target offline') {
						self.triggerTargetOfflineFeedbackFlash()
					}
					self.log(Boolean(rawError.authFailure) ? 'error' : 'warn', message)
				}
			},
		},
	})
}
