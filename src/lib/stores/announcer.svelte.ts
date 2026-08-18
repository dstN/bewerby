// A single app-wide live region (rendered once in +layout.svelte) that any
// component can push a message into, so status changes are announced to
// screen readers regardless of which mausfreie path triggered them (modal
// status field, card action menu, or drag-and-drop).
let message = $state('');

export const announcer = {
	get message() {
		return message;
	},
	announce(text: string) {
		// Reset first so two identical messages in a row both still get
		// announced (aria-live only fires on an actual text change).
		message = '';
		queueMicrotask(() => {
			message = text;
		});
	}
};
