import { test, expect } from '@playwright/test';

test.describe('Kanban board CRUD', () => {
	test.beforeEach(({ page }) => {
		// Every confirm() (delete, discard-unsaved-changes) is accepted by
		// default; individual tests override this where they need to decline.
		page.on('dialog', (dialog) => dialog.accept());
	});

	test('creates, edits, moves via the status select, and deletes an application', async ({
		page
	}) => {
		await page.goto('/');

		await page.getByRole('button', { name: 'Bewerbung hinzufügen' }).click();
		const dialog = page.locator('dialog.modal-content');
		await expect(dialog).toBeVisible();

		await dialog.locator('#title').fill('Frontend Entwickler');
		await dialog.locator('#company').fill('Contoso GmbH');
		await dialog.getByRole('button', { name: 'Speichern' }).click();
		await expect(dialog).toBeHidden();

		const draftColumn = page.locator('.kanban-column', {
			has: page.locator('.column-title', { hasText: 'In Arbeit' })
		});
		const card = draftColumn.locator('.card', { hasText: 'Contoso GmbH' });
		await expect(card).toBeVisible();
		await expect(card.locator('.card-title')).toHaveText('Frontend Entwickler');

		// Edit: reopen and change the title.
		await card.locator('.card-open-btn').click();
		await expect(dialog).toBeVisible();
		await dialog.locator('#title').fill('Senior Frontend Entwickler');
		await dialog.getByRole('button', { name: 'Speichern' }).click();
		await expect(dialog).toBeHidden();
		await expect(card.locator('.card-title')).toHaveText('Senior Frontend Entwickler');

		// Move: the per-card status <select> is the keyboard/touch-friendly
		// alternative to native HTML5 drag-and-drop (see issue #9).
		await card.locator('.card-status-select').selectOption('interview');
		const interviewColumn = page.locator('.kanban-column', {
			has: page.locator('.column-title', { hasText: 'Vorstellung' })
		});
		await expect(interviewColumn.locator('.card', { hasText: 'Contoso GmbH' })).toBeVisible();
		await expect(draftColumn.locator('.card', { hasText: 'Contoso GmbH' })).toHaveCount(0);

		// Delete (confirm() auto-accepted by the beforeEach dialog handler).
		await interviewColumn
			.locator('.card', { hasText: 'Contoso GmbH' })
			.locator('.btn-card-delete')
			.click();
		await expect(page.locator('.card', { hasText: 'Contoso GmbH' })).toHaveCount(0);
	});

	test('cancels application creation without saving anything', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Bewerbung hinzufügen' }).click();
		const dialog = page.locator('dialog.modal-content');
		await dialog.locator('#title').fill('Wird verworfen');
		await dialog.locator('button.btn-flat', { hasText: 'Abbrechen' }).click();
		await expect(dialog).toBeHidden();
		await expect(page.locator('.card', { hasText: 'Wird verworfen' })).toHaveCount(0);
	});

	test('the manifest "New application" shortcut (?new=1) opens the add dialog and cleans the URL', async ({
		page
	}) => {
		await page.goto('/?new=1');
		const dialog = page.locator('dialog.modal-content');
		await expect(dialog).toBeVisible();
		await expect(page).toHaveURL(/\/(\?.*)?$/);
		await expect(page).not.toHaveURL(/new=1/);
	});
});
