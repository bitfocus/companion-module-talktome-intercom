import type { CompanionStaticUpgradeScript } from '@companion-module/base'
import type { ModuleConfig, ModuleSecrets } from './types.js'

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig, ModuleSecrets>[] = [
	// v1.3.1: preserve the implicit production and PGM behavior of older connections/actions.
	(_context, props) => ({
		updatedConfig:
			props.config && props.config.productionId === undefined ? { ...props.config, productionId: '' } : null,
		updatedSecrets: null,
		updatedActions: props.actions
			.filter((action) => action.actionId === 'send_tally' && action.options.bus === undefined)
			.map((action) => ({
				...action,
				options: { ...action.options, bus: { isExpression: false, value: 'pgm' } },
			})),
		updatedFeedbacks: [],
	}),
]
