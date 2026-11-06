export interface FormatAction {
	id: string
	label: string
	fontWeight?: string
	fontStyle?: string
	textDecoration?: string
	syntax: [string, string]
}

export const FORMAT_ACTIONS: FormatAction[] = [
	{ id: 'bold', label: 'B', fontWeight: '700', syntax: ['**', '**'] },
	{ id: 'italic', label: 'I', fontStyle: 'italic', syntax: ['*', '*'] },
	{
		id: 'underline',
		label: 'U',
		textDecoration: 'underline',
		syntax: ['__', '__'],
	},
	{
		id: 'strikethrough',
		label: 'S',
		textDecoration: 'line-through',
		syntax: ['~~', '~~'],
	},
	{ id: 'spoiler', label: '||', syntax: ['||', '||'] },
	{ id: 'code', label: '`', syntax: ['`', '`'] },
	{ id: 'codeblock', label: '{ }', syntax: ['```\n', '\n```'] },
	{ id: 'quote', label: '>', syntax: ['> ', ''] },
	{ id: 'heading', label: '#', fontWeight: '700', syntax: ['# ', ''] },
	{ id: 'list', label: '-', syntax: ['- ', ''] },
]
