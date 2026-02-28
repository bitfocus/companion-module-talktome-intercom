import type { SomeCompanionConfigField } from '@companion-module/base'
import type { ModuleConfig } from './types'

type ConfigDeps = {
	DEFAULT_CONFIG: ModuleConfig
	Regex: { HOSTNAME: string }
}

export function getConfigFields({ DEFAULT_CONFIG, Regex }: ConfigDeps): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'Info',
			width: 12,
			value:
				'Connect this module to the talktome companion api v1. Use either API key auth or user login auth.',
		},
		{
			type: 'dropdown',
			id: 'authMode',
			label: 'Authentication',
			width: 6,
			default: DEFAULT_CONFIG.authMode,
			choices: [
				{ id: 'apiKey', label: 'API key' },
				{ id: 'credentials', label: 'User login' },
			],
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Server Host',
			width: 6,
			default: DEFAULT_CONFIG.host,
			required: true,
			regex: Regex.HOSTNAME,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Server Port',
			width: 6,
			default: DEFAULT_CONFIG.port,
			min: 1,
			max: 65535,
		},
		{
			type: 'checkbox',
			id: 'allowSelfSigned',
			label: 'Allow self-signed TLS',
			width: 6,
			default: DEFAULT_CONFIG.allowSelfSigned,
		},
		{
			type: 'textinput',
			id: 'apiKey',
			label: 'API Key',
			width: 12,
			default: '',
			required: false,
			isVisibleExpression: "$(options:authMode) == 'apiKey'",
		},
		{
			type: 'textinput',
			id: 'username',
			label: 'User Name',
			width: 6,
			default: '',
			required: false,
			isVisibleExpression: "$(options:authMode) == 'credentials'",
		},
		{
			type: 'secret-text',
			id: 'password',
			label: 'Password',
			width: 6,
			default: '',
			required: false,
			isVisibleExpression: "$(options:authMode) == 'credentials'",
		},
	]
}
