import type { TalkToMeCompanionInstance } from './main'

type VariableDeps = {
	asString: (value: unknown) => string
}

export function initVariableDefinitions(self: TalkToMeCompanionInstance, deps: VariableDeps): void {
	const { asString } = deps
	const definitions = [
		{ variableId: 'connection_state', name: 'Connection state' },
		{ variableId: 'users_online_count', name: 'Users online count' },
		{ variableId: 'users_talking_count', name: 'Users talking count' },
		{ variableId: 'cut_camera_user', name: 'Cut-camera user' },
		{ variableId: 'last_command_id', name: 'Last command id' },
		{ variableId: 'last_command_status', name: 'Last command status' },
		{ variableId: 'last_command_reason', name: 'Last command reason' },
		{ variableId: 'last_command_user', name: 'Last command user id' },
	]

	for (const user of self.getScopedUsers()) {
		const userId = Number(user?.id)
		if (!Number.isFinite(userId)) continue
		const userName = asString(user?.name) || `User ${userId}`
		definitions.push({
			variableId: self.replyFromVariableId(userId),
			name: `reply from (${userName})`,
		})
	}

	self.setVariableDefinitions(definitions)
}

export function updateVariableValuesFromState(self: TalkToMeCompanionInstance): void {
	let usersOnline = 0
	let usersTalking = 0
	for (const user of self.getScopedUsers()) {
		if (user.online) usersOnline += 1
		if (user.talking) usersTalking += 1
	}

	const values: Record<string, string | number> = {
		connection_state: self.connectionState,
		users_online_count: usersOnline,
		users_talking_count: usersTalking,
		cut_camera_user: self.cutCameraUser || '',
		last_command_id: self.lastCommand.commandId || '',
		last_command_status: self.lastCommand.status || '',
		last_command_reason: self.lastCommand.reason || '',
		last_command_user: self.lastCommand.userId || '',
	}

	for (const user of self.getScopedUsers()) {
		const userId = Number(user?.id)
		if (!Number.isFinite(userId)) continue
		values[self.replyFromVariableId(userId)] = self.formatReplyTargetForUser(userId)
	}

	self.setVariableValues(values)
}
