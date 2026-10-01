import { browser } from '$app/env';
import {
	PROFILE_STORAGE_KEY,
	emptyProfile,
	parseProfile,
	type Profile
} from '#lib/utils/profile.js';

export { PROFILE_STORAGE_KEY, type Profile } from '#lib/utils/profile.js';

function createProfileStore() {
	let profile = $state<Profile>(emptyProfile());

	function persist() {
		if (!browser) return;
		try {
			localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify($state.snapshot(profile)));
		} catch (err) {
			console.error('Failed to persist profile', err);
		}
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
