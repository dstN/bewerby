import { browser } from '$app/environment';
import {
	PROFILE_STORAGE_KEY,
	emptyProfile,
	parseProfile,
	type Profile
} from '$lib/utils/profile.js';
import { activeSync, registerProfilePort } from '$lib/crdt/session.js';

export { PROFILE_STORAGE_KEY, type Profile } from '$lib/utils/profile.js';

function createProfileStore() {
	let profile = $state<Profile>(emptyProfile());

	function writeLocal() {
		if (!browser) return;
		try {
			localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify($state.snapshot(profile)));
		} catch (err) {
			console.error('Failed to persist profile', err);
		}
	}

	/** A local change: stored here, and handed to the sync layer if this device syncs. */
	function persist() {
		writeLocal();
		if (!browser) return;
		const snapshot = $state.snapshot(profile);
		activeSync()
			.then((sync) => sync?.setProfile(snapshot))
			.catch((err) => console.error('Syncing the profile failed:', err));
	}

	/**
	 * Must run before cleanupOrphanedPdfs() on boot - the sweep deletes every
	 * OPFS file it is not told about, and the stored CV is only reachable
	 * through this store.
	 */
	function init() {
		if (!browser) return;
		try {
			profile = parseProfile(localStorage.getItem(PROFILE_STORAGE_KEY));
		} catch (err) {
			console.error('Failed to load profile', err);
		}
		// Only now, with the real profile loaded: registered earlier, an empty
		// profile could have been taken for this device's and synced out.
		void registerProfilePort({
			get: () => $state.snapshot(profile),
			set: (next) => {
				// From the synced document: stored, but not handed back to it.
				profile = { ...next };
				writeLocal();
			}
		});
	}

	function update(patch: Partial<Profile>) {
		profile = { ...profile, ...patch };
		persist();
	}

	function setCv(ref: string, name: string) {
		update({ cvRef: ref, cvName: name });
	}

	function clearCv() {
		profile = { ...profile, cvRef: undefined, cvName: undefined };
		persist();
	}

	function replaceAll(next: Profile) {
		profile = { ...next };
		persist();
	}

	return {
		get value(): Profile {
			return profile;
		},
		get cvRef(): string | undefined {
			return profile.cvRef;
		},
		get cvName(): string | undefined {
			return profile.cvName;
		},
		init,
		update,
		setCv,
		clearCv,
		replaceAll
	};
}

export const profileStore = createProfileStore();
