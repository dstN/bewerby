import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// Application rows are written in exactly one place,
		// src/lib/data/applications.ts (#51): the sync layer has to see every
		// change, and the status-history rule must not depend on each caller
		// remembering it. Reads stay free.
		files: ['src/**/*.ts', 'src/**/*.svelte'],
		ignores: ['src/lib/data/**', 'src/lib/db/**', 'src/**/*.test.ts'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector:
						"CallExpression[callee.object.object.name='db'][callee.object.property.name='applications'][callee.property.name=/^(add|bulkAdd|put|bulkPut|update|bulkUpdate|delete|bulkDelete|clear)$/]",
					message:
						'Write application rows through src/lib/data/applications.ts - the sync layer has to see every change (#51).'
				},
				{
					selector: "CallExpression[callee.object.name='db'][callee.property.name='transaction']",
					message: 'Transactions on application rows belong in src/lib/data/applications.ts (#51).'
				}
			]
		}
	}
);
