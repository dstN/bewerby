export type Locale = 'de' | 'en';

/**
 * Recursively maps an object to string leaf values for type-safe translation keys.
 * Supports nested keys like t('kanban.columns.draft').
 */
export type TranslationKeys = {
	app: {
		name: string;
		description: string;
	};
	nav: {
		dashboard: string;
		kanban: string;
		analytics: string;
		backup: string;
		settings: string;
		impressum: string;
		datenschutz: string;
	};
	kanban: {
		columns: {
			draft: string;
			sent: string;
			interview: string;
			accepted: string;
			rejected: string;
		};
		actions: {
			add: string;
			edit: string;
			delete: string;
			move: string;
		};
		confirmDelete: string;
		dueAlerts: string;
		requiresFollowUp: string;
		statusChangedAnnouncement: string;
		deletedAnnouncement: string;
		savedAnnouncement: string;
		changeStatus: string;
		subtitle: string;
		searchPlaceholder: string;
		allTags: string;
		allPriorities: string;
		allColors: string;
		coloredOnly: string;
		uncoloredOnly: string;
		sortBy: string;
		sortDefault: string;
		sortColor: string;
		sortPriority: string;
		sortDate: string;
	};
	application: {
		title: string;
		company: string;
		url: string;
		salary: string;
		contact: string;
		notes: string;
		priority: string;
		status: string;
		tags: string;
		cardColor: string;
		colorNone: string;
		addCustomColor: string;
		appliedAt: string;
		createdAt: string;
		confirmDiscard: string;
		updatedAt: string;
		reminder: string;
		placeholderTitle: string;
		placeholderCompany: string;
		placeholderUrl: string;
		placeholderSalary: string;
		placeholderNotes: string;
		placeholderTags: string;
		contactName: string;
		contactEmail: string;
		contactPhone: string;
		placeholderContactName: string;
		placeholderContactEmail: string;
		placeholderContactPhone: string;
		priorities: {
			low: string;
			medium: string;
			high: string;
		};
		pdf: {
			uploadText: string;
			scanning: string;
			view: string;
			viewError: string;
		};
	};
	datepicker: {
		today: string;
		yesterday: string;
		daysAgo3: string;
		weekAgo1: string;
		weeksAgo2: string;
		selectDate: string;
		prevMonth: string;
		nextMonth: string;
	};
	reminders: {
		none: string;
		hours24: string;
		hours48: string;
		days7: string;
		days14: string;
	};
	actions: {
		save: string;
		cancel: string;
		confirm: string;
		export: string;
		import: string;
		upload: string;
		search: string;
		addTag: string;
	};
	theme: {
		light: string;
		dark: string;
		toggle: string;
	};
	backup: {
		title: string;
		subtitle: string;
		exportJson: string;
		importJson: string;
		localDump: string;
		cloudSync: string;
		cloudSyncDisabled: string;
		manualTitle: string;
		manualDesc: string;
		importModeLabel: string;
		importModeMerge: string;
		importModeReplace: string;
		confirmReplace: string;
		localTitle: string;
		localDesc: string;
		localButton: string;
		cloudTitle: string;
		cloudDesc: string;
		inactive: string;
		active: string;
		successImport: string;
		errorFormat: string;
		errorValidation: string;
		errorRead: string;
		successLocal: string;
		errorDirectSave: string;
		errorSaveFail: string;
	};
	analytics: {
		title: string;
		subtitle: string;
		statusOverview: string;
		funnelTitle: string;
		funnelDesc: string;
		selectionRate: string;
		successRate: string;
		totalConversion: string;
		responseTitle: string;
		responseDesc: string;
		noDataAlert: string;
		bestTime: string;
		avgTime: string;
		worstTime: string;
		days: string;
		basedOn: string;
		stepSelection: string;
	};
	settings: {
		title: string;
		subtitle: string;
		remindersTitle: string;
		remindersDesc: string;
		statusLabel: string;
		statusActive: string;
		statusInactive: string;
		btnAllow: string;
		storageTitle: string;
		storageDesc: string;
		storagePersistedLabel: string;
		storagePersisted: string;
		storageNotPersisted: string;
		btnRequestPersist: string;
		storageUsageLabel: string;
		eraseTitle: string;
		eraseDesc: string;
		eraseExportHint: string;
		eraseButton: string;
		eraseInProgress: string;
		eraseConfirm: string;
		eraseFailed: string;
		privacyTitle: string;
		privacyItem1Title: string;
		privacyItem1Desc: string;
		privacyItem2Title: string;
		privacyItem2Desc: string;
		privacyItem3Title: string;
		privacyItem3Desc: string;
		privacyPolicyLink: string;
	};
	legal: {
		placeholderBanner: string;
		impressum: {
			title: string;
			infoTitle: string;
			namePlaceholder: string;
			addressPlaceholder: string;
			contactTitle: string;
			contactPlaceholder: string;
			responsibleTitle: string;
			responsiblePlaceholder: string;
		};
		datenschutz: {
			title: string;
			intro: string;
			controllerTitle: string;
			controllerPlaceholder: string;
			principleTitle: string;
			principleBody: string;
			storageTitle: string;
			storageIndexedDbTitle: string;
			storageIndexedDbDesc: string;
			storageOpfsTitle: string;
			storageOpfsDesc: string;
			storageLocalTitle: string;
			storageLocalDesc: string;
			storageTableKeyHeader: string;
			storageTablePurposeHeader: string;
			storageKeyThemeDesc: string;
			storageKeyLocaleDesc: string;
			storageKeyColorsDesc: string;
			storageKeyNotifiedDesc: string;
			noTrackingTitle: string;
			noTrackingBody: string;
			hostingTitle: string;
			hostingBody: string;
			hostingPlaceholder: string;
			rightsTitle: string;
			rightsBody: string;
			contactRightsTitle: string;
			contactRightsPlaceholder: string;
			changesTitle: string;
			changesBody: string;
		};
	};
	empty: {
		kanban: string;
		analytics: string;
	};
	a11y: {
		skipToContent: string;
		openMenu: string;
		closeMenu: string;
		toggleTheme: string;
		switchLanguage: string;
	};
	errorPage: {
		title: string;
		message: string;
		reload: string;
		home: string;
	};
	errors: {
		dbUnavailable: string;
		saveFailed: string;
		deleteFailed: string;
		moveFailed: string;
	};
};
