import type { TalkToMeCompanionInstance } from './main.js'

type VariableDeps = {
	asString: (value: unknown) => string
}

export function initVariableDefinitions(self: TalkToMeCompanionInstance, deps: VariableDeps): void {
	const { asString } = deps
	const definitions = []

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
	const values: Record<string, string | number> = {}

	for (const user of self.getScopedUsers()) {
		const userId = Number(user?.id)
		if (!Number.isFinite(userId)) continue
		values[self.replyFromVariableId(userId)] = self.formatReplyTargetForUser(userId)
	}

	self.setVariableValues(values)
}
