# bewerby — Roadmap zu v1

Diese Roadmap führt `bewerby` von der aktuellen Vorabversion (`0.0.1`) auf einen production-ready **v1.0.0**-Release.

Grundlage ist eine vollständige Codeanalyse aller 22 Quelldateien plus ein automatisiertes Audit über sechs Dimensionen (Svelte-5-/Tailwind-Idiomatik, Offline-Architektur, Sicherheit & DSGVO, Barrierefreiheit & Design, Performance, Logikkorrektheit). Ergebnis: **91 Befunde — 12 Blocker, 34 High, 34 Medium, 11 Low.**

**Deployment-Kontext:** öffentlich erreichbare Instanz auf Netcup-Webhosting via Phusion Passenger + `@sveltejs/adapter-node`. Daraus folgt: Impressum und Datenschutzerklärung sind rechtlich zwingend und damit v1-Blocker.

## Grundsätze

- **Reihenfolge ist Abhängigkeitsreihenfolge**, nicht nur Prioritätsreihenfolge. Innerhalb eines Milestones von oben nach unten abarbeiten.
- **Datenintegrität vor Optik.** Kein Polish, solange Datenverlust- oder Leck-Pfade offen sind.
- **Jede Aufgabe hat einen Ist- und einen Soll-Zustand.** Ist-Zustände sind mit `Datei:Zeile` belegt.
- **Keine stillen Kürzungen.** Was beim Umsetzen als hinfällig auffällt, wird am Issue begründet geschlossen, nicht unauffällig übergangen.

## Status quo — was tragfähig ist

Nicht alles muss angefasst werden. Folgendes ist geprüft und in Ordnung:

- **Svelte-5-Runes-Disziplin:** keine Svelte-4-Residuen (kein `export let`, `on:*`, `$:`, `createEventDispatcher`, `<slot>`, `svelte/store`). `$derived.by` wird für alle echten Berechnungen korrekt eingesetzt, Callback-Props und `$bindable` sind idiomatisch. Runes-Modus ist in `vite.config.ts:12` erzwungen.
- **SvelteKit-Konfiguration** liegt korrekt inline im `sveltekit()`-Plugin; ein `svelte.config.js` ist nicht nötig.
- **Datenlokalität hält:** genau **ein** `fetch()` im gesamten Code (`src/service-worker.ts:54`, same-origin). Kein `XMLHttpRequest`, kein `sendBeacon`, kein Remote-Script, kein `@import url()`, keine Analytics, kein `{@html}`, kein `eval`. Alle fünf Lexend-`@font-face` verweisen lokal. pdf.js 6 hat `cMapUrl`, `standardFontDataUrl` und `wasmUrl` per Default auf `null` — ein CDN-Call ist strukturell ausgeschlossen; `isEvalSupported` existiert in v6 nicht mehr, eine CSP ohne `unsafe-eval` funktioniert also.
- **i18n ist konsistent:** `de.json` und `en.json` haben je 148 Keys, null Drift, und kein `t()`-Aufruf zeigt auf einen fehlenden Key. `document.documentElement.lang` wird beim Sprachwechsel korrekt mitgesetzt.
- **Design-Tokens** in `src/app.css` sind sauber strukturiert (Surface-Layer, getönte Schatten statt reinem Schwarz, `color-scheme`). `--text-secondary` erreicht 7,6:1 (Light) und 7,5:1 (Dark).
- Keine Sourcemaps im Client-Build. Jede Seite hat genau ein `<h1>`. Die Sidebar nutzt echtes `<nav>` + `<ul>` mit korrektem `aria-current="page"`. Dekorative SVGs sind durchgehend `aria-hidden`.

---

## Milestone 1 — Architecture Blockers & Core Fixes

**Ziel:** Datenverlust, Datenleck und Nicht-Benutzbarkeit beseitigen. Ohne diese 15 Aufgaben ist kein v1 möglich.

| #   | Aufgabe                                                            | Labels                                      | Issue                                            |
| :-- | :----------------------------------------------------------------- | :------------------------------------------ | :----------------------------------------------- |
| 1   | ✅ Persönliche Bewerbungs-PDFs aus dem Auslieferungspfad entfernen | `security` `dsgvo` `v1-blocker`             | [#1](https://github.com/dstN/bewerby/issues/1)   |
| 2   | ✅ Build-Gate reparieren und toten pdf.js-Ballast entfernen        | `bug` `dx` `v1-blocker`                     | [#2](https://github.com/dstN/bewerby/issues/2)   |
| 3   | ✅ Service-Worker-Installation reparieren                          | `bug` `offline` `v1-blocker`                | [#3](https://github.com/dstN/bewerby/issues/3)   |
| 4   | ✅ Statische App-Shell prerendern und Fehlergrenze einziehen       | `architecture` `offline` `v1-blocker`       | [#4](https://github.com/dstN/bewerby/issues/4)   |
| 5   | ✅ PDFs nach OPFS auslagern (Dexie-Schema v2)                      | `architecture` `refactoring` `v1-blocker`   | [#5](https://github.com/dstN/bewerby/issues/5)   |
| 6   | ✅ Backup-Roundtrip: PDFs müssen Export und Import überleben       | `bug` `v1-blocker`                          | [#6](https://github.com/dstN/bewerby/issues/6)   |
| 7   | ✅ Import darf den Datenbestand nicht mehr zerstören               | `bug` `v1-blocker`                          | [#7](https://github.com/dstN/bewerby/issues/7)   |
| 8   | ✅ Datenhaltbarkeit absichern (Persistenz, Quota, Schreibfehler)   | `architecture` `v1-blocker`                 | [#8](https://github.com/dstN/bewerby/issues/8)   |
| 9   | ✅ Status per Tastatur und Touch änderbar machen                   | `a11y` `enhancement` `v1-blocker`           | [#9](https://github.com/dstN/bewerby/issues/9)   |
| 10  | ✅ Mobile Navigation und Board-Reflow                              | `a11y` `enhancement` `v1-blocker`           | [#10](https://github.com/dstN/bewerby/issues/10) |
| 11  | ✅ Reminder-Engine neu bauen                                       | `bug` `performance` `v1-blocker`            | [#11](https://github.com/dstN/bewerby/issues/11) |
| 12  | ✅ Security-Header und Content-Security-Policy                     | `security` `v1-blocker`                     | [#12](https://github.com/dstN/bewerby/issues/12) |
| 13  | ✅ Impressum und Datenschutzerklärung                              | `dsgvo` `documentation` `v1-blocker`        | [#13](https://github.com/dstN/bewerby/issues/13) |
| 14  | ✅ Recht auf Löschung umsetzen                                     | `dsgvo` `enhancement` `v1-blocker`          | [#14](https://github.com/dstN/bewerby/issues/14) |
| 15  | ✅ Deployment verifizieren und dokumentieren                       | `architecture` `documentation` `v1-blocker` | [#15](https://github.com/dstN/bewerby/issues/15) |

### 1 — Persönliche Bewerbungs-PDFs aus dem Auslieferungspfad entfernen

**Status:** ✅ Erledigt in [d9734b9](https://github.com/dstN/bewerby/commit/d9734b9) (#1, geschlossen). Abweichung vom ursprünglichen Soll: die PDFs wurden ersatzlos gelöscht statt nach `tests/fixtures/` verschoben — das Repo ist öffentlich, Verschieben hätte das Leck nur in die Git-Historie verlagert. Synthetische Fixtures folgen unter #29. Details im [Issue-Kommentar](https://github.com/dstN/bewerby/issues/1#issuecomment-5320783468).

**Ist:** `static/data/` enthält neun echte persönliche Anschreiben (`Bewerbung-Conlabz.pdf`, `Bewerbung-Zollsoft.pdf`, `Bewerbung-Blueways.pdf` u. a.). Sie sind über `static/.gitignore` aus Git ausgeschlossen — aber Vite kopiert `static/` vollständig nach `build/client/` (verifiziert: `build/client/data/` enthält alle neun Dateien), und der generierte Service Worker schreibt sie fest in die Precache-Liste (verifiziert: `/data/Bewerbung-Conlabz.pdf` steht in `build/client/service-worker.js`). Beim Deploy sind sie unter ratbaren öffentlichen URLs erreichbar, werden jedem Besucher zwangsweise heruntergeladen, und `static/robots.txt` lädt Crawler ausdrücklich ein.

**Soll:** Keine personenbezogene Fremddatei liegt je im Auslieferungspfad. Testfixtures leben außerhalb von `static/` (z. B. `tests/fixtures/`, aus dem Build ausgeschlossen). Ein Build-Guard bricht ab, sobald `static/` eine nicht explizit freigegebene Datei enthält — damit kann derselbe Fehler nicht wiederkehren.

### 2 — Build-Gate reparieren und toten pdf.js-Ballast entfernen

**Status:** ✅ Erledigt in [515e0d0](https://github.com/dstN/bewerby/commit/515e0d0) (#2, geschlossen). 45 statt 44 reale ESLint-Fehler (die Schätzung war knapp daneben), alle einzeln behoben statt unterdrückt — Details im [Issue-Kommentar](https://github.com/dstN/bewerby/issues/2#issuecomment-5320977221). Live-Browser-Smoketest war nicht möglich (Dev-Server nicht erreichbar, `chromium-cli` fehlt); Verifikation stützt sich auf Build/Typecheck/Lint.

**Ist:** `npm run lint` stürzt ab. Prettier bricht auf 24 Dateien ab, weil `prettier.config.js:8` `tailwindStylesheet` auf das nicht existierende `./src/routes/layout.css` zeigt. ESLint meldet 2553 Fehler, davon 2509 aus `static/pdf.min.mjs` (442 KB) und `static/pdf.worker.min.mjs` (1,23 MB) — zwei minifizierte pdf.js-Kopien, die von nichts referenziert werden (die genutzten Bundles kommen über `pdfjs-dist` aus `node_modules`), aber ausgeliefert, gelintet und precacht werden. Es bleiben 44 echte Fehler in `src/`.

**Soll:** `npm run lint` läuft durch und meldet null Fehler. `tailwindStylesheet` zeigt auf `src/app.css`. Die 1,71 MB toter pdf.js-Kopien sind gelöscht. ESLint ignoriert vendorierte Minifikate strukturell.

### 3 — Service-Worker-Installation reparieren

**Status:** ✅ Erledigt in [07663ad](https://github.com/dstN/bewerby/commit/07663ad) (#3, geschlossen). Bekannte Grenze bis #4: es gibt noch kein vorgerendertes HTML für den allerersten Offline-Besuch einer Route. Details im [Issue-Kommentar](https://github.com/dstN/bewerby/issues/3#issuecomment-5321015589).

**Ist:** `ASSETS = [...build, ...files]` (`src/service-worker.ts:13`) zieht alles aus `static/` ein — **inklusive `static/.gitignore`**. Verifiziert: `/.gitignore` steht in der Precache-Liste des gebauten Service Workers. `adapter-node` serviert über `sirv` ohne Dotfiles, liefert also 404 → `cache.addAll()` rejected (`src/service-worker.ts:20`) → `install` schlägt fehl → der Service Worker aktiviert nie. Die gesamte Offline-First-Prämisse ist durch eine 6-Byte-Datei still ausgehebelt. Zusätzlich fehlt jedes `.catch()` in der Fetch-Kette (`src/service-worker.ts:50-65`), es gibt keinen Navigation-Fallback, und Cache-First auf Dokumente würde Nutzer auf veraltetem HTML festnageln.

**Soll:** Der Service Worker installiert und aktiviert zuverlässig. Precache filtert Dotfiles und ist fehlertolerant (einzelne `cache.add`-Aufrufe statt eines atomaren `addAll`, damit ein fehlendes Asset nicht die ganze Installation kippt). Der Fetch-Handler hat einen Fehlerpfad mit Offline-Fallback. Dokumente werden network-first bzw. stale-while-revalidate behandelt, statische Assets cache-first.

### 4 — Statische App-Shell prerendern und Fehlergrenze einziehen

**Status:** ✅ Erledigt in [1a7684e](https://github.com/dstN/bewerby/commit/1a7684e) (#4, geschlossen). Über die Roadmap-Formulierung hinaus zwei getrennte Fehlergrenzen eingebaut, da `+error.svelte` allein Render-Fehler in bereits gemounteten Routen nicht abfängt (siehe #7). Details im [Issue-Kommentar](https://github.com/dstN/bewerby/issues/4#issuecomment-5321130819).

**Nachtrag aus #30:** Die in #3 vermerkte Grenze war nach diesem Commit noch nicht vollständig geschlossen. Prerendern legt die HTML-Dokumente nur auf die Platte (`build/prerendered/*.html`) — ob der Service Worker sie tatsächlich precacht, ist ein getrennter Mechanismus (`ASSETS` in `service-worker.ts`), der die Routen explizit auflisten muss. Das fehlte, was der neue Playwright-Offline-Test in #30 direkt aufdeckte: Da SvelteKits Client-Router bei normaler In-App-Navigation nie eine echte Seitennavigation auslöst, wurde ein Routendokument nur gecacht, wenn irgendwann zuvor online eine _harte_ Navigation genau dorthin stattfand — im echten Nutzungsfluss (Klicks in der Sidebar) praktisch nie der Fall. Fix und Details unter #30.

**Ist:** Es existiert kein einziges `+layout.ts`/`+page.ts`. SSR ist also aktiv und nichts wird prerendert, obwohl alle Daten aus Dexie (browser-only) kommen — jeder Cold Load ist ein Node/Passenger-Roundtrip für eine Seite, die serverseitig null Daten rendert. Weil kein HTML-Dokument prerendert wird, liegt auch keins im Precache, was Aufgabe 3 offline unlösbar macht. Zudem gibt es **kein `+error.svelte`** im ganzen Projekt.

**Soll:** `src/routes/+layout.ts` setzt `ssr = false` und `prerender = true`. Die App-Shell wird als statisches HTML gebaut, ist damit precachebar und offline aufrufbar. Ein `+error.svelte` fängt Laufzeitfehler ab und bietet einen Ausweg (Reset/Reload), statt die App unbenutzbar zu hinterlassen.

### 5 — PDFs nach OPFS auslagern (Dexie-Schema v2)

**Status:** ✅ Erledigt (siehe [#5](https://github.com/dstN/bewerby/issues/5) für den schließenden Commit und Details). Dexie-Schema v2 mit `upgrade()`-Migration (`pdfBlob` → `pdfRef` + OPFS-Datei via `Dexie.waitFor`), `src/lib/utils/opfs.ts` als Zugriffsschicht, Orphan-Cleanup beim App-Start, Löschen der OPFS-Datei beim Löschen einer Bewerbung, und ein neuer „PDF anzeigen"-Button im Bearbeitungsdialog. Mit einem echten Browser (Playwright + System-Edge, temporär installiert) end-to-end verifiziert: eine v1-Zeile mit echtem `pdfBlob` migriert korrekt zu `pdfRef`, die OPFS-Datei enthält exakt den ursprünglichen Byte-Inhalt, das Board rendert die migrierte Karte ohne Fehler, und „Anzeigen" öffnet den korrekten Inhalt. Offene Anschlussstelle: Backup-Export enthält jetzt einen `pdfRef`-String statt eines kollabierenden Blobs — das eigentliche Wiederherstellen der Datei beim Import ist Aufgabe von #6.

**Ist:** `pdfBlob?: Blob` liegt in derselben IndexedDB-Row wie die Board-Hot-Data (`src/lib/db/index.ts:29`). Jeder Board-Read, jede Analytics-Berechnung und jeder Reminder-Tick lädt `db.applications.toArray()` und deserialisiert damit sämtliche PDF-Blobs. Das Schema kennt nur `version(1)` — es gibt keinen Upgrade-Pfad für bestehende Nutzerdaten. OPFS wird nirgends verwendet, obwohl es die Projektvorgabe ist.

**Soll:** Dexie-Schema v2 mit `upgrade()`-Migration bestehender Daten. Die Anwendungs-Row hält nur noch eine Referenz (`pdfRef`), die Datei selbst liegt im Origin Private File System. Board und Analytics lesen ausschließlich schlanke Rows. Orphan-Cleanup entfernt OPFS-Dateien ohne zugehörigen Datensatz.

### 6 — Backup-Roundtrip: PDFs müssen Export und Import überleben

**Status:** ✅ Erledigt (siehe [#6](https://github.com/dstN/bewerby/issues/6) für den schließenden Commit und Details). Backup-Format v2 mit Base64-kodierten PDFs neben den Applications; Import schreibt sie unter frischen OPFS-Refs zurück und mappt `pdfRef` entsprechend um. Mit Playwright end-to-end verifiziert: Bewerbung mit echtem PDF anlegen → exportieren → Daten vollständig löschen → importieren → Karte samt PDF (byteidentisch) wieder da. Bewusst nicht angefasst: die `clear()`-vor-Validierung-Reihenfolge und die fehlende Zusammenführen/Ersetzen-Wahl bleiben für #7.

**Ist:** `src/routes/backup/+page.svelte:19` serialisiert per `JSON.stringify` über Rows mit `pdfBlob: Blob`. Ein Blob serialisiert zu `{}` — der Export verliert also **jedes** angehängte PDF, und der Re-Import schreibt das leere Objekt als `pdfBlob` zurück. Derselbe Fehler steckt im Tier-2-Ordner-Dump (`:95`). Der einzige Disaster-Recovery-Pfad einer rein lokalen App zerstört damit Daten.

**Soll:** Ein Export enthält alle PDFs verlustfrei (Container-Format mit ausgelagerten Binärdaten oder Base64-kodiert), ist versioniert und lässt sich vollständig zurückspielen. Ein Roundtrip aus Bewerbung mit PDF → Export → Löschen → Import liefert das PDF öffenbar zurück.

### 7 — Import darf den Datenbestand nicht mehr zerstören

**Status:** ✅ Erledigt (siehe [#7](https://github.com/dstN/bewerby/issues/7) für den schließenden Commit und Details). Vollständiger Struktur-Validator (`isValidApplication` in `src/lib/db/index.ts`) statt nur title/company, echte `db.transaction('rw', ...)` um clear()+bulkAdd(), Zusammenführen/Ersetzen-Wahl mit Bestätigungsdialog bei Ersetzen, importierte Zeilen bekommen immer frische IDs. Mit Playwright end-to-end verifiziert: ein Datensatz ohne `tags` wird abgelehnt und der Bestand bleibt unverändert; Zusammenführen behält bestehende Bewerbungen und ergänzt neue; Ersetzen fragt nach und leert den Bestand danach vollständig.

**Ist:** `src/routes/backup/+page.svelte:64-66` ruft `db.applications.clear()` und danach `bulkAdd()` — ohne Transaktion und ohne Rückfrage. Die Validierung prüft nur `typeof app.title === 'string' && typeof app.company === 'string'` (`:56`). Ein Datensatz ohne `tags` crasht das Board dauerhaft (`src/routes/+page.svelte:37`), einer ohne `history` die Analytics (`src/routes/analytics/+page.svelte:31`). In Kombination mit dem fehlenden `+error.svelte` brickt eine einzige fehlerhafte Importdatei die App ohne Ausweg.

**Soll:** Vollständige Schema-Validierung **vor** jedem Schreibzugriff. Der gesamte Import läuft in einer `db.transaction`, sodass ein Fehler zurückrollt statt zu zerstören. Der Nutzer wählt bewusst zwischen Zusammenführen und Ersetzen und bestätigt destruktive Varianten. Eine manipulierte Datei (fehlendes `tags`, fehlendes `history`, unbekannte `version`) führt zu einer klaren Meldung bei unverändertem Datenbestand.

### 8 — Datenhaltbarkeit absichern (Persistenz, Quota, Schreibfehler)

**Status:** ✅ Erledigt (siehe [#8](https://github.com/dstN/bewerby/issues/8) für den schließenden Commit und Details). `src/lib/utils/storage.ts` mit `requestPersistentStorage`/`isStoragePersisted`/`getStorageEstimate`; Persistenz wird beim App-Start angefragt, Status + Speicherverbrauch sind in den Einstellungen sichtbar mit manuellem Anfrage-Button. `db.open()`-Fehler zeigen ein sichtbares Banner statt eine still leere App. Löschen, Verschieben (Drag) und Speichern haben jetzt alle einen `catch`-Pfad mit `alert()`-Feedback; ein fehlgeschlagenes Speichern lässt den Dialog mit den Eingaben des Nutzers offen statt sie zu verwerfen. Nicht mit Playwright verifiziert (mechanische, additive Änderungen ohne Happy-Path-Auswirkung) — nur Build/Typecheck/Lint.

**Ist:** `navigator.storage.persist()` wird nie aufgerufen — der Browser darf die **einzige** Kopie der Nutzerdaten jederzeit evictieren. `db.open()` hat keinen Fehlerpfad (Private Browsing, blockiertes Upgrade, überschrittene Quota). Kein einziger Schreibzugriff hat eine Fehlerbehandlung: `src/lib/components/kanban/ApplicationModal.svelte:158`, `src/routes/+page.svelte:150` und `:115` laufen jeweils ohne `catch`, ein Quota-Fehler sieht für den Nutzer wie eine eingefrorene App aus.

**Soll:** Persistente Speicherung wird angefragt und ihr Status ist in den Einstellungen sichtbar. `db.open()`-Fehler führen zu einer verständlichen Meldung statt zu einer stummen leeren App. Jeder Schreibzugriff hat einen Fehlerpfad mit sichtbarem Feedback. Bei knapper Quota wird gewarnt, bevor Daten verloren gehen.

### 9 — Status per Tastatur und Touch änderbar machen

**Status:** ✅ Erledigt (siehe [#9](https://github.com/dstN/bewerby/issues/9) für den schließenden Commit und Details). Echtes Status-Feld im Bearbeitungsdialog (native `<select>`, funktioniert auf Tastatur und Touch), zusätzlich ein kompakter Status-`<select>` direkt auf jeder Karte im Footer als „Aktionsmenü" — beide teilen sich dieselbe `moveApp()`-Logik wie Drag-and-Drop, das als Bequemlichkeit erhalten bleibt. Neuer app-weiter Live-Region-Store (`$lib/stores/announcer.svelte.ts`) sagt jede Statusänderung an, unabhängig vom Auslöser. Mit Playwright end-to-end verifiziert: Modal-Statusänderung, Karten-Select-Änderung (ohne Modal zu öffnen), Tastaturbedienbarkeit, und korrekte Live-Region-Ansagen für beide Pfade.

**Ist:** Der Status einer Bewerbung lässt sich **ausschließlich** per HTML5-`DragEvent` ändern (`src/routes/+page.svelte:123-165`). Verifiziert: es gibt keine `pointerdown`/`touchstart`-Behandlung, und HTML5-Drag-and-Drop feuert auf Touch-Geräten nicht. Verifiziert zudem: `ApplicationModal` hat **überhaupt kein Status-Feld** — `currentStatus` wird aus `application.status` abgeleitet (`:129`) und ist nie editierbar. Der Kern-Workflow der App ist damit auf ihrem primären Zielgerät nicht ausführbar und für Tastaturnutzer ein WCAG-2.1.1- und 2.5.7-Verstoß.

**Soll:** Der Status ist auf mindestens zwei mausfreien Wegen änderbar: als Feld im Bearbeitungsdialog und über ein Aktionsmenü auf der Karte. Jede Statusänderung wird per Live-Region angesagt. Drag-and-Drop bleibt als zusätzliche Bequemlichkeit erhalten, ist aber nie der einzige Weg.

### 10 — Mobile Navigation und Board-Reflow

**Status:** ✅ Erledigt (siehe [#10](https://github.com/dstN/bewerby/issues/10) für den schließenden Commit und Details). Sidebar wird unter 768px zum Off-Canvas-Drawer (Overlay + Backdrop + Escape-Schließen), vom bestehenden Hamburger-Button gesteuert, mit korrektem `aria-expanded`/`aria-controls` und `inert` auf dem geschlossenen Drawer. Board reflowt unter 768px auf eine einspaltige, vertikal gestapelte Ansicht ohne horizontales Overflow. Ein echter Bug unterwegs gefunden und behoben: die Kopplung von Desktop-„collapsed" und Mobile-„drawer offen" an denselben Button hätte in beide Richtungen falsche Zustände erzeugt (Labels fehlten im mobilen Drawer bzw. blieben fälschlich auf Desktop sichtbar) — gelöst, indem der Button je nach Viewport nur genau ein Konzept steuert. Mit Playwright bei echten 390×844- und 1280×800-Viewports verifiziert (21 Einzelprüfungen): Erreichbarkeit aller 4 Routen, Escape/Backdrop/Navigation schließen den Drawer, Labels korrekt sichtbar, Desktop-Verhalten unverändert.

**Ist:** `src/lib/components/layout/Sidebar.svelte:212` setzt die Sidebar unter 768px auf `display: none`, ohne Ersatz. Der Hamburger-Button in `src/routes/+layout.svelte:37` schaltet nur zwischen 260px- und 72px-Grid-Spalten, die unter 768px beide auf `1fr` überschrieben sind (`:184-192`) — er tut also sichtbar nichts. Ergebnis: `/analytics`, `/backup` und `/settings` sind auf dem Telefon nicht erreichbar. Zusätzlich behält das Board unter 1024px eine harte Mindestbreite von 1264px (`src/routes/+page.svelte:794-798`: `repeat(5, 240px)`), und der 768px-Block fasst diese Regel nicht an.

**Soll:** Unter 768px existiert eine erreichbare Navigation (Drawer oder Bottom-Nav), an die der Hamburger-Button tatsächlich gekoppelt ist, mit korrektem `aria-expanded`/`aria-controls`. Alle vier Routen sind auf einem 390px-Viewport erreichbar. Das Board reflowt auf kleinen Viewports statt horizontal überzulaufen.

### 11 — Reminder-Engine neu bauen

**Status:** ✅ Erledigt (siehe [#11](https://github.com/dstN/bewerby/issues/11) für den schließenden Commit und Details). Polling komplett entfernt — `getReminderDueAt()` als einzige Fälligkeits-Quelle (Anker: `sent`-History-Eintrag statt `updatedAt`), ereignisgetrieben über eine `liveQuery`-Subscription mit genau einem `setTimeout` auf die nächstfällige Erinnerung. Notified-Marker erst nach erfolgreicher Anzeige gesetzt, `localStorage` wird bei jedem Tick um verwaiste Keys bereinigt. `'10s'`-Debug-Wert vollständig entfernt (Typ, Validator, UI, i18n). Der tote `sync.register`-Aufruf ohne Listener bleibt als dokumentierter Best-Effort-Fallback bestehen (echte Erinnerungen bei vollständig geschlossenem Browser sind ohne Server architektonisch nicht möglich); Einstellungen benennen diese Grenze jetzt ehrlich. Mit Playwright verifiziert: einmaliges Feuern bei Fälligkeit, kein Duplikat bei Reload, korrekte Nicht-Fälligkeit vor Ablauf, Banner und Engine stimmen überein, und der zentrale Bugfix bestätigt — eine fachfremde Bearbeitung verschiebt die Fälligkeit nicht mehr.

**Ist:** `src/lib/utils/reminders.ts:111` installiert `setInterval(syncRemindersToServiceWorker, 2000)` — alle zwei Sekunden ein vollständiges `db.applications.toArray()` (`:36`), für immer, ohne `clearInterval`, jeder Tick deserialisiert sämtliche PDF-Blobs. Der Notified-Marker wird **vor** dem Anzeigen gesetzt (`:65-67`), ohne erteilte Notification-Berechtigung ist der Reminder damit dauerhaft unterdrückt. `localStorage` wächst durch nie aufgeräumte `bewerby_notified_*`-Keys unbegrenzt. Der Fälligkeitszeitpunkt hängt an `updatedAt` (`:58`), also setzt jede Bearbeitung und jeder Drag die Nachfass-Uhr zurück. `'10s'` ist ein Debug-Wert im Produktionstyp (`src/lib/db/index.ts:22`); in `src/routes/+page.svelte:82-88` fehlt der `'10s'`-Zweig, wodurch `intervalMs = 0` bleibt und die Karte permanent im Alert-Banner hängt. Der `setTimeout` im Service Worker (`src/service-worker.ts:93`) stirbt mit dem Worker nach etwa 30 Sekunden Idle, und `sync.register('check-reminders')` (`reminders.ts:119`) hat **keinen `sync`-Listener** im Service Worker.

**Soll:** Kein Polling. Fälligkeiten werden ereignisgetrieben bzw. mit einem an die kürzeste Fälligkeit gekoppelten Timer berechnet, auf schlanken Rows ohne PDF-Daten. Anker ist `appliedAt` bzw. der `sent`-Eintrag der Historie, nicht `updatedAt`. Der Notified-Marker wird erst nach erfolgreicher Anzeige gesetzt und periodisch aufgeräumt. Der Debug-Wert `'10s'` ist entfernt, die Intervall-Logik existiert genau einmal statt doppelt in `reminders.ts` und `+page.svelte`. Was bei geschlossener App tatsächlich funktioniert, ist entweder implementiert (`sync`-Handler) oder in den Einstellungen ehrlich benannt.

### 12 — Security-Header und Content-Security-Policy

**Status:** ✅ Erledigt (siehe [#12](https://github.com/dstN/bewerby/issues/12) für den schließenden Commit und Details). CSP über SvelteKits natives `kit.csp` (in `vite.config.ts`) — SvelteKit berechnet den Hash für das Inline-Theme-Script automatisch, keine manuelle Nonce nötig. **Empirisch abweichend von der ursprünglichen Roadmap-Annahme:** `hooks.server.ts` feuert für vorgerenderte Routen unter adapter-node **nicht** (mit einem Logging-Hook verifiziert — keine Ausgabe bei echten Requests), daher tragen die tatsächlich wirksamen Header (`frame-ancestors`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS) über `.htaccess`; `hooks.server.ts` bleibt als Vorsorge für künftige nicht-vorgerenderte Routen bestehen, hat aber auf das heutige Deployment keinen Effekt. Mit Playwright verifiziert: die App funktioniert unter der echten CSP ohne einen einzigen `securitypolicyviolation`-Verstoß — inklusive DatePicker-Transition, PDF-Worker/Parsing und PDF-Anzeige per Blob-URL.

**Ist:** Es gibt kein `hooks.server.ts` und keinen `csp`-Eintrag in der Plugin-Konfiguration (`vite.config.ts:9-21`). Der Origin liefert damit **keine** Security-Header: keine CSP, kein HSTS, kein `X-Content-Type-Options`, keine `Referrer-Policy`, keine `frame-ancestors` — auf einer Anwendung, die unverschlüsselte Lebensläufe hält. Das Inline-Theme-Script in `src/app.html:17-25` benötigt für eine strikte CSP einen Nonce oder Hash. Der DatePicker baut Inline-`style`-Strings (`src/lib/components/common/DatePicker.svelte:275`), was bei `style-src` zu berücksichtigen ist.

**Soll:** Eine strikte CSP ohne `unsafe-eval` (durch pdf.js 6 möglich), plus HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `frame-ancestors` gegen Clickjacking und eine restriktive `Permissions-Policy`. Das Inline-Script trägt einen Nonce oder wandert in eine externe Datei. Die Header werden über `hooks.server.ts` gesetzt, damit sie unabhängig von der Apache-Konfiguration greifen.

### 13 — Impressum und Datenschutzerklärung

**Status:** ✅ Erledigt (siehe [#13](https://github.com/dstN/bewerby/issues/13) für den schließenden Commit und Details). Neue Routen `/impressum` und `/datenschutz`, aus dem Sidebar-Footer sowie zusätzlich von der Einstellungsseite verlinkt, beide vollständig zweisprachig. Bewusste Design-Entscheidung: die identitätsbezogenen Felder (Name, Anschrift, Kontakt) sind als unübersehbar markierte Platzhalter umgesetzt statt automatisch erfundener Daten — ein Impressum mit Fantasienamen wäre irreführend und rechtlich unwirksam, und die tatsächliche Identität des Betreibers kann nicht aus dem Code erschlossen werden. Die Datenschutzerklärung selbst ist inhaltlich vollständig und technisch akkurat aus dem tatsächlichen Codeverhalten geschrieben (lokale Verarbeitung, IndexedDB/OPFS-Aufteilung, alle vier `localStorage`-Keys tabellarisch mit Zweck, kein Tracking, Rechte-Ausübung über bestehende Lösch-/Export-Funktionen). Mit Playwright verifiziert: beide Seiten laden vorgerendert, Platzhalter-Banner sichtbar, Verlinkung von Sidebar und Einstellungen funktioniert, Sprachumschaltung greift, keine CSP-Verstöße.

**Nachtrag (Platzhalter mit echten Daten befüllt):** Auf ausdrücklichen Wunsch mit den echten Angaben aus dem Schwester-Repo GourMerge (gleiche Person, gleicher Hosting-Anbieter) befüllt: verantwortliche Person und Anschrift, Netcup-Hostinganschrift, Kontakt-E-Mail. Die E-Mail läuft über eine neue `ObfuscatedEmail`-Komponente (`src/lib/components/common/ObfuscatedEmail.svelte`, adaptiert aus GourMerges Pendant) — der `mailto:`-Link wird erst nach dem Mount aufgelöst, ein per CSS/`aria-hidden` verstecktes Decoy-Element verfälscht eine rohe `textContent`-Extraktion, ohne echte Nutzer oder Screenreader zu beeinträchtigen. Postanschriften bleiben bewusst hartkodiert im Template statt über i18n zu laufen — rechtlich verbindlicher Text, identisch in jeder Sprache. Der Platzhalter-Banner ist entfernt, da nichts mehr platzhalterhaft ist.

**Nachtrag (Kontaktformular und Nutzungsbedingungen):** § 5 DDG verlangt eine Möglichkeit zur "schnellen elektronischen Kontaktaufnahme" — rechtlich reicht dafür die bereits vorhandene E-Mail-Adresse, auf ausdrücklichen Wunsch kam zusätzlich eine neue Route `/kontakt` mit echtem Formular dazu. Statt eines Drittanbieters (Web3Forms u. ä. hätten eine Art. 28 DSGVO-Auftragsverarbeitung erfordert) sendet das Formular an `contact.yinside.de` — bestehende Infrastruktur derselben Person, kein neues Verarbeiterverhältnis, aber eine neue Cross-Origin-Datenübertragung, die eine `connect-src`-Ausnahme in der CSP (`vite.config.ts`) und eine Anpassung der bisherigen "keine Netzwerkverbindungen"-Aussage in der Datenschutzerklärung nötig machte (jetzt: Ausnahme exakt auf die aktive Formularnutzung eingegrenzt). Serverseitig wurde das bereits von anderen Projekten (u. a. twitterArchiver) genutzte, geteilte `phpmailer.php` auf `contact.yinside.de` um ein originbasiertes Site-Profil erweitert, statt clientseitig übergebenen Empfänger/Betreff zu erlauben (hätte ein offenes Mail-Relay ermöglicht) — dabei zusätzlich eine echte Sicherheitslücke geschlossen: das Skript setzte den CORS-Header bisher nur bedingt, lehnte Anfragen von unbekannten Origins aber nie tatsächlich ab, was jeden Nicht-Browser-Client (curl, Skript) am Allowlist vorbeigelassen hätte; jetzt gibt es eine explizite 403-Ablehnung. Dieses Skript liegt außerhalb dieses Repos und muss separat auf dem Zielserver ausgerollt werden. Ergänzend entstand eine eigenständig verfasste `/nutzungsbedingungen`-Seite (GourMerge hatte keine als Vorlage), da für einen öffentlich nutzbaren Dienst mit lokaler Datenhaltung eine Klarstellung zu Eigenverantwortung für Datensicherung und Haftungsausschluss sinnvoll ist, auch ohne gesetzliche Pflicht. Zusätzlich fiel dabei ein eigenständiger Bug auf: die neuen Routen fehlten in `service-worker.ts`s `PRERENDERED_ROUTES`-Liste (siehe Nachtrag zu #3/#4) — ohne diesen Eintrag wären `/kontakt` und `/nutzungsbedingungen` nie zuverlässig offline verfügbar gewesen. Der bestehende Playwright-Offline-Test deckte das nicht auf, weil seine eigene Routenliste ebenfalls nicht aktualisiert worden war; beides korrigiert.

**Ist:** Weder Impressum noch Datenschutzerklärung existieren. Die Einstellungsseite enthält lediglich drei statische Datenschutz-Stichpunkte (`src/routes/settings/+page.svelte:54-73`). Für einen öffentlich erreichbaren, aus Deutschland betriebenen Dienst sind beide zwingend (§ 5 DDG, Art. 13 DSGVO).

**Soll:** Eigene Routen für Impressum und Datenschutzerklärung, aus der Navigation verlinkt, in beiden Sprachen. Die Datenschutzerklärung beschreibt wahrheitsgemäß, was die App tatsächlich tut: rein lokale Verarbeitung, kein Server-Log personenbezogener Inhalte, welche `localStorage`-Keys zu welchem Zweck gesetzt werden, und wie Nutzer ihre Daten exportieren und löschen.

### 14 — Recht auf Löschung umsetzen

**Status:** ✅ Erledigt (siehe [#14](https://github.com/dstN/bewerby/issues/14) für den schließenden Commit und Details). `src/lib/utils/eraseAllData.ts` löscht IndexedDB (via `db.delete()`), den kompletten OPFS-PDF-Ordner, sämtliche `localStorage`-Keys, alle Cache-Storage-Einträge und offene Notifications. Neue Karte in den Einstellungen mit Bestätigungsdialog, der explizit auf den Export hinweist, bevor gelöscht wird; nach erfolgreicher Löschung lädt die App neu. Mit Playwright end-to-end verifiziert (Bewerbung mit PDF, Theme-Änderung, Custom-Farbe, Notified-Marker als Ausgangszustand): nach der Löschung sind IndexedDB-Zeilen, OPFS-PDFs und `localStorage` vollständig leer, und die App bleibt danach voll funktionsfähig (Zustand einer Neuinstallation). Cache Storage füllt sich nach dem Reload normal mit der App-Shell neu — korrektes Service-Worker-Verhalten, da dort keine personenbezogenen Daten liegen.

**Ist:** Es gibt keine Funktion, um alle eigenen Daten zu löschen. Der einzige Löschpfad ist das Entfernen einzelner Bewerbungen per `confirm()` (`src/routes/+page.svelte:113-117`). `localStorage` behält `bewerby-theme`, `bewerby-locale`, `bewerby_custom_colors` und beliebig viele `bewerby_notified_*`-Keys; Cache Storage und angezeigte Notifications bleiben ebenfalls bestehen.

**Soll:** Eine bestätigungspflichtige Aktion in den Einstellungen räumt vollständig auf: IndexedDB, OPFS-Dateien, alle `localStorage`-Keys, Cache Storage und offene Notifications. Danach ist die App im Zustand einer Neuinstallation. Der Nutzer wird vorher auf den Export hingewiesen.

### 15 — Deployment verifizieren und dokumentieren

**Status:** ✅ Erledigt (siehe [#15](https://github.com/dstN/bewerby/issues/15) für den schließenden Commit und Details). Per Recherche gegen Passengers offizielle Doku und Quellcode zwei bisher unerkannte, schwerwiegendere Befunde bestätigt statt der ursprünglich vermuteten: (1) Apache liefert physisch existierende Dateien unter `DocumentRoot` **immer direkt statisch aus und umgeht Passenger/Node komplett** — bei `DocumentRoot` = Repo-Root wären `package.json`, `.git/config` und `src/*` also tatsächlich öffentlich abrufbar, nicht nur theoretisch. Behoben durch die von Passenger selbst vorgeschriebene Zwei-Wurzel-Architektur (`DocumentRoot` → `build/client/`, `PassengerAppRoot` → Projekt-Root), dokumentiert in `DEPLOYMENT.md`. (2) Passengers Node-Loader lädt die Startdatei per `require()` — eine ESM-Datei (`"type": "module"`) crasht dort zwingend mit `ERR_REQUIRE_ESM`, unabhängig von der Node- oder Passenger-Version (verifiziert direkt im Passenger-Quellcode, ein Fix-Versuch 2021 wurde unmerged geschlossen). Behoben durch Umbenennung zu `app.cjs` mit dynamischem Import statt `import`-Statement — lokal mit `node app.cjs` getestet und läuft korrekt.

Zusätzlich: `engines`-Feld in `package.json` ergänzt (gibt `.npmrc`s `engine-strict` erstmals Wirkung); `static/.htaccess` fließt jetzt automatisch nach `build/client/.htaccess` und trägt Security-Header, Cache-Control (Immutable für `_app/immutable/`, `no-cache` für HTML) sowie Ausspielung der von `precompress: true` erzeugten `.br`/`.gz`-Varianten. Verifiziert: der Build-Output ist vollständig self-contained (keine externen Paket-Referenzen in `build/index.js`) — `node_modules` wird auf dem Server gar nicht benötigt, was den Deploy-Fußabdruck deutlich verkleinert. **Bewusste Konsolidierung:** Das vollständige Runbook (`DEPLOYMENT.md`) entsteht hier statt in #32, da sich beide Issues beim Schreiben der Roadmap inhaltlich überschnitten hatten — #32 fokussiert stattdessen auf README-Neufassung und ein Architekturdokument. **Nicht gegen eine echte Netcup/Plesk-Instanz getestet** (keine verfügbar) — `DEPLOYMENT.md` benennt das explizit als Grenze.

**Nachtrag (erster echter Live-Deploy, `.htaccess`-Bug gefunden und behoben):** Die neu aufgesetzte CI/CD-Pipeline (`.github/workflows/deploy.yml`) hat den ersten Deploy gegen die echte bewerby.de-Instanz gefahren und dabei genau die in "Nicht gegen eine echte Netcup/Plesk-Instanz getestet" benannte Lücke geschlossen — mit einem überraschenden Ergebnis: Das Plesk-Panel war korrekt konfiguriert (Application Root, Document Root, Startup File, Node-Version alle wie in diesem Dokument beschrieben), die Seite lieferte trotzdem durchgängig HTTP 500 — auch für `/favicon.ico`. Das Apache-Error-Log zeigte die Ursache: `[core:alert] .htaccess: PassengerAppType not allowed here`. Auf diesem Netcup/Plesk-Host werden Passenger-Direktiven in einer `.htaccess`-Datei von Apache abgelehnt, was das Parsen der gesamten Datei zum Scheitern bringt und **jeden** Request unter dem vHost mit 500 beantwortet — nicht nur App-Routen. Da Plesks Node.js-Panel die gleichen Einstellungen bereits deklarativ auf vHost-Ebene setzt, waren `PassengerAppType`/`PassengerStartupFile` in `.htaccess` ohnehin redundant; behoben durch ersatzloses Entfernen beider Zeilen (Kommentar in `.htaccess` erklärt den Hintergrund für den Fall eines künftigen Hostwechsels). Nach dem Fix lief die Pipeline (Build-Download, SSH-Upload, atomarer Rename, Neustart, Smoke-Test) wie entworfen durch.

**Ist:** Die `.htaccess` liegt im Repository-Root und setzt `PassengerAppType node` / `PassengerStartupFile app.js`. Das greift nur, wenn Apaches DocumentRoot dieses Verzeichnis ist — dann wären aber `src/`, `node_modules/`, `.git/` und `static/data/` über HTTP erreichbar. `app.js` ist ein ES-Modul (`package.json` setzt `"type": "module"`, `app.js:13` nutzt Top-Level-`import`) ohne Node-Version-Pin: `.npmrc` setzt `engine-strict=true`, aber `package.json` hat **kein `engines`-Feld**. Unfingerprintete Assets (Fonts, Icons, Manifest) haben keine Cache-Control-Vorgabe. `adapter-node` erzeugt `precompress: true`-Varianten, deren Ausspielung ungeprüft ist. Ein Deploy-Runbook existiert nicht; die `README.md` ist noch das unveränderte `sv`-Template.

**Soll:** Die Passenger-Konfiguration ist real verifiziert, und kein Verzeichnis außer dem Build-Output ist über HTTP erreichbar. Das ESM-Startfile ist mit einem `engines`-Pin abgesichert, sodass `engine-strict` etwas erzwingt. Cache-Header für fingerprintete und unfingerprintete Assets sind korrekt getrennt. `robots.txt` passt zur Deployment-Absicht. Ein Runbook beschreibt Build, Upload, Neustart und Rollback reproduzierbar.

---

## Milestone 2 — Performance, A11y & UI Polish

**Ziel:** WCAG 2.2 AA durchgehend erfüllen und Lighthouse 100 in allen vier Kategorien erreichen.

| #   | Aufgabe                                                   | Labels                             | Issue                                            |
| :-- | :-------------------------------------------------------- | :--------------------------------- | :----------------------------------------------- |
| 16  | ✅ Fokus-Sichtbarkeit wiederherstellen                    | `a11y`                             | [#16](https://github.com/dstN/bewerby/issues/16) |
| 17  | ✅ Kontrastverstöße beheben                               | `a11y`                             | [#17](https://github.com/dstN/bewerby/issues/17) |
| 18  | ✅ Fokusmanagement im Bearbeitungsdialog                  | `a11y` `refactoring`               | [#18](https://github.com/dstN/bewerby/issues/18) |
| 19  | ✅ DatePicker als bedienbares Kalender-Grid               | `a11y` `performance` `refactoring` | [#19](https://github.com/dstN/bewerby/issues/19) |
| 20  | ✅ Kanban-Karte semantisch entflechten                    | `a11y`                             | [#20](https://github.com/dstN/bewerby/issues/20) |
| 21  | ✅ Tailwind-Scope eingrenzen (30 KB → ~2 KB CSS)          | `performance`                      | [#21](https://github.com/dstN/bewerby/issues/21) |
| 22  | ✅ Asset-Gewicht reduzieren                               | `performance`                      | [#22](https://github.com/dstN/bewerby/issues/22) |
| 23  | ✅ Board- und Analytics-Queries entkoppeln                | `performance`                      | [#23](https://github.com/dstN/bewerby/issues/23) |
| 24  | ✅ $effect-Disziplin herstellen                           | `refactoring`                      | [#24](https://github.com/dstN/bewerby/issues/24) |
| 25  | ✅ prefers-reduced-motion durchgehend respektieren        | `a11y`                             | [#25](https://github.com/dstN/bewerby/issues/25) |
| 26  | ✅ i18n vervollständigen und Seitentitel differenzieren   | `a11y` `bug`                       | [#26](https://github.com/dstN/bewerby/issues/26) |
| 27  | ✅ PDF-Verarbeitung härten                                | `bug` `performance`                | [#27](https://github.com/dstN/bewerby/issues/27) |
| 28  | ✅ Cloud-Sync-Platzhalter ehrlich und barrierefrei machen | `a11y`                             | [#28](https://github.com/dstN/bewerby/issues/28) |

### 16 — Fokus-Sichtbarkeit wiederherstellen

**Status:** ✅ Erledigt (siehe [#16](https://github.com/dstN/bewerby/issues/16) für den schließenden Commit und Details). Alle vier `outline: none`-Überschreibungen entfernt (Board-Suchfeld/-Filter, Modal-Formularfelder, DatePicker-Trigger); Letzterer hatte den Ring sogar explizit für `:focus-visible` unterdrückt und bekommt jetzt eine eigene Regel mit echtem `outline: 2px solid`. Die drei `sr-only`-Inputs (PDF-Upload, Farbwähler, Backup-Import) stylen ihr sichtbares Label jetzt über `:focus-within`. `.btn-swatch-remove` ist nun zusätzlich zu `:hover` auch bei `:focus-visible` bzw. `:focus-within` auf dem Wrapper sichtbar. Mit Playwright verifiziert — entscheidend dabei: `:focus-visible` reagiert in Chromium nicht auf programmatisches `.focus()`, sondern nur auf echte Tastaturnavigation, daher wurden die entsprechenden Testfälle über tatsächliche `Tab`-Tastendrücke geprüft statt über direkte Fokus-Zuweisung.

**Ist:** `src/app.css:184-188` definiert einen globalen `:focus-visible`-Ring, der an vier Stellen durch spezifischeres `outline: none` geschlagen wird: `src/routes/+page.svelte:482` und `:503` (Suchfeld und die vier Filter-Selects — letztere haben dadurch **gar keine** Fokusanzeige), `src/lib/components/kanban/ApplicationModal.svelte:565` (alle Formularfelder) und `src/lib/components/common/DatePicker.svelte:355` sowie `:364-370`, wo der Ring explizit auch für `:focus-visible` entfernt wird. Ersatz ist jeweils nur ein 1px-Randfarbwechsel, was WCAG 2.4.11 nicht genügt. Zusätzlich nehmen drei `sr-only`-Inputs (PDF-Upload `:186`, Farbwähler `:345`, Backup-Import `src/routes/backup/+page.svelte:136`) den Fokus, während sie unsichtbar sind, und `.btn-swatch-remove` ist mit `opacity: 0` nur per `:hover` sichtbar (`ApplicationModal.svelte:770`) — für Tastaturnutzer also ein fokussierbarer, unsichtbarer Button.

**Soll:** Jedes fokussierbare Element hat eine deutlich sichtbare Fokusanzeige auf jeder Oberfläche. Die vier `outline: none`-Überschreibungen sind entfernt oder durch gleichwertige, sichtbare Indikatoren ersetzt. Fokus auf einem `sr-only`-Input stylt das sichtbare Label über `:focus-within`. Hover-abhängige Steuerelemente werden auch bei Fokus sichtbar.

### 17 — Kontrastverstöße beheben

**Status:** ✅ Erledigt (siehe [#17](https://github.com/dstN/bewerby/issues/17) für den schließenden Commit und Details). `--text-tertiary` in beiden Themes abgedunkelt/aufgehellt (Light `#56657a`, Dark `#8695ab`), gegen alle vier Surface-Ebenen geprüft statt nur gegen die im Audit genannten. `--color-success`/`--color-warning` in `:root` auf dunklere, lesbare Töne gesetzt; `--color-danger` in `:root.dark` aufgehellt — die `@theme`-Werte bleiben als Tailwind-Utility-Basis (`.text-success` etc.) unangetastet. Neuer `--color-accent-text`-Token für Fließtext/Icons in Akzentfarbe (z. B. ausgewählter Swatch, DatePicker-„Heute"-Markierung), getrennt von `--color-accent-500/600`, die als Rahmen/Ring weiterhin nur 3:1 erfüllen müssen. Neuer `--color-danger-solid`-Token für Volltonflächen mit weißer Schrift (Lösch-Buttons, DB-Fehlerbanner), da diese Kombination themenunabhängig einen fixen, ausreichend dunklen Rotton braucht. Tinted Status-Meldungen (Backup-Erfolg/-Fehler, Einstellungen-Badges, Prioritäts-Badge) laufen jetzt über zentrale `--status-success-bg`/`--status-danger-bg`-Tokens mit je Theme kalibrierter Deckkraft statt hartcodierter `rgba()`-Literale. Funnel-Balken in der Analyse: Basisbalken nutzt jetzt `--text-tertiary` bei 80% statt `--border-strong` bei 20%, Akzent-/Erfolgsbalken laufen deckend statt bei 30% Opazität; die Zahl im Balken bekommt eine eigene deckende Pille als Hintergrund, damit sie unabhängig von der Balkenfarbe lesbar bleibt. Selektierter Kalendertag und Quick-Filter-Hover nutzen `--color-accent-600` statt `-500` für ausreichenden Kontrast mit weißer Schrift.

Mit Playwright end-to-end gegen echte, im Browser berechnete `getComputedStyle`-Werte verifiziert (nicht nur gegen die gewählten Hex-Werte von Hand nachgerechnet) — 14 Kontrastpaare in jedem Theme, alle ≥ 4,5:1 (bzw. ≥ 3:1 für die rein grafischen Funnel-Balken). Dabei zwei echte Bugs gefunden und behoben, die reines Nachrechnen übersehen hätte: (1) `--color-accent-600` funktioniert nur auf hellem Untergrund als Text — im Dark Theme braucht dieselbe Rolle einen helleren Blauton, daher der eigene `--color-accent-text`-Token. (2) Da `:root` `--color-success`/`--color-warning` überschreibt, `:root.dark` die beiden Werte aber ursprünglich nicht erneut setzte, kaskadierte im Dark Theme fälschlich der Light-Wert durch statt auf den `@theme`-Default zurückzufallen — behoben durch explizite Wiederholung beider Werte in `:root.dark`.

**Ist:** Aus den Hex-Werten in `src/app.css` berechnet: `--text-tertiary` (`#94a3b8`) erreicht auf `--surface-0`/`--surface-1` nur 2,43–2,56:1 im Light-Theme und 3,60–4,06:1 im Dark-Theme (`:112`, `:144`) — verwendet für Kartendatum, Wochentagsköpfe, Kalendertage außerhalb des Monats, Zeiteinheiten, Versionstag und mehrere Icons. Die Status-Pills liegen bei 2,95:1 und 4,13:1 (`src/routes/backup/+page.svelte:329`, `:335`). Weiß auf `--color-accent-500` ergibt 3,68:1 (ausgewählter Kalendertag, Quick-Filter-Hover). Die Funnel-Balken laufen mit `opacity: 0.2`–`0.3` (`src/routes/analytics/+page.svelte:366-384`) und sind kaum wahrnehmbar.

**Soll:** Alle Text-/Hintergrundpaare erreichen mindestens 4,5:1 (bzw. 3:1 für großen Text und UI-Grenzen), in beiden Themes. Die Tertiärfarbe wird abgedunkelt bzw. aufgehellt, statt sie punktuell zu übersteuern. Nutzergewählte Kartenfarben garantieren lesbaren Text darüber. Kein Zustand wird allein über Farbe transportiert.

### 18 — Fokusmanagement im Bearbeitungsdialog

**Status:** ✅ Erledigt (siehe [#18](https://github.com/dstN/bewerby/issues/18) für den schließenden Commit und Details). `ApplicationModal` ist jetzt ein natives `<dialog>`, per `showModal()` geöffnet — Fokus hinein, Fangen und Ausblenden des Hintergrunds für assistive Technik kommen dadurch größtenteils vom Browser selbst. Body-Scroll wird während der Öffnung explizit gesperrt, Fokus wird beim Schließen manuell auf das auslösende Element zurückgesetzt (nicht nur dem Browser überlassen). Alle Formularfelder stecken jetzt in einem echten `<form onsubmit={...}>` — native Validierung (`required`, `type="email"`, `type="url"`) greift, Enter in einem Textfeld sendet ab. Escape, X-Button, Abbrechen-Button und Backdrop-Klick laufen alle über denselben `requestClose()`-Pfad; bei ungespeicherten Änderungen (Vergleich per Snapshot gegen den beim Öffnen geladenen Ausgangszustand) fragt ein `confirm()` vor dem Verwerfen nach.

Mit Playwright end-to-end verifiziert — dabei zwei reale Bugs gefunden, die ohne Browser-Verifikation unentdeckt geblieben wären: (1) Chromiums automatisches Inert-Verhalten für `<dialog>` verhindert zwar zuverlässig, dass der Hintergrund den Fokus bekommt, **wickelt den Tab-Fokus aber nicht garantiert vom letzten zurück zum ersten Element** — nach 24 Tab-Presses landete der Fokus auf `<body>` statt auf dem ersten Feld. Behoben durch einen zusätzlichen manuellen `keydown`-Handler, der Tab/Shift+Tab am letzten/ersten fokussierbaren Element abfängt und umlenkt. (2) Der ursprüngliche „Dirty"-Check nutzte denselben `$effect`, der beim Laden die Formularfelder setzt, um auch den Vergleichs-Snapshot zu erzeugen — da dieser Snapshot dieselben Felder liest, hing der Lade-Effekt dadurch selbst von jedem Formularfeld ab und lief bei jeder Nutzereingabe erneut, wobei er den gerade geänderten Wert sofort wieder als „sauberen" Ausgangszustand übernahm. Behoben mit `untrack()` um den Snapshot-Aufruf.

**Ist:** `ApplicationModal` ist ein einfaches `<div role="dialog" aria-modal="true" tabindex="-1">` (`:172`) ohne jedes Fokusmanagement: der Fokus wird beim Öffnen nicht hineinbewegt, nicht gefangen, beim Schließen nicht zurückgegeben, Escape schließt nicht, der Hintergrund scrollt weiter und ist weder `inert` noch `aria-hidden`. `aria-modal="true"` verbirgt damit die Seite vor assistiver Technik, während der Screenreader-Cursor außerhalb des Dialogs geparkt bleibt. Der Backdrop-Klick (`:169`) verwirft alle Eingaben ohne Rückfrage, und `role="presentation"` auf einem klickbaren Element ist unzulässig. Es gibt kein `<form>`, wodurch `type="url"` und `type="email"` nicht validiert werden und Enter nicht absendet.

**Soll:** Umsetzung als natives `<dialog>` oder mit vollständigem Fokusmanagement: Fokus beim Öffnen hinein, gefangen, beim Schließen auf das auslösende Element zurück, Escape schließt, Hintergrund gesperrt und für assistive Technik ausgeblendet. Ein echtes `<form>` liefert native Validierung und Enter-Absenden. Bei ungespeicherten Änderungen wird vor dem Verwerfen zurückgefragt.

### 19 — DatePicker als bedienbares Kalender-Grid

**Status:** ✅ Erledigt (siehe [#19](https://github.com/dstN/bewerby/issues/19) für den schließenden Commit und Details). Vollständig neu aufgebaut: Das Tagesgrid ist jetzt ein echtes `role="grid"` (6× `role="row"` à 7× `role="gridcell"`) mit genau einem Tab-Stop (roving `tabindex`) statt 42. Pfeiltasten bewegen den Fokus tageweise/wochenweise, Home/End springen an Wochenanfang/-ende, PageUp/PageDown wechseln den Monat, Shift+PageUp/PageDown das Jahr — Monatswechsel werden über den bestehenden `announcer` angesagt. Jede Zelle hat einen vollständigen `aria-label` (Wochentag, Tag, Monat, Jahr statt nur der Zahl), `aria-selected` und `aria-current="date"` für heute. Positionierung läuft jetzt über die native `popover`-API (`popovertarget`) kombiniert mit CSS-Anchor-Positioning (`anchor-name`/`position-anchor`/`position-area`/`position-try-fallbacks: flip-block`) statt Inline-`position:fixed`-Strings — der komplette `$effect` mit Outside-Click-, Escape- und ungethrottelten Scroll-/Resize-Listenern samt `getBoundingClientRect()`-Neuberechnung entfällt vollständig, da Popover-Light-Dismiss und Anchor-Repositionierung nativ vom Browser kommen. Der versteckte native Date-Input hat jetzt `tabindex="-1"` und `aria-hidden`, erzeugt also keinen zweiten Tab-Stop mehr. `aria-label` der Monats-Navigation läuft über i18n (`datepicker.prevMonth`/`nextMonth`) statt hartcodiertem Deutsch. Wochenstart und Wochentags-Header folgen jetzt der Locale (`Intl.Locale.prototype.getWeekInfo()`, mit Fallback auf Montag), `selectQuickDate` rechnet über den `Date`-Konstruktor statt fixer 86400000-ms-Schritte und ist damit über Zeitumstellungen hinweg korrekt.

Mit Playwright end-to-end verifiziert (22 Checks): Grid-Struktur und Rollen, genau ein Tab-Stop, vollständige Zugangsnamen, `aria-current`, alle Pfeiltasten/Home/End/PageUp/PageDown/Shift+PageUp, Monatsansage über die Live-Region, Auswahl per Enter, natives Schließen per Escape und Außerhalb-Klick, kein doppelter Tab-Stop durch den versteckten Input, korrekte Schnellauswahl-Daten und – als direkter Beleg für die Locale-Abhängigkeit – ein tatsächlicher Sprachwechsel im Browser, der den Wochenstart von Montag (`de`) auf Sonntag (`en`) umstellt. Vorab in einer isolierten Testseite gezielt geprüft, welche Anchor-Positioning-Syntax der Ziel-Browser tatsächlich unterstützt (`position-area` statt des älteren `inset-area`-Namens) sowie welche `Intl.Locale`-API-Form verfügbar ist (`getWeekInfo()` als Methode, nicht `weekInfo` als Getter) — beides wurde nicht angenommen, sondern vor der Implementierung im echten Browser verifiziert.

**Ist:** Das Tagesgrid rendert 42 einzelne Buttons (`src/lib/components/common/DatePicker.svelte:315-328`) — also 42 Tab-Stops ohne `role="grid"`, ohne Pfeiltasten-, Home-/End-/PageUp-/PageDown-Navigation, ohne `aria-selected`/`aria-current="date"`. Der Button-Text ist nur die Tageszahl, ein Screenreader hört „5, Schaltfläche" ohne Monatskontext. Monatswechsel werden nicht angesagt. Das Popup setzt `aria-modal="true"` (`:273`) ohne Fokusmanagement. Positionierung läuft über einen Inline-`style`-String mit `position: fixed; z-index: 99999` (`:41-45`), nötig nur weil `.modal-content` `overflow: hidden` setzt. Ein ungethrottelter Capture-Phase-Scroll-Listener (`:86`) ruft pro Event `getBoundingClientRect()` und schreibt `$state`. Der sichtbar versteckte native Date-Input (`:248`) erzeugt einen zweiten Tab-Stop für dasselbe Feld. `aria-label="Vorheriger Monat"`/`"Nächster Monat"` sind hartcodiert deutsch. `selectQuickDate` rechnet mit festen 86400000 ms und ist damit über Zeitumstellungen hinweg ungenau. Der Wochenstart ist unabhängig von der Locale fest auf Montag.

**Soll:** Ein echtes `role="grid"` mit einem Tab-Stop und vollständiger Pfeiltasten-Navigation, korrektem `aria-selected`/`aria-current`, vollständigen zugänglichen Namen je Tag und angesagtem Monatswechsel. Positionierung über `popover` und CSS-Anchor-Positioning statt Inline-`fixed`-Strings, wodurch auch die Scroll-Listener entfallen. Native Eingabe bleibt als Alternative, ohne doppelten Tab-Stop. Wochenstart und Formatierung folgen der Locale, Datumsarithmetik ist zeitzonensicher.

### 20 — Kanban-Karte semantisch entflechten

**Status:** ✅ Erledigt (siehe [#20](https://github.com/dstN/bewerby/issues/20) für den schließenden Commit und Details). Die Karte ist jetzt ein nicht-interaktives `<li>` (kein `role="button"`, kein `tabindex`, kein `onclick` mehr auf dem Wrapper); ein echter `<button class="card-open-btn">` umschließt Firma, Priorität, Titel, Gehalt und Tags und öffnet den Bearbeitungsdialog — sein Inhalt bleibt dadurch für assistive Technik normal lesbar statt hinter einem überschreibenden `aria-label` verborgen. Status-Select und Löschen-Button liegen als Geschwister im `card-footer` außerhalb dieses Buttons, sind also nicht mehr verschachtelt. Die Kartenliste ist jetzt ein `<ul>`/`<li>` statt verschachtelter `div`s. Der Prioritäts-Badge zeigt jetzt `t('application.priorities.*')` ("Niedrig"/"Mittel"/"Hoch") statt der textlosen Kürzel `'!!!'`/`'Low'`/`'Mid'`. Löschen und ein einfaches Speichern (ohne Statuswechsel) werden jetzt zusätzlich zum bereits vorhandenen Verschieben-Announcement über den `announcer` angesagt; Löschen bleibt wie zuvor über `confirm()` klar bestätigt. Die im Ist erwähnten `svelte-ignore`-Kommentare existierten bei genauer Prüfung nicht mehr im Code — der in ApplicationModal war bereits Nebeneffekt des `<dialog>`-Umbaus in #18, der in `+page.svelte` war nie nötig, da Klick- und Tastatur-Handler dort schon damals korrekt gepaart waren.

Mit Playwright end-to-end verifiziert (13 Checks): Listen-Semantik, keine Verschachtelung, übersetzter Badge-Text, zugänglicher Inhalt des Öffnen-Buttons, Öffnen per Klick und per Enter-Taste, unabhängige Bedienbarkeit von Status-Select und Löschen-Button ohne den Dialog zu öffnen, beide neuen Live-Region-Ansagen, tatsächliches Entfernen der Karte nach Bestätigung, und – als gezielte Regressionsprüfung, da ein `<button>` jetzt einen Großteil der zuvor direkt draggable Kartenfläche ausfüllt – dass Drag-and-drop von der Kartenfläche aus weiterhin funktioniert. Zusätzlich visuell mit einem absichtlich sehr langen Firmennamen geprüft: Der Badge bleibt lesbar, kein Überlauf oder Abschneiden.

**Ist:** Die Karte ist ein `div` mit `role="button"` und `aria-label` (`src/routes/+page.svelte:273-289`), das einen weiteren `<button>` zum Löschen enthält (`:325`). Verschachtelte interaktive Elemente sind unzulässig, und `role="button"` plus `aria-label` verbirgt den gesamten Karteninhalt samt Löschaktion vor assistiver Technik. Zwei `svelte-ignore`-Kommentare (`:272`, `ApplicationModal.svelte:170-171`) unterdrücken genau diese Warnungen. Der Prioritäts-Badge rendert untranslated `'!!!'`, `'Low'` oder `'Mid'` bei 9px Schriftgröße (`:299-301`) — `'!!!'` hat keine Textbedeutung. Die Kartenliste ist kein `<ul>`. Der Löschbutton nutzt `confirm()` ohne Undo. Board-Aktionen werden nirgends angesagt.

**Soll:** Ein nicht-interaktiver Wrapper mit echten Buttons darin; der Karteninhalt bleibt für assistive Technik lesbar. Prioritäten haben eine verständliche Textalternative und sind übersetzt. Die Kartenliste ist als Liste ausgezeichnet. Löschen, Verschieben und Speichern werden per Live-Region angesagt; Löschen ist rücknehmbar oder klar bestätigt.

### 21 — Tailwind-Scope eingrenzen

**Status:** ✅ Erledigt (siehe [#21](https://github.com/dstN/bewerby/issues/21) für den schließenden Commit und Details), über die im Soll genannte Alternative gelöst: **Tailwind wurde vollständig entfernt** statt nur im Scope eingegrenzt. Eine gezielte Bestandsaufnahme ergab, dass im gesamten `src/`-Baum nur vier Tailwind-Utilities real verwendet wurden: `sr-only` (4 Stellen), die `focus:*`-Varianten des Skip-Links in `src/app.html`, sowie `text-success`/`text-danger` in `analytics/+page.svelte` — Letztere hatten dort bereits eine redundante, identisch wirkende handgeschriebene Scoped-Style-Definition. `@import 'tailwindcss'` ist aus `app.css` entfernt, der `@theme`-Block wurde 1:1 zu einem normalen `:root`-Block (identische Custom-Properties, keine Verhaltensänderung), `sr-only` und ein neues `.skip-link` mit `:focus`-Zustand sind handgeschrieben nachgebaut. `tailwindcss`, `@tailwindcss/vite` und `prettier-plugin-tailwindcss` sind aus `package.json` entfernt, `vite.config.ts` und `prettier.config.js` entsprechend bereinigt, dazu die jetzt gegenstandslose VS-Code-Tailwind-Erweiterungsempfehlung und die `*.css`→`tailwindcss`-Dateizuordnung entfernt (Letztere war vermutlich auch die Ursache mehrerer irreführender „`}` erwartet"-Fehleranzeigen des Editors während dieser Session bei harmlosen `app.css`-Änderungen).

Mit Playwright end-to-end verifiziert: Skip-Link bleibt vor Fokus 1px groß und wird bei Fokus sichtbar/fixiert, Design-Tokens lösen weiterhin korrekt auf echten Elementen auf, der Theme-Umschalter funktioniert weiterhin ohne Tailwinds `dark:`-Variante, alle sechs Routen laden fehlerfrei, keine der ursprünglich toten Utility-Selektoren (`max-w-7xl`, `h-screen`, `rotate-45` etc.) taucht in irgendeinem geladenen Stylesheet mehr auf, und `.text-success` löst über den bereits vorhandenen Scoped-Fallback weiterhin korrekt auf. Per Build zusätzlich bestätigt: 0 Treffer für alle ursprünglich im Audit zitierten toten Klassen in jeder erzeugten CSS-Datei. **Einschränkung zur genannten Zielgröße:** Die größte erzeugte Datei (`_layout.*.css`, ~11 KB statt der geschätzten ~2 KB) bündelt neben den globalen Tokens/Resets auch die vollständigen, tatsächlich genutzten Scoped Styles von `+layout.svelte` (Sidebar, Mobile-Nav, Toolbar) — die ursprüngliche ~2-KB-Schätzung ging von einer isolierten Betrachtung nur der `sr-only`/`focus:*`-Regeln aus und berücksichtigte diese immer schon vorhandene Komponent-CSS nicht. Die eigentliche Zielsetzung des Issues — keine toter Utility-Code mehr im Ausgabebundle — ist vollständig erreicht.

**Ist:** Verifiziert: das render-blockierende `0.XGf93GLI.css` ist 30,6 KB groß und enthält 159 Klassen-Selektoren — darunter `max-w-7xl`, `h-screen`, `rotate-45`, `translate-y-16`, `scale-105`, `table-cell`, `col-span-8`, `row-span-2`. Die App nutzt real nur `sr-only` und die `focus:*`-Utilities des Skip-Links; alle eigenen Styles liegen in scoped `<style>`-Blöcken. Tailwind v4 erntet die übrigen Klassennamen aus den Markdown-Beispielen in `.agents/skills/*/SKILL.md`.

**Soll:** Die Quellsuche ist explizit auf `src/` begrenzt (`source(none)` plus gezieltes `@source`), sodass nur real genutzte Utilities generiert werden — Zielgröße rund 2 KB statt 30 KB. Alternativ wird Tailwind ganz entfernt und die drei benötigten Regeln werden handgeschrieben, was zugleich `tailwindcss`, `@tailwindcss/vite` und `prettier-plugin-tailwindcss` aus dem Abhängigkeitsbaum nimmt.

### 22 — Asset-Gewicht reduzieren

**Status:** ✅ Erledigt (siehe [#22](https://github.com/dstN/bewerby/issues/22) für den schließenden Commit und Details). Alle vier Icon-Dateien mit `sharp` (Palettenquantisierung, 256 Farben, verlustfrei nachkomprimiert) neu kodiert, Abmessungen unverändert: 512×512 289 KB → 82 KB (−72 %), 192×192 47 KB → 15 KB, `apple-touch-icon` 42 KB → 12 KB, `favicon-96x96` 14 KB → 5 KB — visuell mit dem Original verglichen, keine sichtbaren Kompressionsartefakte. **Bewusst nicht auf die im Ist genannten <20 KB gedrückt:** Ein Testlauf ohne Dithering erreichte zwar 12 KB, führte aber zu sichtbarem Banding in den Farbverläufen der Marke — Bildqualität des Markenzeichens hatte Vorrang vor einer exakten Byte-Zahl. Sidebar-Logo ist jetzt ein Inline-SVG (vereinfachte, handgezeichnete Nachbildung des Ordner-mit-Ring-Motivs in 2 Verläufen statt des komplexen mehrstufigen Rasterbilds — keine Pixel-für-Pixel-Nachbildung, da das Original dafür ungeeignet ist), ersetzt das zuvor als 24×24-Icon zweckentfremdete 41-KB-PNG vollständig. `manifest.json` hat jetzt für beide Icon-Größen sowohl `purpose: "any"` als auch `purpose: "maskable"`-Einträge. Ungenutzten Font-Schnitt `Lexend Light (300)` entfernt (Datei gelöscht, `@font-face` entfernt) — im gesamten `src/`-Baum wird ausschließlich 400/500/600/700 verwendet, per Volltextsuche über alle `font-weight`-Deklarationen verifiziert. Die vier verbleibenden Schnitte werden jetzt in `app.html` per `<link rel="preload">` geladen. Eine `Lexend Fallback`-`@font-face` (lokales Arial mit `size-adjust`/`ascent-override`/`descent-override`/`line-gap-override`) sitzt in der Font-Stack-Kette vor `system-ui`, um den Schriftwechsel-Sprung zu minimieren — die Metrik-Werte sind nicht geschätzt, sondern mit `fontkit` direkt aus der echten `lexend-regular.woff2` und der lokalen `arial.ttf` ausgelesen und daraus exakt berechnet (`size-adjust: 107.07%`, `ascent-override: 93.39%`, `descent-override: 23.35%`, `line-gap-override: 0%`).

Mit Playwright end-to-end verifiziert (13 Checks): keine Konsolenfehler, Sidebar-Logo ist nachweislich ein `<svg>` statt `<img>`, es werden nur noch die vier tatsächlich genutzten Font-Dateien angefragt (kein `lexend-300` mehr), alle vier Preload-Links sind vorhanden, die `Lexend Fallback`-Schriftart ist im Browser registriert, das Manifest liefert beide Purpose-Werte, beide großen Icons sind nachweislich unter ihrer alten Größe, und alle sechs Routen laden weiterhin fehlerfrei mit den neuen Assets. Icon- und Logo-Ergebnis zusätzlich visuell per Screenshot geprüft.

**Ist:** `static/icons/web-app-manifest-512x512.png` ist 289 KB groß, `apple-touch-icon.png` 41 KB — und letzteres wird als 24×24px-Logo in der Sidebar geladen (`src/lib/components/layout/Sidebar.svelte:24`) sowie als `rel="icon"` (`src/app.html:12`). Beide Manifest-Icons haben ausschließlich `purpose: "maskable"` (`static/manifest.json:13-26`), es fehlt ein `"any"`-Icon. Die fünf Lexend-Schriftschnitte (je ~14,5 KB) sind nicht preloaded, laufen alle auf `font-display: swap` und werden von `html { font-family: 'Lexend' }` sofort gebraucht — garantierter Layout-Shift beim ersten Rendern.

**Soll:** Icons in der jeweils benötigten Größe und Kompression, Zielgröße unter 20 KB für 512×512. Das Sidebar-Logo ist ein Inline-SVG. Das Manifest hat sowohl `maskable`- als auch `any`-Icons. Die tatsächlich genutzten Schriftschnitte sind preloaded und mit Fallback-Metriken (`size-adjust`) versehen, sodass kein Layout-Shift entsteht; ungenutzte Schnitte fallen weg.

### 23 — Board- und Analytics-Queries entkoppeln

**Status:** ✅ Erledigt (siehe [#23](https://github.com/dstN/bewerby/issues/23) für den schließenden Commit und Details). Board gruppiert die gefilterte Liste jetzt in einem einzigen `applicationsByColumn`-`$derived` (ein Durchlauf, `Record<Status, Application[]>`), statt `filteredApplications.filter(...)` fünfmal im Template auszuführen — jede Spalte liest nur noch ihren eigenen vorab gruppierten Slice. Analytics liest weiterhin volle Dexie-Rows aus IndexedDB (das kann Dexie storage-seitig nicht umgehen), projiziert das Ergebnis aber sofort auf `Pick<Application, 'status' | 'history'>`, bevor es in den reaktiven Store gelangt — der einzige Verbraucher dieses Stores braucht ohnehin nur diese zwei Felder. `selectedApp` in `+page.svelte` ist jetzt `$state.raw` statt `$state`, da die Referenz nur ausgetauscht, nie durch sie hindurch mutiert wird — ein tiefer Reactive-Proxy über `tags`/`history` brachte keinen Nutzen. **Bewusst nicht angefasst:** Der Reminder-Sync (`reminders.ts`) liest ebenfalls volle Rows, braucht davon aber tatsächlich die meisten Felder (Firma/Titel für die Benachrichtigung, mehrere Felder für die Fälligkeitsberechnung) — anders als bei Analytics wäre eine Projektion hier kaum eine Verbesserung, dafür aber ein unnötiges Risiko für die geteilte `getReminderDueAt()`-Signatur. Die im Ist zitierten ungekeyten `{#each}`-Blöcke existierten bei Durchsicht des aktuellen Codes nicht mehr — alle Listen im Projekt sind bereits durchgehend gekeyed, vermutlich als Nebeneffekt der Umbauten in #18–#20.

Mit Playwright end-to-end verifiziert (12 Checks): je eine Bewerbung pro Status landet nach dem Gruppierungs-Umbau weiterhin in der richtigen Spalte, exakt 5 Karten insgesamt (keine Dopplung durch die Gruppierung), Such- und Prioritätsfilter funktionieren weiterhin korrekt, Bearbeiten und erneutes Öffnen einer Karte übernimmt die Änderung trotz `$state.raw`, Drag-and-Drop verschiebt eine Karte weiterhin korrekt zwischen den neu gruppierten Spalten, und die Analytics-Zählungen stimmen mit den projizierten `status`/`history`-Zeilen weiterhin exakt. Dabei einen echten Fehler in der eigenen Testmethodik gefunden und behoben, keinen App-Fehler: Ein `:has-text("Versendet")`-Selektor auf die ganze Spalte traf versehentlich die falsche Spalte, weil jede Karte ihre Status-Auswahlliste mit allen fünf Statuslabels als `<option>`-Text im DOM trägt — behoben durch gezieltes Matching auf `.column-title` statt auf den gesamten Spalteninhalt.

**Ist:** Board (`src/routes/+page.svelte:20`), Analytics (`src/routes/analytics/+page.svelte:6`) und der Reminder-Sync lesen jeweils `db.applications.toArray()` — also alle Felder inklusive PDF-Blobs, obwohl Analytics nur `status` und `history` braucht. Im Board läuft `filteredApplications.filter(...)` fünfmal pro Render, einmal je Spalte (`:251`), statt einmal gruppiert. Mehrere `{#each}` ohne Key (`:215`, `:311`, `ApplicationModal.svelte:289`, `:310`, `:382`, `DatePicker.svelte:309`). Der ausgewählte Datensatz wird als tiefes `$state`-Proxy gehalten (`:94`), inklusive Blob.

**Soll:** Nach Aufgabe 5 lesen alle Ansichten nur schlanke Rows. Analytics selektiert ausschließlich die benötigten Felder. Die Spaltengruppierung entsteht in einem einzigen `$derived`. Listen sind durchgehend gekeyed. Dexie-Rows werden als `$state.raw` gehalten, damit keine unnötigen Proxies über Binärdaten entstehen.

### 24 — $effect-Disziplin herstellen

**Status:** ✅ Erledigt (siehe [#24](https://github.com/dstN/bewerby/issues/24) für den schließenden Commit und Details). Von den fünf im ursprünglichen Audit zitierten Stellen existierten bei Durchsicht des aktuellen Codes noch vier `$effect`-Verwendungen (DatePicker hatte durch den Umbau in #19 bereits eines von zwei verloren). Der schwerwiegendste Fall — `+layout.svelte`s Boot-`$effect` — bestätigt: `i18n.init()` schreibt `this.locale` und liest es in derselben Methode über `document.documentElement.lang = this.locale` sofort wieder zurück; dieser Read machte den umschließenden Effect abhängig von `locale`, wodurch jeder Sprachwechsel die komplette Boot-Pipeline erneut auslöste (`colorStore.init()`, verwaiste-PDFs-Aufräumen, Persistenz-Anfrage, Background-Sync-Registrierung, `db.open()` und – am gravierendsten – Abbau **und Neustart** der Reminder-Engine). Per `onMount()` ersetzt, das nie erneut ausgeführt wird, unabhängig davon, welche reaktiven Werte im Rumpf gelesen werden. Die Teardown-Funktion (`stopReminderEngine`) bleibt als Rückgabewert erhalten. In `settings/+page.svelte` war der Permission-`$derived` bereits vorher (aus einer früheren Sitzung dieses Tages) auf ein sauberes Pattern umgestellt; der verbleibende Storage-Persistenz-`$effect` (kein reaktiver Read, lief ohnehin nur einmal) ist jetzt ebenfalls `onMount()`. In `ApplicationModal.svelte` ersetzt ein direkter `$state(...)`-Initialisierer pro Feld den Prop-Sync-Effect — da die Elternkomponente den Dialog ausschließlich innerhalb von `{#if showModal}` rendert, garantiert das bereits dieselbe „frische Instanz pro Öffnen"-Eigenschaft, die sonst `{#key}` liefern würde. Svelte markiert direkte Top-Level-Reads eines Props (auch innerhalb eines `$state(...)`-Initialisierers) als `state_referenced_locally`-Warnung, unabhängig von der Schreibweise — behoben durch einen einzelnen expliziten `untrack(() => application)`-Schnappschuss, aus dem alle Felder initialisiert werden. Der verbleibende `$effect` im DatePicker (View-Synchronisierung bei geschlossenem Popup, wenn `value` sich von außen ändert) ist keine getarnte Einmalinitialisierung, sondern ein echter fortlaufender Sync-Bedarf, und bleibt unverändert bestehen.

Mit Playwright end-to-end verifiziert (7 Checks) — dabei gezielt der schwerwiegendste Fall bewiesen, nicht nur angenommen: `navigator.storage.persist()` (von der Boot-Pipeline genau einmal aufgerufen) wurde instrumentiert und läuft nach dreimaligem Sprachwechsel weiterhin exakt einmal, statt viermal wie vor dem Fix. Zusätzlich geprüft: die App funktioniert nach wiederholten Sprachwechseln normal weiter (Board/Speichern), die Benachrichtigungs-Berechtigungsanzeige und die Speicherplatz-Karte in den Einstellungen füllen sich weiterhin korrekt, und der verbliebene DatePicker-Effect synchronisiert die Ansicht weiterhin korrekt.

**Ist:** Fünf `$effect`-Verwendungen ersetzen Lifecycle oder abgeleitete Werte. `src/routes/+layout.svelte:15` ist der gravierendste Fall: der Init-Effect ruft `i18n.init()`, das `this.locale` schreibt **und** über `document.documentElement.lang = this.locale` liest (`src/lib/i18n/index.svelte.ts:49-53`) — der Effect hängt damit an `locale`, sodass jeder Sprachwechsel die komplette Boot-Pipeline erneut ausführt, inklusive Reminder-Sync und Intervall-Registrierung. Es gibt keine Teardown-Funktion. Weiter: Prop-nach-State-Synchronisation in `ApplicationModal.svelte:60-81`, ein einmaliger Permission-Read in `src/routes/settings/+page.svelte:7-9` und zwei Effects im DatePicker (`:49`, `:58`).

**Soll:** Einmalige Initialisierung läuft in `onMount` mit Teardown. Abgeleitete Werte nutzen `$derived`. Die Formularinitialisierung des Dialogs erfolgt über Initialisierer plus `{#key}` statt über einen Prop-Sync-Effect. Ein Sprachwechsel wechselt die Sprache und löst keine Boot-Pipeline aus.

### 25 — prefers-reduced-motion durchgehend respektieren

**Status:** ✅ Erledigt (siehe [#25](https://github.com/dstN/bewerby/issues/25) für den schließenden Commit und Details). Statt jede einzelne Animation/Transition individuell zu gaten (Specular-Shine-Keyframes, `modal-enter` in ApplicationModal und DatePicker, Sidebar-Grid-Transition, Hover-Transforms, Funnel-Balken-Transition — verteilt über mindestens 6 Dateien), ein einziger globaler `@media (prefers-reduced-motion: reduce)`-Block in `app.css`, der `animation-duration`/`animation-iteration-count`/`transition-duration`/`scroll-behavior` mit `!important` auf praktisch null setzt — unabhängig davon, wo die jeweilige Regel deklariert ist (globales CSS oder gescoptes Component-`<style>`), und robust gegen künftig neu hinzugefügte Animationen, die sonst leicht vergessen würden. Svelte-Transition-Direktiven (`transition:fade` o. Ä.) mussten nicht gesondert behandelt werden: eine Volltextsuche bestätigt, dass keine einzige im Code existiert — das im Ist zitierte `transition:scale` im DatePicker ist mit dem Popover-Umbau in #19 bereits entfallen.

Mit Playwright end-to-end verifiziert (8 Checks), `prefers-reduced-motion: reduce` per `page.emulateMedia()` real emuliert statt nur die CSS-Regel gelesen: `scroll-behavior` steht auf `auto`, die Sidebar-Grid-Transition, die Kanban-Karten-Transition, die Specular-Shine-`::before`-Animation, beide `modal-enter`-Animationen (ApplicationModal und DatePicker) sowie die Funnel-Balken-Transition laufen alle mit einer effektiven Dauer von `1e-05s`. Als Gegenprobe zusätzlich in einem zweiten Kontext ohne reduzierte Bewegung geprüft, dass dieselbe Sidebar-Transition dort weiterhin ihre normale Dauer (`0.25s`) hat — bestätigt, dass die Media Query gezielt wirkt und nichts global zerschossen wurde.

**Ist:** `src/app.css:191-195` respektiert die Einstellung ausschließlich für `scroll-behavior`. Alles andere ignoriert sie: die Specular-Shine-Keyframe-Animation auf farbmarkierten Karten (`src/routes/+page.svelte:625-669`), `modal-enter` (`ApplicationModal.svelte:436-442`), `transition:scale` im DatePicker (`:279`), die Grid-Transition der Sidebar (`+layout.svelte:91`), Hover-`transform`s und die Funnel-Balken-Transition.

**Soll:** Bei `prefers-reduced-motion: reduce` sind alle nicht-essenziellen Animationen und Transitions deaktiviert oder auf einen Opacity-Wechsel reduziert — inklusive der Svelte-Transitions, nicht nur der CSS-Regeln.

### 26 — i18n vervollständigen und Seitentitel differenzieren

**Status:** ✅ Erledigt (siehe [#26](https://github.com/dstN/bewerby/issues/26) für den schließenden Commit und Details). Per Volltextsuche über `aria-label="..."`, `title="..."`, `alert('...')` und `toLocaleDateString(undefined, ...)` alle verbliebenen hartcodierten Stellen gefunden und übersetzt: Spalten-Hinzufügen-Button (jetzt mit Spaltenname interpoliert), Karten-Farbmarkierungs-Tooltip, Karten-Löschen-Button (jetzt mit Firmenname interpoliert, konsistent mit dem bereits vorhandenen `changeStatus`-Muster), Sidebar-`aria-label`, Eigene-Farbe-entfernen-Button (title UND aria-label jetzt konsistent derselbe Text), Tag-Löschen-Button (jetzt mit dem tatsächlichen Tag-Namen interpoliert — ein zusätzlicher A11y-Gewinn, da mehrere Tag-Buttons vorher nicht unterscheidbar waren) und beide PDF-Fehlermeldungen. Kartendatum nutzt jetzt `i18n.locale` statt `undefined` (Browser-Default). Die im Ist zitierten `DatePicker`-Labels waren durch #19 bereits erledigt. Alle vier bis dahin titellosen Routen (Board, Analytics, Backup, Einstellungen) sowie zusätzlich `+error.svelte` haben jetzt einen eigenen `<title>` nach demselben `{Seite} · {app.name}`-Muster, das Impressum/Datenschutz bereits aus #13 nutzten.

Der Skip-Link in `app.html` liegt außerhalb des Svelte-Komponentenbaums und kann `t()` nicht direkt aufrufen; die Lösung spiegelt das bestehende Theme-FOUC-Skript. Dabei ein reales, per Playwright im Browser bestätigtes CSP-Problem gefunden, keine Vermutung: Ein zweites eigenständiges Inline-`<script>` (im `<body>`, direkt nach dem Skip-Link) wurde von SvelteKits automatischer CSP-Hash-Erkennung **nicht** erfasst und dadurch zur Laufzeit blockiert — nur das ursprüngliche `<head>`-Skript bekam einen passenden Hash in der generierten Policy. Behoben, indem beide Skripte zu einem einzigen im `<head>` zusammengeführt wurden (der nachweislich funktionierende Fall), mit einem `DOMContentLoaded`-Listener für den Skip-Link-Text, da das Element beim Ausführen des Head-Skripts noch nicht existiert.

Mit Playwright end-to-end verifiziert (18 Checks): alle sechs Routen haben unterscheidbare Titel, der Skip-Link zeigt vor dem ersten Rendern korrekt Deutsch bzw. Englisch (Locale vorab in `localStorage` gesetzt, wie beim Theme-Skript), alle elf zuvor hartcodierten Labels lösen jetzt über i18n auf (inklusive der neu interpolierten Varianten), das Kartendatum folgt der App-Sprache statt der Browsersprache, und — als gezielter Beleg für den CSP-Fund — keine CSP-Verstöße mehr in der Konsole nach dem Zusammenführen der Skripte.

**Ist:** Trotz vollständiger Übersetzungsdateien sind mehrere Strings hartcodiert deutsch: `aria-label="Hinzufügen"` und `"Löschen"` (`src/routes/+page.svelte:265`, `:331`), `title="Farbmarkierung"` (`:295`), `aria-label="Tag löschen"` und `"Farbe löschen"` sowie `title="Entfernen"` (`ApplicationModal.svelte:385`, `:338`, `:337`), `aria-label="Vorheriger Monat"`/`"Nächster Monat"` (`DatePicker.svelte:292`, `:300`), `aria-label="Navigation"` (`Sidebar.svelte:20`), die PDF-Fehlermeldung per `alert()` (`ApplicationModal.svelte:117`) und der Skip-Link in `src/app.html:32` — obwohl `a11y.skipToContent` als Key existiert. Alle vier Routen tragen denselben `<title>` „bewerby", weil er nur im Layout gesetzt wird (`+layout.svelte:24`). Kartendaten werden mit `toLocaleDateString(undefined, …)` formatiert (`+page.svelte:323`), folgen also der Browser- statt der App-Sprache.

**Soll:** Kein nutzersichtbarer oder assistiv gelesener String ist hartcodiert. Jede Route hat einen eigenen, aussagekräftigen Titel. Datums- und Zahlenformate folgen der gewählten App-Sprache.

### 27 — PDF-Verarbeitung härten

**Status:** ✅ Erledigt (siehe [#27](https://github.com/dstN/bewerby/issues/27) für den schließenden Commit und Details).

**Grenzen und Inhaltsprüfung:** Neue `validatePdfFile()`-Funktion prüft Größe (max. 15 MB) und den `%PDF-`-Magic-Header inhaltlich, bevor irgendetwas gespeichert oder geparst wird — die `accept=".pdf"`-Dateiendungsprüfung ist trivial durch Umbenennen zu umgehen, ein Inhalts-Check nicht. `extractTextFromPdf` bricht zusätzlich bei mehr als 30 Seiten ab (`MAX_PDF_PAGES`, großzügig für jedes reale Anschreiben/CV, begrenzt aber gezielt die Extraktions-Schleife gegen eine pathologische Datei) und unterscheidet jetzt gezielt zwischen passwortgeschützt (`PasswordException` von pdf.js), beschädigt/ungültig, und rein bildbasiert (leerer extrahierter Text) — jeweils eine eigene `PdfProcessingError` mit Fehlercode statt einer generischen Exception.

**Fehleranzeige:** Beide vormaligen `alert()`-Aufrufe sind durch eine übersetzte, schließbare Inline-Banner-Meldung im Dialog ersetzt (zusätzlich über den `announcer` angesagt). Erneutes Auswählen derselben Datei nach einem Fehler funktioniert jetzt auch (Datei-Input wird nach jeder Auswahl zurückgesetzt).

**Heuristik-Korrekturen** (jede einzeln mit einem eigenen Test belegt, siehe unten): Der Telefon-Regex traf zuvor auch auf Rechnungs-/Bestell-/Referenznummern gleicher Länge — behoben durch eine Kontext-Prüfung der 40 Zeichen vor dem Treffer: Schlüsselwörter wie „Rechnung", „Bestellung", „Referenz" schließen einen Treffer jetzt aus, „Tel:", „Telefon", „Kontakt" u. Ä. bestätigen ihn unabhängig von seiner Position im Dokument (spiegelt das bereits vorhandene `isHrEmail`-Muster bei E-Mails). `isCoverLetterOrCV` hatte nur informelle deutsche Job-Anzeigen-Formulierungen („deine Aufgaben") auf der Ausschlussliste, nicht die im professionellen Kontext üblichen Sie-Form-Varianten („Ihre Aufgaben", „Ihr Profil", „Wir bieten") — eine formelle Stellenausschreibung mit einer höflichen Grußformel wurde dadurch fälschlich als Bewerbungsschreiben eingestuft und die Kontaktdaten der Recruiter*in dadurch verworfen; Ausschlussliste um die fehlenden Formen (DE + EN) erweitert. `match.index || 0` zu `match.index ?? 0` präzisiert — bei genauerer Prüfung tatsächlich **kein aktiver Bug**, da der Fallback-Wert (`0`) mit dem einzigen Fall zusammenfällt, in dem `||` sich von `??` unterscheiden würde (Index tatsächlich `0`); trotzdem korrigiert, da `??` die eigentliche Absicht („nur bei fehlendem Index ersetzen") korrekt ausdrückt. Die langen Alternierungsketten gezielt mit einem Lastentest gegen katastrophales Backtracking geprüft (verdoppelte pathologische Eingabe → keine über-lineare Laufzeitzunahme) — ebenfalls **kein Befund**, da die beteiligten Zeichenklassen (Klein-/Großschreibung) sich gegenseitig ausschließen und dem Regex-Engine keine mehrdeutige Aufteilung erlauben.

**Bewusste Abgrenzung zum Soll:** Auf einen dedizierten Web Worker mit sichtbarem Fortschritt und Abbruchmöglichkeit wurde verzichtet. pdf.js lagert die eigentliche Parsing-Arbeit bereits über `GlobalWorkerOptions.workerSrc` in einen eigenen Worker aus; was auf dem Main Thread verbleibt, ist nur die Orchestrierung (Await-Punkte zwischen Seiten, kurze Item-Iterationen) — für die real zu erwartenden 1–5-seitigen Bewerbungsunterlagen nicht spürbar blockierend. Die neue 30-Seiten-Grenze deckelt das Worst-Case-Szenario direkt an der Wurzel. Ein volles Worker+Fortschritt+Abbruch-System wäre für Dokumente, die ohnehin auf wenige Seiten begrenzt sind, unverhältnismäßiger Mehraufwand gewesen. Ebenso wurden die Heuristik-Testfälle nicht als dauerhafte `.test.ts`-Dateien angelegt, da Vitest im Projekt noch nicht eingerichtet ist — das ist explizit Aufgabe von #29 („Vitest + Unit-Tests: PDF-Parser-Heuristiken, ..."); eine verfrühte Teil-Einrichtung hier hätte dem vorgegriffen. Stattdessen wurden die Korrekturen über ein Node-Testskript verifiziert, das die echte, aktuelle Funktion direkt aus der Quelldatei extrahiert (kein Copy-Paste-Risiko) und gegen gezielte Szenarien prüft.

Mit Playwright end-to-end verifiziert (12 Checks) — dafür wurden minimale, gültige Test-PDFs zur Laufzeit erzeugt (keine echten Dokumente nötig): ein PDF mit genau dem Job-Anzeige-Fehlklassifikations-Szenario lädt hoch und übernimmt Titel und Recruiter-Telefonnummer korrekt trotz „Sehr geehrte"-Text an anderer Stelle; eine als PDF benannte Nicht-PDF-Datei, eine übergroße Datei und ein 31-seitiges PDF lösen jeweils die richtige übersetzte Inline-Meldung aus; in keinem Fall erscheint ein natives `alert()`; die Fehlermeldung lässt sich schließen; erneutes Auswählen derselben Datei nach einem Fehler funktioniert. Zusätzlich mit einem eigenständigen Node-Testskript (8 Checks) gegen die Heuristik-Korrekturen selbst geprüft, inklusive der beiden „kein Befund"-Ergebnisse oben.

**Ist:** `extractTextFromPdf` (`src/lib/utils/pdf.ts:16-56`) liest die Datei vollständig in einen ArrayBuffer und iteriert alle Seiten auf dem Main Thread — ohne Größen- oder Seitenzahl-Grenze; eine sehr große Datei friert den Tab ein. Fehler landen in einem `alert()` mit hartcodiertem deutschem Text und rohem Fehlerinhalt (`ApplicationModal.svelte:115-120`). `accept=".pdf"` prüft nur die Endung, nicht den Inhalt. In den Heuristiken: der Telefon-Regex (`pdf.ts:232-241`) trifft auch Datumsbereiche, Rechnungs- und Bestellnummern; `isCoverLetterOrCV` (`:74`) klassifiziert formelle deutsche Stellenanzeigen falsch und verwirft dadurch Telefonnummer und E-Mail des Recruiters; `match.index || 0` behandelt Index 0 als falsy (`:220`, `:236`); die langen Alternationsketten sind auf Backtracking nicht geprüft.

**Soll:** Vor dem Parsen greifen Größen- und Seitenzahl-Grenzen mit klarer Meldung. Das Parsen läuft außerhalb des Main Threads, mit sichtbarem Fortschritt und Abbruchmöglichkeit. Fehler erscheinen als übersetzte Inline-Meldung statt als `alert()`; ein korruptes, verschlüsseltes oder rein bildbasiertes PDF führt zu einer verständlichen Aussage. Die Dateiart wird inhaltlich geprüft. Die Extraktionsheuristiken sind mit Testfällen belegt und in den benannten Punkten korrigiert.

### 28 — Cloud-Sync-Platzhalter ehrlich und barrierefrei machen

**Status:** ✅ Erledigt (siehe [#28](https://github.com/dstN/bewerby/issues/28) für den schließenden Commit und Details) — **damit ist Milestone 2 vollständig abgeschlossen.** Bei genauerer Prüfung enthält die Tier-3-Karte gar keine interaktiven Elemente (keine Buttons/Links in den Provider-Boxen) — `pointer-events: none` blockierte also faktisch nichts, war aber trotzdem ein irreführendes Signal. Entfernt, ebenso wie das kontrastzerstörende `opacity: 0.6` auf der ganzen Karte; stattdessen sorgen `border-style: dashed` und die bereits vorhandene `--surface-1`-Hintergrundfläche für optische Abgrenzung, ohne Text unter die Lesbarkeitsgrenze zu drücken. Weder `inert` noch `aria-disabled` kamen zum Einsatz: `inert` hätte die gesamte „das ist geplant"-Information vor assistiver Technik versteckt (das Gegenteil des Ziels), und `aria-disabled` ist laut Svelte-A11y-Linter auf der impliziten `region`-Rolle eines `<section>` nicht unterstützt und würde von echten Screenreadern auf einem Nicht-Widget-Container ohnehin nicht angesagt. Stattdessen ausschließlich auf eindeutigen, für alle Nutzenden gleichermaßen wahrnehmbaren Text gesetzt: ein neues „Geplant"-Badge neben dem bestehenden „Tier 3"-Tag, „Inaktiv" (klang nach einem existierenden, nur abgeschalteten Feature) durch dasselbe „Geplant" ersetzt, und der Hinweistext von entwicklerlastigem Jargon („OAuth-App-Zugangsdaten sind erforderlich" — klang nach einer fast fertigen Funktion, die nur noch Zugangsdaten braucht) auf eine unmissverständliche Aussage umgeschrieben, dass die Funktion für eine zukünftige Version geplant und aktuell nicht verfügbar ist.

Mit Playwright end-to-end verifiziert (16 Checks) — Karte hat volle Deckkraft und kein `pointer-events: none` mehr, beide Badges vorhanden, Provider-Status zeigt durchgängig „Geplant" statt „Inaktiv", Hinweistext erwähnt „geplant" und keinen OAuth-Jargon mehr, und die tatsächlich berechneten Kontrastwerte von Kartentitel, Provider-Namen, Provider-Status, Badge und Hinweistext liegen alle zwischen 5,9:1 und 17,9:1 — sowohl im Hell- als auch im Dunkelmodus, weit über der 4,5:1-Anforderung.

**Ist:** Die Tier-3-Karte (`src/routes/backup/+page.svelte:169-194`) zeigt „Google Drive" und „Dropbox" als ausgegrauten Platzhalter, umgesetzt über `opacity: 0.6` und `pointer-events: none` (`:342-348`). `pointer-events: none` entfernt nichts aus dem Baum assistiver Technik, und die reduzierte Deckkraft senkt den Kontrast unter jeden Grenzwert.

**Soll:** Der Platzhalter ist über `inert` bzw. `aria-disabled` korrekt als nicht verfügbar ausgezeichnet, erfüllt trotz gedämpfter Darstellung die Kontrastanforderungen und ist unmissverständlich als „geplant" gekennzeichnet — ohne den Eindruck zu erzeugen, es bestehe bereits eine Cloud-Anbindung.

---

## Milestone 3 — Final v1 Release Prep

**Ziel:** Das Erreichte gegen Regression absichern und den Release ausliefern.

| #   | Aufgabe                                                      | Labels          | Issue                                            |
| :-- | :----------------------------------------------------------- | :-------------- | :----------------------------------------------- |
| 29  | ✅ Unit-Tests für die risikoreiche Logik                     | `dx`            | [#29](https://github.com/dstN/bewerby/issues/29) |
| 30  | ✅ End-to-End-Smoketests                                     | `dx`            | [#30](https://github.com/dstN/bewerby/issues/30) |
| 31  | ✅ CI-Pipeline als Merge-Gate                                | `dx`            | [#31](https://github.com/dstN/bewerby/issues/31) |
| 32  | ✅ Dokumentation: README, Runbook, Architektur               | `documentation` | [#32](https://github.com/dstN/bewerby/issues/32) |
| 33  | ✅ Toten Code und Konfigurationsdrift entfernen              | `refactoring`   | [#33](https://github.com/dstN/bewerby/issues/33) |
| 34  | ✅ Manifest vervollständigen und Lighthouse 100 verifizieren | `performance`   | [#34](https://github.com/dstN/bewerby/issues/34) |
| 35  | ✅ Versionsstände synchronisieren und v1.0.0 releasen        | `enhancement`   | [#35](https://github.com/dstN/bewerby/issues/35) |

### 29 — Unit-Tests für die risikoreiche Logik

**Status:** ✅ Erledigt (siehe [#29](https://github.com/dstN/bewerby/issues/29) für den schließenden Commit und Details).

**Setup:** Vitest 4 eingerichtet (`vitest`/`fake-indexeddb` als permanente `devDependencies`, nicht nur temporär für die Verifikation installiert). `vite.config.ts` importiert `defineConfig` jetzt aus `vitest/config` statt `vite` (die reine `vite`-Variante kennt den `test`-Schlüssel nicht — sonst ein `svelte-check`-Fehler). `environment: 'node'`, weil keine der getesteten Logik (PDF-Heuristik, Reminder-Mathematik, Backup-Serialisierung, Analytics-Kennzahlen, Dexie-Migration) das DOM berührt — leichter und schneller als jsdom/happy-dom. `npm test` (einmalig) / `npm run test:watch` neu in `package.json`.

**PDF-Heuristik** (`src/lib/utils/pdf.test.ts`, 11 Tests): Formalisiert die Ad-hoc-Skripte aus #27 zu echten, dauerhaften Tests gegen die aktuelle Quelldatei (kein Extract-and-eval-Workaround mehr nötig). Deckt Rechnungsnummer-vs-Telefon-Unterscheidung (nah und fern vom Dokumentrand), reale „Tel:"-Extraktion, die formelle-Stellenanzeige-Fehlklassifikation, den `match.index`-0-Grenzfall, eine ReDoS-Zeitmessung und leere Eingaben ab. Dazu vier Tests für `validatePdfFile` (gültiger Header, fehlender Header, Größenlimit, korrekter Fehlertyp).

**Reminder-Mathematik** (`src/lib/utils/reminders.test.ts`, 12 Tests): `getReminderDueAt` war bereits eine reine Funktion. Deckt alle vier Intervalle, `'accepted'`/`'rejected'` → `null`, Ankerung auf den **ersten** `'sent'`-Eintrag (nicht einen späteren erneuten Versand), Fallback auf `appliedAt` und weiter auf `createdAt`, einen unbekannten Intervallwert und eine Regression ab, bei der unrelated Feldänderungen (`updatedAt`, `cardColor`) die Fälligkeit nicht verschieben.

**Analytics-Kennzahlen** (`src/lib/utils/analytics.ts` + `.test.ts`, 7 Tests): Die Trichter- und Antwortzeit-Berechnung steckte als 60+ Zeilen `$derived.by` direkt in `analytics/+page.svelte` und war ohne Svelte-Rendering-Infrastruktur nicht testbar — in eine reine, exportierte Funktion `computeApplicationStats()` extrahiert; die Route importiert sie jetzt nur noch. Deckt leere Datenmenge, unabhängige Status-Zählung, kumulative Trichter-Pipeline, gerundete Prozentwerte, Antwortzeit vom ersten `sent` zum ersten `interview`/`rejected` und eine falsch-herum sortierte Historie ab.

**Backup-Roundtrip mit PDF** (`src/lib/utils/backup.ts` + `.test.ts`, 11 Tests): Export/Import-Logik (`blobToBase64`/`base64ToBlob`/`buildBackupPayload`/`parseBackupPayload`/`prepareImportRows`) aus `backup/+page.svelte` in ein eigenes Modul extrahiert — die Route bindet nur noch UI-Belange (Dateidialog, `confirm()`, Statusmeldungen). Deckt einen bytegenauen Base64-Roundtrip, den vollständigen Export-→-JSON-→-Import-Zyklus über zwei isolierte, mit `fake-indexeddb` unterlegte `BewerbyDatabase`-Instanzen (PDF-Bytes bleiben unter einem frisch vergebenen OPFS-Ref identisch erhalten), Ablehnung bei falscher Formatversion/kaputtem JSON/ungültiger Zeile, sowie ab, dass Import nie eine ID oder einen OPFS-Ref aus der Backup-Datei wiederverwendet.

**Dexie-v1-nach-v2-Migration** (`src/lib/db/index.test.ts`, 4 Tests): `BewerbyDatabase` ist jetzt exportiert (zuvor nur die `db`-Singleton-Instanz) und der Konstruktor nimmt optional einen `name` an (Default `'bewerby-db'`), damit Tests isolierte, eindeutig benannte Instanzen öffnen können, ohne die echte Datenbank oder andere Tests zu berühren. Mit `fake-indexeddb` und einem `vi.mock()` von `$lib/utils/opfs.js`s `writePdfToOpfs` wird eine v1-only-Zeile mit `pdfBlob` gesät, dieselbe Datenbank dann über die reale Klasse (v1+v2 inkl. `.upgrade()`) geöffnet und geprüft: der Blob-Inhalt landet unversehrt (byteweise verglichen, nicht per Referenz — IndexedDB klont beim Schreiben) unter einem `pdfRef`, Zeilen ohne `pdfBlob` bleiben unangetastet, mehrere Zeilen bekommen unabhängige Refs, andere Felder bleiben unverändert.

**Bewusste Abgrenzung zum Soll:** Keine Vitest-Tests gegen echte PDF-Byte-Fixtures für `extractTextFromPdf()` selbst — die Funktion bricht per `$app/environment`-`browser`-Flag in Node sofort ab, und pdf.js' Legacy-Node-Build liefe nur mit zusätzlichen jsdom/canvas-Polyfills, deren Aufwand hier in keinem Verhältnis zum Nutzen steht: der echte Browser-Pfad ist bereits über Playwright end-to-end verifiziert (#27) und wird unter #30 systematisch erneut abgedeckt. Getestet ist stattdessen die reine, umgebungsunabhängige `parseJobDetailsFromText()`-Heuristik, die `extractTextFromPdf()` mit Text füttert — das ist exakt die Logik, die in #27 fehlerhaft war.

Verifiziert: `npx vitest run` — 45 Tests in 5 Dateien, alle grün. `npm run check` — 0 Fehler. `npm run lint` — 0 Fehler/Warnungen. `npm run build` — erfolgreich.

**Ist:** Es existiert kein Testframework und keine einzige Testdatei. Die fehleranfälligsten Teile sind völlig ungetestet: 256 Zeilen Regex-Heuristik in `src/lib/utils/pdf.ts`, die Reminder-Arithmetik in `src/lib/utils/reminders.ts`, die Trichter- und Antwortzeit-Berechnung in `src/routes/analytics/+page.svelte:9-76` und der Backup-Roundtrip.

**Soll:** Vitest ist eingerichtet. Abgedeckt sind: die PDF-Extraktionsheuristiken gegen echte Beispieldokumente (Fixtures außerhalb von `static/`, siehe Aufgabe 1), die Reminder-Fälligkeitslogik inklusive aller Intervallwerte, der Backup-Roundtrip mit PDF, die Analytics-Kennzahlen inklusive leerer Datenmenge, und die Dexie-v1-nach-v2-Migration.

### 30 — End-to-End-Smoketests

**Status:** ✅ Erledigt (siehe [#30](https://github.com/dstN/bewerby/issues/30) für den schließenden Commit und Details).

**Setup:** `@playwright/test` als permanente `devDependency`, nur Chromium (Smoketest, kein Cross-Browser-Anspruch; auf CI-Runnern ohne installiertes Edge portabler als der `channel: 'msedge'`-Ansatz früherer Ad-hoc-Verifikationen in dieser Session). `playwright.config.ts` startet als `webServer` den **echten Produktions-Einstiegspunkt** (`npm run build && node app.cjs`, dasselbe `app.cjs`, das Passenger auf Netcup startet) statt `vite preview` — SvelteKits eigene Dokumentation warnt, dass `vite preview` den Adapter-Server nicht zuverlässig nachbildet. Tests liegen unter `tests/e2e/` (nicht `e2e/`), damit sie vom generierten `.svelte-kit/tsconfig.json` automatisch mitgeprüft werden (`tests/**` ist dort vorkonfiguriert, `e2e/**` nicht) — `npm run check` deckt sie dadurch mit ab. `npm run test:e2e` neu in `package.json`. Test-PDFs entstehen zur Laufzeit über einen händisch gebauten Minimal-PDF-Generator (`tests/e2e/fixtures/make-pdf.ts`), keine Binärdatei im Repo nötig — dieselbe Technik, mit der frühere Ad-hoc-Verifikationen in #27/#28 bereits gearbeitet haben.

**5 Spec-Dateien, 8 Tests, alle grün, 2× wiederholt ohne Flakes:**

- `board-crud.spec.ts`: Bewerbung anlegen, bearbeiten, per Karten-Status-Select verschieben (die tastatur-/touchfreundliche Alternative zu HTML5-Drag-and-Drop, siehe #9) und löschen; Erstellung ohne Speichern abbrechen.
- `modal-keyboard.spec.ts`: Fokus landet beim Öffnen im Dialog, Shift+Tab/Tab wickeln am ersten/letzten fokussierbaren Element um (das manuelle Focus-Trap-Fallback aus #18), Escape ohne ungespeicherte Änderungen schließt sofort und gibt den Fokus an den auslösenden Button zurück, Escape mit ungespeicherten Änderungen fragt nach.
- `mobile-nav.spec.ts` (390×844): alle vier Routen über die Hamburger-Drawer-Navigation erreichbar, Drawer schließt nach Navigation automatisch, das Board läuft nicht horizontal über.
- `offline.spec.ts`: nach aktivem Service Worker und `context.setOffline(true)` lädt ein harter Reload (kein SPA-Routing) auf alle sechs Routen (`/`, `/analytics`, `/backup`, `/settings`, `/impressum`, `/datenschutz`) erfolgreich.
- `backup-roundtrip.spec.ts`: Bewerbung mit echtem PDF-Anhang anlegen, als JSON exportieren, über „Alle Daten unwiderruflich löschen" (#14) wirklich alles löschen, eine manipulierte Version der Exportdatei (fehlendes `tags`) wird mit der übersetzten Fehlermeldung abgelehnt und der (leere) Datenbestand bleibt unverändert, die echte Exportdatei stellt Bewerbung **und** PDF wieder her (Anzeigen-Button erscheint, belegt einen frisch vergebenen OPFS-Ref).

**Echter Bug gefunden und behoben — der Offline-Test hat genau das getan, wofür er da ist:** `service-worker.ts`s `ASSETS`-Liste (`[...build, ...files]`) enthielt nie die vorgerenderten Routendokumente selbst — `build`/`files` decken nur das Client-JS/CSS-Bundle und `static/` ab. Ein Routendokument landete dadurch nur im Cache, wenn irgendwann zuvor _online_ eine harte (Nicht-SPA-)Navigation genau dorthin erfolgte. Da SvelteKits Client-Router bei normalem Klicken in der Sidebar nie eine echte Navigation auslöst, wäre das im echten Nutzungsfluss so gut wie nie passiert — ein Nutzer, der nur zwischen Routen geklickt und dann offline neu geladen hätte, hätte auf jeder Route außer der zuletzt hart geladenen nur die Offline-Fallback-Meldung gesehen. Behoben durch eine explizite `PRERENDERED_ROUTES`-Liste (`/`, `/analytics`, `/backup`, `/settings`, `/impressum`, `/datenschutz`), die jetzt Teil von `ASSETS` ist. Betrifft rückwirkend #3/#4 (siehe Nachtrag dort) — beide blieben inhaltlich korrekt in dem, was sie taten, deckten diesen speziellen Fall aber nie ab, weil er nur mit einem echten browserbasierten Offline-Test auffällt, nicht mit Code-Review.

**Bewusste Abgrenzung:** `playwright.config.ts` selbst ist von `svelte-check` nicht erfasst (liegt weder unter `src/` noch `tests/`, und eine Erweiterung der `include`-Liste in `tsconfig.json` müsste die vom `svelte-kit sync` generierten Einträge duplizieren und würde bei jeder Regenerierung brüchig). Playwright validiert die Datei ohnehin beim Testlauf selbst; das Risiko eines unentdeckten Typfehlers dort ist gering genug, um den Wartungsaufwand nicht zu rechtfertigen.

**Ist:** Keine Browsertests. Genau die Pfade, die im Audit gebrochen waren (Offline-Reload, Mobile-Navigation, Tastaturbedienung des Dialogs, Import/Export), sind nur manuell prüfbar.

**Soll:** Playwright deckt als Smoketest ab: Bewerbung anlegen, bearbeiten, verschieben und löschen; Tastaturpfad durch den Dialog inklusive Fokusrückgabe; Erreichbarkeit aller Routen auf einem 390px-Viewport; Offline-Hard-Reload jeder Route; Export- und Import-Roundtrip mit PDF; Ablehnung einer manipulierten Importdatei bei unverändertem Datenbestand.

### 31 — CI-Pipeline als Merge-Gate

**Status:** ✅ Erledigt (siehe [#31](https://github.com/dstN/bewerby/issues/31) für den schließenden Commit und Details).

**Umsetzung:** `.github/workflows/ci.yml` läuft auf jeden Push und jeden Pull Request (ohne Branch-Einschränkung), mit `concurrency`-Gruppe (ein neuer Push auf denselben Ref bricht den vorherigen Lauf ab statt ihn auslaufen zu lassen) und `permissions: contents: read` (kein Schreibzugriff, den der Workflow nicht braucht). Reihenfolge: `npm ci` → Lint → Type-Check → Unit-Tests (Vitest) → Build → Playwright-Browser-Installation → E2E-Smoketests (#30). `npx playwright install --with-deps chromium` installiert auf dem Ubuntu-Runner zusätzlich die vom Browser benötigten System-Bibliotheken über `apt`.

**Über die Roadmap-Formulierung hinaus:** Der Soll-Text nannte nur `lint`, `check`, `test`, `build`. Die Playwright-Suite aus #30 als fünftes Gate ergänzt — eine E2E-Suite, die nicht automatisiert bei jedem Push läuft, hätte genau den Wert verloren, für den sie gebaut wurde (siehe den in #30 gefundenen Service-Worker-Precache-Bug, den nur ein echter Browser-Test aufdecken konnte).

**Echter Bug gefunden, direkt beim ersten Lauf — wieder ein Beleg dafür, dass genau diese Aufgabe nötig war:** Der erste Push schlug in `npm ci` fehl: `pdfjs-dist@6.2.108` verlangt `node >= 22.13.0 || >= 24`, die Pipeline war aber (passend zu `DEPLOYMENT.md`s Produktionsangabe „Node 20 or newer" und dem bisherigen `engines`-Feld) auf Node 20 gepinnt, und `.npmrc`s `engine-strict=true` macht daraus einen harten Fehler statt nur einer Warnung. Nachgeprüft: **schon** `pdfjs-dist@6.1.200` (die Version vor der Sicherheitsaktualisierung in #37) verlangte dieselbe Node-Version — der Konflikt existierte also bereits, seit pdf.js in einer früheren Aufgabe eingerichtet wurde, fiel aber nie auf, weil lokal niemand mit exakt Node 20 gearbeitet hat und `npm ci`/`engine-strict` bis zu diesem allerersten CI-Lauf nie unter dieser Bedingung ausgeführt wurde. Aufgelöst durch eine Trennung der beiden Anliegen, die dasselbe `engines`-Feld zuvor vermischte: `package.json`s `engines.node` auf `>=26.0.0` angehoben (auf Wunsch an die aktuelle lokale Node-Version angeglichen, komfortabel oberhalb von pdfjs-dists tatsächlichem Install-Mindestmaß `>=22.13`) und CI sowie `@types/node` (`^24` → `^26`) entsprechend mitgezogen — **ohne** die Produktionsangabe in `DEPLOYMENT.md` anzufassen, denn laut dessen eigener Verifikation läuft auf dem Server nie `npm install`; `build/handler.js` ist vollständig gebündelt und braucht nur Node-Bordmittel. `DEPLOYMENT.md` jetzt mit einer expliziten Erklärung dieser Trennung ergänzt, damit sie nicht wieder unbemerkt auseinanderdriftet.

**Lokal nicht mit `npm ci` reproduzierbar geprüft:** Unter Windows sperrte der Virenscanner wiederholt native Binärdateien (`lightningcss`, `@rollup/rollup-win32-x64-msvc`) während `npm ci`s Neuinstallation, was einmal zu einem unvollständigen `node_modules` führte (behoben durch ein reguläres `npm install`, verifiziert über erneutes `npx vitest run`/`npm run check`/`npm run build`). Dies ist ein bekanntes, plattformspezifisches npm-Verhalten unter Windows und tritt auf dem Linux-Runner der Pipeline nicht auf; der Workflow selbst (`npm ci` + die einzelnen Skripte) wurde stattdessen durch wiederholtes, erfolgreiches Ausführen jedes einzelnen zugrunde liegenden Befehls (`lint`, `check`, `test`, `build`, `test:e2e`) in dieser Session verifiziert, plus den tatsächlichen fehlgeschlagenen und danach erfolgreichen CI-Lauf selbst.

**Ist:** Kein `.github/`-Verzeichnis, keine Automatisierung. `npm run lint` ist derzeit dauerhaft rot (siehe Aufgabe 2) und würde als Gate ohnehin nichts durchlassen.

**Soll:** Ein GitHub-Actions-Workflow führt `lint`, `check`, `test` und `build` auf jeden Push und Pull Request aus und blockt bei Fehlern. Das `engines`-Feld ist ergänzt, sodass `engine-strict=true` aus `.npmrc` etwas erzwingt, und die CI läuft auf derselben Node-Version wie die Produktion.

### 32 — Dokumentation: README, Runbook, Architektur

**Status:** ✅ Erledigt (siehe [#32](https://github.com/dstN/bewerby/issues/32) für den schließenden Commit und Details).

**Umsetzung:** `README.md` komplett neu geschrieben (auf Englisch, passend zum bereits bestehenden `DEPLOYMENT.md` und für ein öffentliches Repo) — Zweck, Feature-Liste, echter Tech-Stack (Tailwind bewusst **nicht** erwähnt, da es im Projekt inzwischen vollständig entfernt ist — `grep` nach „tailwind" im gesamten `src/` findet nichts mehr), lokale Entwicklung, alle vier Test-/Lint-Befehle, Projektstruktur, Verlinkung zu `DEPLOYMENT.md`/`ARCHITECTURE.md`/`ROADMAP.md`. Neues `ARCHITECTURE.md`: wo welche Daten liegen und warum (IndexedDB für Zeilen, OPFS für PDFs, samt der v1-nach-v2-Migrationsgeschichte), warum keine Daten das Gerät verlassen können (nur drei `dependencies`, keine davon macht Netzwerk-I/O), wie das Offline-Precaching wirklich funktioniert (inklusive des in #30 gefundenen Bugs als Lehrbeispiel), die Reminder-Engine mit ihrer ehrlich benannten Grenze (funktioniert nur bei offenem Tab), die Security-Header-Kette, und die Testing-Strategie (Vitest vs. Playwright, mit Begründung wann was).

**Hinweis zur Konsolidierung:** Das Runbook ist bereits Teil von #15 entstanden (`DEPLOYMENT.md`), da sich die beiden Issues beim ursprünglichen Schreiben der Roadmap inhaltlich überschnitten hatten. #32 beschränkt sich daher auf die README-Neufassung und ein kurzes Architekturdokument; das bestehende `DEPLOYMENT.md` wird von dort aus verlinkt statt dupliziert.

**Bewusst nicht ergänzt:** Kein `LICENSE`-Feld/-File — das ist eine Rechte-Entscheidung, die dem Projektinhaber gehört, nicht mir.

**Ist:** `README.md` ist unverändert das `sv`-Scaffold-Template und beschreibt das Projekt nicht. Die Datenschutz- und Offline-Architektur ist nirgends dokumentiert.

**Soll:** Die `README.md` beschreibt Zweck, Stack, lokale Entwicklung und Projektstruktur, und verlinkt `DEPLOYMENT.md` für den Deploy-Prozess. Ein kurzes Architekturdokument hält fest, wo Daten liegen, warum sie das Gerät nicht verlassen, und wie Offline-Fähigkeit und Reminder tatsächlich funktionieren — inklusive der Grenzen.

### 33 — Toten Code und Konfigurationsdrift entfernen

**Status:** ✅ Erledigt (siehe [#33](https://github.com/dstN/bewerby/issues/33) für den schließenden Commit und Details).

**Vor der Umsetzung erneut geprüft (viel hat sich seit dem ursprünglichen Audit verändert):** Ein dedizierter Rechercheagent hat jeden der ursprünglichen Befunde gegen den _aktuellen_ Code nachgeprüft, bevor irgendetwas entfernt wurde. Ergebnis: sechs von sieben Punkten unverändert bestätigt, einer (Punkt 7, pdf.js-Typisierung) nur teilweise — siehe unten.

**Umsetzung:**

- `phosphor-svelte` per `npm uninstall` entfernt (bestätigt: kein einziger Import im gesamten `src/`).
- `$i18n`-Alias aus `vite.config.ts` entfernt (kein einziger `from '$i18n...'`-Import irgendwo).
- `skills-lock.json`: den `ui-ux-pro-max`-Eintrag entfernt, dessen Verzeichnis nirgends existiert.
- `.info-card` aus `src/routes/settings/+page.svelte`s Klassenliste entfernt (Klasse hatte ohnehin keine einzige Regel in irgendeinem Stylesheet — reiner No-op).
- **18 ungenutzte i18n-Keys** entfernt, aus `de.json`, `en.json` **und** `types.ts` gleichzeitig (Schlüsselzahl vorher/nachher programmatisch verglichen: beide Sprachdateien exakt 223 statt 241 Keys, weiterhin null Drift zwischen den Sprachen). Die ursprüngliche Liste im Ist war unvollständig — eine vollständige Gegenprüfung aller 241 Blattschlüssel gegen jede `t('...')`-Aufrufstelle im gesamten `src/` (inklusive der drei dynamischen Aufrufe mit Template-Literalen, `kanban.columns.${status}` u. Ä., die nicht mit einer einfachen Textsuche gefunden werden) förderte statt der ursprünglich sechs genannten insgesamt 18 tote Keys zutage: `nav.dashboard`, `kanban.actions.delete` (nicht zu verwechseln mit dem tatsächlich genutzten `kanban.deleteApplication`), `kanban.actions.move`, `application.createdAt`, `application.updatedAt`, `actions.confirm`, `actions.export`, `actions.import`, `actions.upload`, `theme.light`, `theme.dark`, `backup.localDump`, `backup.cloudSync`, `backup.inactive`, `backup.active`, `analytics.title`, `empty.kanban`, `a11y.skipToContent` (dessen deutscher/englischer Text zusätzlich als Literal in `app.html` dupliziert ist, weil der Skip-Link vor der i18n-Hydration existieren muss — der i18n-Key selbst bleibt trotzdem tot).
- `I18nState`s leerer Konstruktor entfernt; sein einziger Inhalt war ein Kommentar, der jetzt stattdessen direkt am `locale`-Feld steht.
- **pdf.js-Typisierung (Punkt 7): Befund bei der Nachprüfung bereits abgeschwächt, Verbesserungsversuch technisch gescheitert.** Die Nachprüfung ergab: die Ambient-Deklaration `declare module 'pdfjs-dist/build/pdf.min.mjs';` in `app.d.ts` existiert zwar noch, die einzige Verwendungsstelle (`pdf.ts`) tippt das Ergebnis aber bereits manuell auf `typeof import('pdfjs-dist')` — die pdf.js-API ist an der einzigen Stelle, an der sie genutzt wird, also bereits korrekt typisiert, nicht `any`. Ein Versuch, das sauberer zu lösen (die Ambient-Deklaration selbst so zu erweitern, dass sie die echten Typen von `pdfjs-dist` re-exportiert, `export * from 'pdfjs-dist'`) scheiterte an einer TypeScript-Eigenheit: eine Shorthand-Deklaration (`declare module 'x';` ohne Rumpf) überschreibt eine bereits real auf der Festplatte auflösbare Datei, eine Deklaration mit Rumpf dagegen nicht — sobald pdf.js' echte `.mjs`-Datei gefunden wird, wird der Rumpf einfach ignoriert und der Import bleibt implizit `any` (verifiziert: `npm run check` schlug mit genau diesem Fehler fehl, bis der Versuch zurückgerollt wurde). Die bestehende, funktionierende Lösung (`@ts-expect-error` + manueller Typ-Cast an der einzigen Aufrufstelle) bleibt bestehen, jetzt mit einem Kommentar in `app.d.ts`, der diesen Kompromiss erklärt, damit niemand denselben Umbauversuch wiederholt.

**Ist:** `phosphor-svelte` ist als Abhängigkeit deklariert, wird aber nie importiert (alle Icons sind inline-SVG). Der `$i18n`-Alias in `vite.config.ts:19` wird nie genutzt. `skills-lock.json:40-45` deklariert die Skill `ui-ux-pro-max`, deren Verzeichnis nicht existiert. Die Klasse `.info-card` wird in `src/routes/settings/+page.svelte:55` gesetzt, aber nie definiert. Mehrere i18n-Keys sind ungenutzt (u. a. `nav.dashboard`, `kanban.actions.move`, `theme.light`, `theme.dark`, `analytics.title`, `empty.kanban`). `I18nState` hat einen leeren Konstruktor mit reinem Kommentarinhalt. `app.d.ts:13` deklariert pdf.js als untypisiertes Modul, wodurch die gesamte pdf.js-API `any` ist.

**Soll:** Ungenutzte Abhängigkeiten, Aliase, CSS-Klassen und Übersetzungsschlüssel sind entfernt. `skills-lock.json` und Verzeichnisinhalt stimmen überein. pdf.js wird typisiert eingebunden statt per `any`-Deklaration.

### 34 — Manifest vervollständigen und Lighthouse 100 verifizieren

**Status:** ✅ Erledigt (siehe [#34](https://github.com/dstN/bewerby/issues/34) für den schließenden Commit und Details).

**Manifest:** `id` und `scope` ergänzt. Zwei echte Screenshots (`static/screenshots/board-wide.png` 1280×800, `board-narrow.png` 390×844) zur Laufzeit per Playwright erzeugt — vier realistische, aber synthetische Demo-Bewerbungen über die echte UI angelegt, kein reales Datenmaterial. `scripts/check-static.mjs`s Allowlist um das neue `screenshots/`-Verzeichnis erweitert (das Build-Guard aus #1 hätte den Build sonst zu Recht abgebrochen). Drei `shortcuts` ergänzt (Neue Bewerbung, Statistiken, Backup & Sync) — „Neue Bewerbung" verlinkt auf `/?new=1`, wofür `+page.svelte` einen neuen `onMount`-Handler bekommen hat, der den Parameter konsumiert, den Bewerbungs-Dialog öffnet und die URL bereinigt.

**`theme_color`/`lang`-Diskrepanz bewusst nicht „behoben":** Die Web-App-Manifest-Spezifikation kennt kein medienabhängiges `theme_color` (kein Pendant zu `app.html`s zwei `<meta name="theme-color" media="...">`-Tags) — ein statischer Wert ist eine unausweichliche Vereinfachung, kein Bug. `lang: "de"` entspricht der tatsächlichen Default-Sprache der App (letzter Fallback in `detectLocale()`) und dem Text von `name`/`description` im Manifest selbst; eine vollständig zweisprachige Manifest-Auflösung würde mehrere Manifest-Dateien plus Laufzeit-Umschaltung des `<link rel="manifest">`-Tags erfordern — Aufwand, der in keinem Verhältnis zum Nutzen steht, zumal `name`/`short_name` ohnehin sprachneutral sind.

**Echter Bug beim Bauen der `?new=1`-Funktion gefunden:** `replaceState()` synchron im selben `onMount()`-Aufruf wie das Öffnen des Dialogs abzusetzen, brachte das Rendering zum Absturz (`Cannot read properties of undefined (reading '$set')`, aufgefangen von der Fehlergrenze aus #4) — unabhängig von der Reihenfolge der beiden Aufrufe. Ursache: eine reentrante State-Aktualisierung, während der initiale Mount-/Hydration-Zyklus der Seite noch nicht abgeschlossen ist. Behoben, indem `replaceState()` per `queueMicrotask()` auf den nächsten Tick verschoben wird. Mit einem neuen Playwright-Test in `board-crud.spec.ts` abgesichert, der genau dieses Szenario abdeckt (nicht nur, dass der Dialog aufgeht, sondern auch, dass die URL hinterher bereinigt ist).

**Lighthouse (Desktop-Preset, alle vier Routen, `node app.cjs` gegen den echten Produktions-Build):** Vorher `/settings` 100/**96**/100/100 (die anderen drei Routen bereits 100/100/100/100). Der 96er-Accessibility-Fund war ein echter `color-contrast`-Verstoß: `.export-hint-link` und `.privacy-link` in `src/routes/settings/+page.svelte` nutzten `--color-accent-600` direkt als Textfarbe — genau das Muster, das #17 bereits für andere Stellen behoben und dafür den eigenen `--color-accent-text`-Token eingeführt hatte (`--color-accent-600` erreicht als Text nur auf hellem Untergrund 4,5:1). Eine gezielte Suche nach demselben Muster im gesamten `src/` fand eine dritte, bis dahin ungetestete Stelle: `.total-val` in `src/routes/analytics/+page.svelte`, sichtbar nur mit vorhandenen Bewerbungsdaten (bei leerer Datenbank rendert diese Sektion gar nicht — der ursprüngliche Lighthouse-Lauf gegen die leere Datenbank hätte sie nie erreicht). Alle drei auf `--color-accent-text` umgestellt. Nach der Korrektur: **alle vier Routen 100/100/100/100.**

**axe-core (inkl. geöffnetem Dialog) — zwei weitere echte, von Lighthouse nicht erfasste Befunde:** (1) Der Sprachumschalter-Button (`+layout.svelte`) hatte `aria-label="Sprache wechseln"`, sichtbarer Text aber nur „DE"/„EN" — ein WCAG-2.5.3-„Label in Name"-Verstoß, da der sichtbare Text nicht im Accessible Name enthalten war (relevant für Sprachsteuerungs-Nutzer, die z. B. „klicke DE" sagen). Behoben durch ein zusammengesetztes `aria-label` (`"DE – Sprache wechseln"`). (2) Der versteckte `<input type="color">` für eigene Kartenfarben (`ApplicationModal.svelte`) steckt in einem `<label>`, das nur ein dekoratives, `aria-hidden`-SVG-Icon enthält — der implizite Name daraus ist leer, das `title`-Attribut auf dem `<label>` zählt nicht als Ersatz. Behoben durch ein explizites `aria-label` direkt auf dem `<input>`. Ein einzelner, augenscheinlicher `.btn-flat`-Kontrastbefund erwies sich beim zweifachen Reproduktionsversuch als nicht reproduzierbar (vermutlich ein Messzeitpunkt mitten in der Öffnungs-Animation des Dialogs, `animation: modal-enter`) — zweimal in Folge 0 Verstöße bestätigt, kein Fix nötig. **Alle vier Routen und der geöffnete Dialog: 0 axe-Verstöße.**

**Bewusste Abgrenzung:** Kein permanentes Lighthouse-/axe-Tooling in `package.json`/CI ergänzt — beide liefen als temporäre `--no-save`-Installationen ausschließlich für diese einmalige v1-Verifikation, danach deinstalliert, dem in dieser Session etablierten Muster für Ad-hoc-Werkzeuge folgend. Ein Lighthouse-Lauf gegen mit Daten befüllte Routen (statt der leeren Standard-Datenbank) scheiterte technisch an der Kombination aus Playwrights eigenem CDP-Kanal und Lighthouses `--port`-Anbindung an dieselbe Chrome-Instanz („Target closed"); die dadurch verdeckte Lücke (das analytics-`.total-val`-Element) wurde stattdessen über eine gezielte Grep-Suche nach demselben Fehlermuster im gesamten `src/` gefunden — nach eigener Einschätzung gründlicher als ein einzelner Lighthouse-Lauf gegen einen bestimmten Datenzustand, da es unabhängig vom Render-Zustand jede statische Deklaration erfasst.

**Ursprüngliches Ist:** `static/manifest.json` fehlen `id`, `scope`, `screenshots` und `shortcuts`; `lang` ist fest auf `de`, obwohl die App zweisprachig ist. `src/app.html:6-7` deklariert zwei `theme-color`-Werte (`#ffffff` light, `#2563eb` dark), das Manifest nur `#2563eb`. Ein Lighthouse-Lauf mit 100 in allen vier Kategorien ist nie belegt worden.

**Soll:** Das Manifest ist vollständig und installierbar, mit `id`, `scope`, Screenshots und passenden `theme-color`-Werten. Ein dokumentierter Lighthouse-Lauf (mobil, Inkognito) erreicht auf allen vier Routen 100 in Performance, Accessibility, Best Practices und SEO; axe-DevTools meldet null Verstöße, auch im geöffneten Dialog.

### 35 — Versionsstände synchronisieren und v1.0.0 releasen

**Status:** ✅ Erledigt (siehe [#35](https://github.com/dstN/bewerby/issues/35) für den schließenden Commit und Details). `package.json`/`package-lock.json` auf `1.0.0`, als Git-Tag `v1.0.0` und GitHub-Release veröffentlicht. Alle 39 Aufgaben dieser Roadmap (Milestones 1–3 sowie die zusätzlichen, während des ersten Live-Deploys gefundenen Punkte #15-Nachtrag/#38/#39) sind zu diesem Zeitpunkt abgeschlossen und gegen die echte bewerby.de-Instanz verifiziert — inklusive des Fixes für die live entdeckte `.htaccess`-Passenger-Direktive und die `/icons/`-Alias-Kollision, die vor diesem Release nicht bekannt sein konnten, da noch nie zuvor gegen den echten Host deployt worden war.

**Ist:** `src/lib/components/layout/Sidebar.svelte:79` zeigte ein hartcodiertes `v0.0.1`, das unabhängig von `package.json` driftete.

**Soll:** Die angezeigte Version stammt aus einer einzigen Quelle. `package.json` steht auf `1.0.0`, der Release ist getaggt, und alle Verifikationsschritte dieser Roadmap sind nachweislich erfüllt.

---

## Milestone 4 — Onboarding & Bewerbungsunterlagen (v1.2.0)

Drei Lücken, die im Alltag zusammenhängen: es gibt keinen erklärten Einstieg, der Prozess endet vor der eigentlichen Bewerbung, und der Stellenanzeigen-Parser liefert bei echten Ausdrucken zu oft Falsches statt Leeres. Die Einzelbelege stehen in den Issues; #48 enthält eine gemessene Auswertung gegen fünf reale Anzeigen.

| #   | Aufgabe                                                                                   | Labels                       | Issue                                            |
| :-- | :---------------------------------------------------------------------------------------- | :--------------------------- | :----------------------------------------------- |
| 42  | ✅ Landing-/Onboarding-Seite einführen, Board nach `/board` verschieben                   | `enhancement` `a11y`         | [#42](https://github.com/dstN/bewerby/issues/42) |
| 43  | ✅ Epic: Bewerbungsunterlagen — Lebenslauf, Anschreiben und Export                        | `enhancement` `architecture` | [#43](https://github.com/dstN/bewerby/issues/43) |
| 44  | ✅ Profil und globaler Lebenslauf (Einstellungen, OPFS, Backup)                           | `enhancement` `dsgvo`        | [#44](https://github.com/dstN/bewerby/issues/44) |
| 45  | ✅ Anschreiben-Editor (Markdown mit Live-Vorschau und Vorlage)                            | `enhancement` `a11y`         | [#45](https://github.com/dstN/bewerby/issues/45) |
| 46  | ✅ Anschreiben-PDF erzeugen und mit dem Lebenslauf zusammenführen                         | `enhancement`                | [#46](https://github.com/dstN/bewerby/issues/46) |
| 47  | ✅ Versand-Dialog: gemeinsame oder getrennte Dateien, mailto, Web Share                   | `enhancement` `a11y`         | [#47](https://github.com/dstN/bewerby/issues/47) |
| 48  | ✅ Stellenanzeigen-Parser quellen- und branchenunabhängig machen (Layout statt Vokabular) | `enhancement` `dx`           | [#48](https://github.com/dstN/bewerby/issues/48) |

Reihenfolge der Umsetzung: #48, dann #42, dann #44 → #45 → #46 → #47. #48 steht vorn, weil es unabhängig ist, sofort messbar und die Felder `location`/`referenceNumber` liefert, die #44 ohnehin braucht. #42 folgt früh, weil der Routenumzug jeden E2E-Spec anfasst — spätere Arbeit soll nicht gegen bewegte Pfade geschrieben werden.

### 42 — Landing-/Onboarding-Seite einführen, Board nach `/board` verschieben

**Status:** ✅ Erledigt in [87fa874](https://github.com/dstN/bewerby/commit/87fa874) (#42, geschlossen).

**Ist:** `/` rendert unmittelbar das Kanban-Board (`src/routes/+page.svelte`). Wer bewerby.de zum ersten Mal öffnet, sieht fünf leere Spalten ohne jede Erklärung — weder was das Werkzeug tut, noch dass die Daten das Gerät nicht verlassen. `src/lib/components/layout/Sidebar.svelte:12-17` kennt nur Board, Statistiken, Backup und Einstellungen.

**Soll:** `/` ist eine kurze, erklärende Einstiegsseite in DE und EN; das Board liegt auf `/board`. Der Umzug berührt `static/manifest.json` (`start_url` und Shortcuts), `PRERENDERED_ROUTES` in `src/service-worker.ts:20-29`, die Sidebar-Navigation und jeden E2E-Spec, der über `goto('/')` aufs Board navigiert. `/` bleibt gültig, es entsteht kein 404.

Die Seite bleibt auf eine Bildschirmhöhe beschränkt: Überschrift, ein Satz Lead, drei nummerierte Schritte, eine Faktenzeile, ein CTA und ein kurzer Block dazu, wo die Daten liegen. Der Text ist im Issue wörtlich festgehalten, zusammen mit sprachlichen Leitplanken gegen Werbefloskeln und die typischen Anzeichen KI-generierter Texte. Barrierefreiheit wie überall sonst: genau ein `<h1>`, Abschnitte mit `aria-labelledby`, Farben ausschließlich aus den Tokens in `src/app.css`.

**Bewusst offen:** kein Auto-Redirect und kein Erstbesuchs-Flag. Wiederkehrer klicken einmal; die installierte PWA startet über `start_url` ohnehin direkt auf `/board`.

### 43 — Epic: Bewerbungsunterlagen — Lebenslauf, Anschreiben und Export

**Status:** ✅ Erledigt über #44–#47 (geschlossen).

**Ist:** Die App verwaltet Metadaten zur Bewerbung, aber die Bewerbung selbst entsteht vollständig außerhalb. `contactEmail` wird gespeichert (`src/lib/db/index.ts:16`) und gepflegt (`ApplicationModal.svelte:544-552`), danach nie wieder verwendet: kein `mailto:` für eine Bewerbung, keine PDF-Erzeugung, kein Editor. Das angehängte PDF ist die Stellenanzeige, nicht die eigene Bewerbung.

**Soll:** Aus einer Karte heraus entsteht ein Anschreiben, wird mit dem Lebenslauf zu einer versandfertigen PDF verbunden und an den Mailclient übergeben — komplett lokal. Aufgeteilt in #44 bis #47, strikt in dieser Reihenfolge.

Zwei Entscheidungen sind bewusst gegen die naheliegende Variante gefallen. Erstens **kein TipTap**: ein ProseMirror-`contenteditable` ist genau die Komponente, die die Prüfkette aus `tests/e2e/a11y.spec.ts` (WCAG 2.2 AAA plus axe `best-practice`, alle Routen, beide Themes, 390 px) realistisch nicht sauber besteht, und es wären rund 200 KB in einem Projekt mit bisher zwei Runtime-Dependencies. Stattdessen ein natives `<textarea>` mit Markdown und Live-Vorschau. Zweitens **kein Versand-Backend**: das würde `ARCHITECTURE.md:14-36` und die Datenschutzerklärung brechen und einen neuen Eintrag in `connect-src` (`vite.config.ts:54`) erzwingen.

**Einschränkung, die im UI benannt wird:** `mailto:` kann keine Anhänge tragen. RFC 6068 kennt keinen Attachment-Parameter, kein Mailclient unterstützt einen. Der Mail-Knopf füllt Empfänger, Betreff und Anschreiben-Klartext vor, die Datei hängt der Nutzer selbst an; auf Geräten mit Web Share Level 2 reicht ein zusätzlicher Knopf die PDF direkt an die Mail-App weiter.

### 44 — Profil und globaler Lebenslauf (Einstellungen, OPFS, Backup)

**Status:** ✅ Erledigt in [900152b](https://github.com/dstN/bewerby/commit/900152b) (#44, geschlossen). Abweichung vom Entwurf: die Profil-Validierung liegt in einem reinen Modul (`src/lib/utils/profile.ts`) neben dem Runes-Store, damit der Backup-Serializer und dessen Tests in der DOM-freien node-Umgebung sie nutzen können, ohne eine `.svelte.ts` zu importieren.

**Ist:** Es gibt keinen Ort für den eigenen Lebenslauf. `src/lib/utils/opfs.ts` verwaltet ausschließlich die angehängte Stellenanzeige, und `Application` (`src/lib/db/index.ts:9-32`) kennt nur `pdfName`/`pdfRef` für ebendiese. Absenderdaten für einen Briefkopf existieren nirgends.

**Soll:** Ein Lebenslauf wird einmal in den Einstellungen hinterlegt und pro Bewerbung optional überschrieben; ist `cvRef` leer, gilt der globale. Die neuen Felder an `Application` sind alle optional und nicht indiziert, damit `APPLICATIONS_SCHEMA` unverändert bleibt und **keine neue Dexie-Version** fällig wird.

**Fallstrick, der sonst Daten löscht:** `cleanupOrphanedPdfsOnStartup()` in `src/routes/+layout.svelte:65-71` baut `validRefs` ausschließlich aus `app.pdfRef` — ohne Anpassung löscht der nächste App-Start den globalen Lebenslauf und jeden pro Bewerbung hinterlegten CV. `validRefs` muss `cvRef` und `profile.cvRef` mit aufnehmen, und `profile.init()` muss vor dem Cleanup laufen.

`BACKUP_FORMAT_VERSION` steigt auf 3, aber `parseBackupPayload` (`src/lib/utils/backup.ts:57-89`) muss **2 und 3 akzeptieren** statt wie bisher hart auf die aktuelle Zahl zu prüfen — sonst werden alle bereits exportierten Backups unlesbar. Die Datenschutzerklärung wird um Lebenslauf und Absenderdaten ergänzt.

### 45 — Anschreiben-Editor (Markdown mit Live-Vorschau und Vorlage)

**Status:** ✅ Erledigt in [ce4d73d](https://github.com/dstN/bewerby/commit/ce4d73d) (#45, geschlossen). Abweichung vom Entwurf: die Platzhalter der Vorlage heißen in beiden Sprachen gleich (`{{title}}`, `{{company}}`, …). Sprachspezifische Namen ließen sich vom Locale-Guardrail nicht von einem echten Übersetzungsfehler unterscheiden; die deutschen Aliasse (`{{firma}}`, `{{titel}}`, …) bleiben in `applyTemplate` unterstützt.

**Ist:** Es gibt kein Feld und keine Oberfläche für ein Anschreiben. `notes` (`src/lib/db/index.ts:18`) ist ein Notizfeld, kein Dokument.

**Soll:** Ein natives `<textarea>` mit Markdown, einer Toolbar, die über `selectionStart`/`selectionEnd` Auszeichnung einfügt statt DOM zu manipulieren, und einer Vorschau ohne `aria-live`. Dazu ein eigenes, abhängigkeitsfreies Markdown-Modul (`src/lib/utils/markdown.ts`) mit HTML-Escaping vor der Formatierung, das zugleich den Klartext für `mailto:` und die Blöcke für den PDF-Renderer liefert. Eine Vorlage mit Platzhaltern für Firma, Titel, Ansprechpartner, Anrede, Ort, Datum und Referenznummer füllt sich aus genau den Feldern, die der Parser aus #48 ohnehin schon liefert.

### 46 — Anschreiben-PDF erzeugen und mit dem Lebenslauf zusammenführen

**Status:** ✅ Erledigt in [2daf830](https://github.com/dstN/bewerby/commit/2daf830) (#46, geschlossen). Bestätigt: Schrift ist Helvetica, nicht Lexend (fontkit liest kein woff2). Zusätzlich nötig geworden: nicht in WinAnsi kodierbare Zeichen werden verworfen, sonst hätte ein einzelnes Emoji den gesamten Export scheitern lassen.

**Ist:** Es gibt keinerlei PDF-Erzeugung. `pdfjs-dist` wird ausschließlich lesend verwendet; der einzige PDF-Schreiber im Repo ist der Testhelfer `tests/e2e/fixtures/make-pdf.ts`, der nie ausgeliefert wird.

**Soll:** `pdf-lib` rendert das Anschreiben auf A4 nach einem an DIN 5008 angelehnten Aufbau und kopiert per `PDFDocument.copyPages` die Seiten des Lebenslaufs dazu. **Dynamisch importiert** nach dem Muster von `src/lib/utils/pdf.ts:67`, sonst wachsen Startbundle und Service-Worker-Precache um rund 350 KB für eine Funktion, die die meisten Sitzungen nie aufrufen. Fehlerfälle nutzen die vorhandenen `PdfProcessingError`-Codes und deren i18n-Schlüssel weiter.

**Bewusste Einschränkung:** die PDF setzt in Helvetica, nicht in Lexend. WinAnsi deckt Umlaute und ß ab, das Ergebnis ist korrekt, nur nicht markengleich. Lexend einzubetten bräuchte `@pdf-lib/fontkit` und eine TTF; im Repo liegen ausschließlich `.woff2`, die fontkit nicht liest.

### 47 — Versand-Dialog: gemeinsame oder getrennte Dateien, mailto, Web Share

**Status:** ✅ Erledigt in [2daf830](https://github.com/dstN/bewerby/commit/2daf830) (#47, geschlossen).

**Ist:** `contactEmail` führt nirgendwohin. Auf der Karte (`src/routes/+page.svelte:393-470`) taucht die Adresse nicht auf, und es gibt keinen Weg von einer Bewerbung zu einer E-Mail.

**Soll:** Ein eigener `<dialog>` mit drei Abschnitten — Lebenslauf, Anschreiben, Ausgabe. Die Ausgabe ist wählbar zwischen einer gemeinsamen PDF und getrennten Dateien; manche Arbeitgeber verlangen das eine, manche das andere. Aktionen: Herunterladen, E-Mail öffnen und, wo `navigator.canShare({ files })` es hergibt, Teilen.

Bewusst ein eigener Dialog statt eines weiteren Abschnitts in `ApplicationModal.svelte`: die Datei hat bereits 1284 Zeilen und einen handgebauten Fokus-Trap (#18). Ein zweiter Dialog nach demselben Muster ist billiger als eine weitere Ebene darin und separat prüfbar.

`buildMailtoUrl` bekommt einen Längenschutz: überschreitet die kodierte URL rund 1900 Zeichen, wird der Body gekürzt und stattdessen das Kopieren in die Zwischenablage angeboten — Outlook unter Windows schneidet lange `mailto:` still ab, ohne Fehlermeldung.

### 48 — Stellenanzeigen-Parser quellen- und branchenunabhängig machen (Layout statt Vokabular)

**Status:** ✅ Erledigt in [ca8af0d](https://github.com/dstN/bewerby/commit/ca8af0d) (#48, geschlossen). Abweichung vom Entwurf: die Quellprofil-Registry wurde **nicht** gebaut. Der generische Pfad löst alle fünf Anzeigen, ein Profil hätte nichts beigetragen. Zwei Befunde kamen erst aus der Messung: `AB` (schwedische Rechtsform) matchte case-insensitiv „ab sofort" und meldete das Eintrittsdatum als Arbeitgeber; und die Boilerplate-Erkennung löschte den Firmennamen, weil Jobbörsen ihn in jeden Seitenkopf drucken — Wiederholung muss mit Randlage zusammenfallen.

**Ist:** `parseJobDetailsFromText` (`src/lib/utils/pdf.ts:130-483`) wurde gegen fünf reale Anzeigen gemessen — vier Ausdrucke der Arbeitsagentur-Jobsuche, einer von fenecon.de, alle über Chrome „Als PDF drucken" erzeugt. Ergebnis: **0/5 Ansprechpartner, 0/5 Gehälter, 0/5 Orte, 2/5 falsche Telefonnummern, 1/5 komplett unbrauchbare Kopfdaten.** Bei fenecon liefert der Parser `company` = `F R O N T E N D` und `title` = `( M / W / D )`, weil die Überschrift gesperrt gesetzt ist und jedes Zeichen ein eigenes Textitem bildet. Bei zwei BA-Anzeigen landet die Referenznummer als Telefonnummer im Feld, weil `nonPhoneContextRegex` (`src/lib/utils/pdf.ts:441`) den Bindestrich in `Referenz-Nr.:` nicht abdeckt.

Die Ursache liegt tiefer als die Einzelfehler: der Parser sucht über **Vokabular** statt über Struktur. Der Titel wird aus einer fest verdrahteten Liste von 33 Rollenbegriffen abgeleitet (`src/lib/utils/pdf.ts:357-390`), die praktisch durchweg IT und Technik abdecken — eine Pflegefachkraft, ein Bäckereifachverkäufer, eine Steuerfachangestellte bekommen damit **niemals** einen Titel. Verschärfend füllt das Autofill nur leere Felder (`ApplicationModal.svelte:257-263`) und meldet nichts: ein falscher Wert gewinnt gegen einen leeren, und der Nutzer erfährt es nicht.

**Soll:** Nur Signale, die weder eine bestimmte Quelle noch eine bestimmte Branche voraussetzen. `extractTextFromPdf` liefert dafür kein flaches Textstück mehr, sondern ein strukturiertes Dokument mit Seite, Y-Position, Schriftgröße und Fettung je Zeile; `text` bleibt für bestehende Aufrufer erhalten.

Tragend ist die Typografie. Der Jobtitel ist in **5/5** Testdateien exakt die größte Schrift auf Seite 1 — auch bei fenecon, wo jede Textheuristik versagt —, die Firma in 4/5 die zweitgrößte Zeile im Kopfbereich. Das ist eine typografische Invariante und keine Domänenregel: eine Stellenanzeige setzt den Jobtitel als Überschrift, im Klinikum wie im Softwarehaus. Diese Daten wirft der Code heute weg, `src/lib/utils/pdf.ts:103` liest aus `item.transform` nur `[5]` für Zeilenumbrüche. Nebenbei lösen sich zwei Altlasten auf: gruppiert man Zeilen gleicher Größe mit benachbartem Y zu einem Block, ist der am Umbruch abgeschnittene NGB-Titel wieder vollständig und der gesperrte fenecon-Satz wieder zusammenhängend.

Darunter drei weitere quellenunabhängige Signale: ein Label-Wörterbuch für beschriftete Schlüssel-Wert-Blöcke (gemessen 4/5 Ort, 3/5 E-Mail, 2/5 Telefon — inklusive fenecon, also quer über zwei ganz verschiedene Layouts), die Geschlechtskennzeichnung `(m/w/d)` samt Varianten als branchenübergreifend verlässlichster Titelmarker, und Struktursätze wie „Zum nächstmöglichen Zeitpunkt suchen wir eine/n", deren Folgezeile der Titel ist. Die Firma wird zusätzlich über E-Mail-Domain, Chrome-Dateinamen und Rechtsform gegengeprüft; letztere muss über den gewerblichen Bereich hinaus (`gGmbH`, `e.V.`, `AöR`, `Stiftung`, `Stadt`, `Landkreis`), sonst fällt der gesamte öffentliche und soziale Sektor durch. **Die 33-Begriffe-Rollenliste entfällt ersatzlos.**

Dazu die Sicherheitsregel **leer schlägt falsch**: ein Feld bleibt lieber leer, als einen unsicheren Wert zu tragen. Der Firmen-Fallback 2 (`src/lib/utils/pdf.ts:294-306`), der blind Zeile 1 nimmt und genau den fenecon-Fall erzeugt, wird gelöscht statt nachgebessert. Übernommen wird nur noch über eine Sichtprüfung mit Checkbox je erkanntem Feld, vorausgewählt nur bei leerem Ziel und hoher Konfidenz.

**Abgrenzung zu einem Quellprofil:** ein Profil für die BA-Jobsuche würde vier der fünf Testdateien lösen und trotzdem nichts über die Belastbarkeit aussagen — die Stichprobe ist schief (4 von 5 aus einer Quelle, 5 von 5 aus der IT). Die Profil-Registry bleibt deshalb optionale Feinjustierung, und es gilt die Testregel: **jedes Fixture muss den generischen Pfad mit deaktivierter Registry bestehen.** Ein Profil darf ein Ergebnis verbessern, nie Voraussetzung für einen grünen Test sein.

Fixtures werden als **pseudonymisiertes Zeilenmodell** eingecheckt (JSON mit Seite, Y, Schriftgröße, Fettung, Text) — die Layoutschicht braucht Geometrie, reiner Text reicht nicht mehr, und die Linie „kein Binärfixture im Repo" (`tests/e2e/fixtures/make-pdf.ts`) bleibt trotzdem erhalten. Dazu Negativtests: eine Rechnung, ein Lebenslauf, ein leerer Textlayer müssen leere Felder liefern, nicht plausibel aussehende falsche.

**Ehrliche Grenzen:** eingescannte Anzeigen ohne Textlayer scheitern weiterhin sauber mit `no-text` (`src/lib/utils/pdf.ts:117-122`); OCR würde rund 10 MB WASM in eine Offline-App ziehen und ist **bewusst kein Ziel**, die Fehlermeldung soll stattdessen klar zum manuellen Ausfüllen führen. Bei gleichmäßiger Typografie entwertet sich die Layoutschicht und die Label- und Musterschicht übernimmt mit niedrigerer Konfidenz.

**Bewusst nicht:** ein Web Worker mit Fortschritt und Abbruch für die Extraktion. Das ist unter #27 bereits als Abgrenzung dokumentiert und ändert sich hier nicht.
---

## Milestone 5 — E2E-verschlüsselte Mehrgeräte-Synchronisation (ab v1.6.0)

Setzt die beiden Backlog-Epics #36 (verschlüsselte Cloud-Ablage) und #41 (Live-Sync von Gerät zu Gerät) gemeinsam um. Es gibt ein Datenmodell (Yjs-CRDT) und drei Transportwege: Cloud-Anbieter, WebRTC direkt zwischen den Geräten und eine verschlüsselte Datei. Ver- und entschlüsselt wird ausschließlich im Browser. Anbieter, bewerby.de, das Signaling und STUN sehen nie Klartext oder Schlüssel. Bedrohungsmodell, Krypto-Design, Anbieterwahl und was Dustin vorab liefern muss: [Plan](docs/e2e-sync-plan.md).

| #   | Aufgabe                                                                                                                                              | Labels                                          | Issue                                            |
| :-- | :--------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------- | :----------------------------------------------- |
| 49  | Sync-Vorarbeiten: Anbieter-Prototypen, Passenger-Signaling, Argon2-Kalibrierung                                                                      | `dx` `architecture`                             | [#49](https://github.com/dstN/bewerby/issues/49) |
| 50  | ✅ Krypto-Kern und verschlüsselte Sicherungsdatei (.bwv)                                                                                             | `enhancement` `security` `dsgvo` `a11y`         | [#50](https://github.com/dstN/bewerby/issues/50) |
| 51  | ✅ Repository-Schicht: alle Schreibzugriffe über `src/lib/data`                                                                                      | `refactoring` `architecture`                    | [#51](https://github.com/dstN/bewerby/issues/51) |
| 52  | ✅ CRDT-Schicht mit Yjs: verlustfreies Zusammenführen                                                                                                | `enhancement` `architecture`                    | [#52](https://github.com/dstN/bewerby/issues/52) |
| 53  | 🟡 Cloud-Transport, Ordner-Adapter und Dropbox (Dropbox wartet auf #49)                                                                              | `enhancement` `security` `dsgvo`                | [#53](https://github.com/dstN/bewerby/issues/53) |
| 54  | 🟡 OneDrive und Google Drive (Token-Broker) (Code fertig; beide vorerst ohne App-Registrierung und daher ausgeblendet, Sync über Dropbox und Ordner) | `enhancement` `security` `dsgvo`                | [#54](https://github.com/dstN/bewerby/issues/54) |
| 55  | 🟡 Live-Sync von Gerät zu Gerät per WebRTC und QR-Pairing (Produktion wartet auf #49)                                                                | `enhancement` `security` `dsgvo` `architecture` | [#55](https://github.com/dstN/bewerby/issues/55) |
| 56  | ✅ Schlüsselwechsel (Passwort ändern, Geräte ausschließen) und Löschrecht für Sync (v1.11.0)                                                         | `enhancement` `security` `dsgvo`                | [#56](https://github.com/dstN/bewerby/issues/56) |
| 58  | ✅ Verschlüsselte Sync-Ablage auf bewerby.de; Koppeln gibt den Speicherort weiter (v1.12.0)                                                          | `enhancement` `security` `dsgvo` `architecture` | [#58](https://github.com/dstN/bewerby/issues/58) |
| 57  | Weitere Sync-Anbieter (S3-kompatibel, pCloud) und Härtung                                                                                            | `enhancement` `security` `dx`                   | [#57](https://github.com/dstN/bewerby/issues/57) |

Reihenfolge der Umsetzung:

- **#50 und #51 zuerst**, weil sie nichts von außen brauchen: keine Registrierung, keine Server-Änderung. Ab #50 lässt sich über die Dateien-App in iCloud sichern.
- **#49 parallel, sobald die Registrierungen da sind**, und muss vor #53 abgeschlossen sein.
- **Danach der Reihe nach:** #52 → #53 → #54 → #55 → #56. #57 folgt nach Bedarf.

Getroffene Entscheidungen (2026-10-01):

- Umfang: echte Synchronisation statt nur Sicherung
- Anbieter: Dropbox, OneDrive und Google Drive, Google über einen Token-Broker auf bewerby.de
- iCloud über die Dateien-App, kein CloudKit
- Zusammenführen mit Yjs
- Passwort-Ableitung mit Argon2id über `hash-wasm`
- Infrastruktur nur bewerby.de, kein TURN

## Nach v1 (Backlog, ohne Milestone)

| #   | Aufgabe                                                      | Labels                               | Issue                                            |
| :-- | :----------------------------------------------------------- | :----------------------------------- | :----------------------------------------------- |
| 36  | Epic: Ende-zu-Ende-verschlüsselter Cloud-Sync                | `enhancement`                        | [#36](https://github.com/dstN/bewerby/issues/36) |
| 38  | ✅ Open Graph / Twitter Card Meta-Tags                       | `enhancement`                        | [#38](https://github.com/dstN/bewerby/issues/38) |
| 39  | ✅ PWA-Icons 404 live (`/icons/`-Alias-Kollision)            | `bug`                                | [#39](https://github.com/dstN/bewerby/issues/39) |
| 40  | Epic: Opt-in Web-Push-Erinnerungen bei geschlossenem Browser | `enhancement` `architecture` `dsgvo` | [#40](https://github.com/dstN/bewerby/issues/40) |
| 41  | Epic: Live-P2P-Sync per QR-Pairing (WebRTC + CRDT)           | `enhancement` `architecture` `dsgvo` | [#41](https://github.com/dstN/bewerby/issues/41) |

### 36 — Epic: Ende-zu-Ende-verschlüsselter Cloud-Sync

**Status:** Wird gemeinsam mit #36/#41 in Milestone 5 umgesetzt (#49–#57).

**Ist:** Die Tier-3-Karte auf der Backup-Seite kündigt Google-Drive- und Dropbox-Synchronisation an, ohne dass eine Implementierung existiert.

**Soll:** Ein echter Synchronisationsweg, bei dem Daten das Gerät ausschließlich clientseitig verschlüsselt verlassen (WebCrypto, Zero-Knowledge gegenüber dem Anbieter). Braucht ein eigenes Krypto- und Schlüsselverwaltungskonzept — inklusive Antwort darauf, was bei Schlüsselverlust passiert — und wird deshalb bewusst nach v1 gelegt, um den Release nicht zu blockieren.

Ein Vorschlag aus dieser Phase, das Ganze stattdessen per QR-Code zwischen zwei Browsern zu spiegeln, scheidet als Transportweg aus: ein QR-Code fasst realistisch nur wenige KB, IndexedDB-Zeilen mit angehängten PDFs sprengen das schon bei einer einzigen Bewerbung, und "immer gespiegelt" verlangt ohnehin einen fortlaufenden Kanal zwischen den Geräten (auch WebRTC braucht für den initialen Handshake einen Signaling-Server), nicht nur einen einmaligen Datentransfer. Läuft auf dasselbe Problem hinaus, das dieses Epic lösen soll.

### 38 — Open Graph / Twitter Card Meta-Tags

**Status:** ✅ Erledigt (siehe [#38](https://github.com/dstN/bewerby/issues/38) für den schließenden Commit und Details). `src/app.html` ergänzt um `og:type`/`og:site_name`/`og:title`/`og:description`/`og:url`/`og:image`(+`width`/`height`)/`og:locale` sowie `twitter:card`/`twitter:title`/`twitter:description`/`twitter:image`. Als Vorschaubild dient das bereits vorhandene `static/screenshots/board-wide.png` (1280×800, aus der Manifest-Screenshot-Ergänzung), referenziert als absolute `https://bewerby.de/...`-URL (von der OG-Spezifikation verlangt). Da `app.html` als statische Hülle vor der Svelte-Komponentenhierarchie und vor der i18n-Initialisierung liegt (derselbe Grund, aus dem die bestehende `description`-Meta-Angabe schon hartkodiertes Deutsch statt i18n ist), sind die Werte seitenweit identisch statt pro Route generiert — für die primäre Freigabe der Startseite ausreichend, eine Pro-Route-Individualisierung wäre ein separater Aufwand.

**Ist:** Keine `og:*`- oder `twitter:*`-Tags irgendwo im Markup — geteilte Links in WhatsApp, Discord, Slack oder Twitter/X zeigten keine Vorschau.

**Soll:** Eine funktionierende Linkvorschau mit Titel, Beschreibung und Bild in den gängigen Messengern/Plattformen.

**Nachtrag (zweisprachiger Text):** Auf Wunsch tragen `og:title`/`og:description`/`twitter:title`/`twitter:description` jetzt beide Sprachen in einem String (getrennt durch " / "), zusätzlich `og:locale:alternate` (`en_US`) neben dem primären `og:locale` (`de_DE`). Eine echte Sprachauswahl durch den Client ("der Roboter wählt die Sprache") ist mit einer einzelnen statischen `app.html`-Hülle ohne serverseitige Content-Negotiation nicht möglich — das bräuchte echte lokalisierte Routen (`/de/...`, `/en/...`) mit `hreflang`, ein eigenständiges, deutlich größeres i18n-Routing-Vorhaben, hier bewusst nicht mit angegangen.

### 39 — PWA-Icons 404 live (`/icons/`-Alias-Kollision)

**Status:** ✅ Erledigt (siehe [#39](https://github.com/dstN/bewerby/issues/39) für den schließenden Commit und Details). Live-Diagnose direkt nach dem ersten erfolgreichen Deploy: `/icons/apple-touch-icon.png` und die drei weiteren Dateien unter `static/icons/` lieferten 404, obwohl jede andere statische Datei (Fonts, `manifest.json`, `service-worker.js`, `static/screenshots/*`) im selben Deploy korrekt auslieferte. Der 404-Body war Plesks generische Standard-Fehlerseite (`/error_docs/styles.css`, Zeitstempel 2020) statt SvelteKits eigener gerenderter 404-Seite — die Anfrage erreichte Passenger/Node also nie. Deckt sich exakt mit Apaches verbreiteter, serverweiter `Alias /icons/`-Voreinstellung (Teil vieler Distributions-Apache-Configs für `mod_autoindex`s Verzeichnis-Icons), die diesen Pfad-Präfix hostweit abfängt, unabhängig vom vHost oder `.htaccess`-Inhalt. Behoben durch Umbenennung von `static/icons/` zu `static/app-icons/` (alle Referenzen in `app.html`, `reminders.ts` und `manifest.json` mitgezogen) statt eines riskanteren Eingriffs in die Server-Konfiguration.

**Ist:** `static/icons/*` 404en live, obwohl die Dateien im Build und im Git-Tracking vorhanden sind.

**Soll:** Alle vier PWA-Icon-Dateien sind live unter einem Pfad erreichbar, der nicht mit einer Apache-Standardvoreinstellung kollidiert.

### 40 — Epic: Opt-in Web-Push-Erinnerungen bei geschlossenem Browser

**Ist:** Die Reminder-Engine (`src/lib/utils/reminders.ts`) läuft rein im JS-Kontext der Seite und feuert nur, solange ein Tab mit bewerby offen ist (siehe `settings.remindersDesc`). `registerBackgroundSyncBestEffort()` ist ein dokumentierter No-op — der Service Worker hat keinen `sync`-Listener.

**Soll:** Optional zuschaltbare, echte Zustellung über die Web-Push-API, ohne bewerbys Kernversprechen ("100 % lokal, kein Server, kein Konto") für alle anzutasten, die das Feature nicht aktivieren. Erfordert zwingend eine neue, externe Server-Komponente (Push kann sich selbst nicht terminieren) — datensparsam entworfen, sodass dieser Server nur Push-Subscription + Fälligkeits-Zeitstempel kennt, nie Firmenname/Titel/Notizen. Details, Double-Opt-in-Vorschlag und offene Fragen siehe [#40](https://github.com/dstN/bewerby/issues/40). Wie #36 bewusst als Backlog-Epic nach v1 eingeordnet, kein aktueller Implementierungsauftrag.

### 41 — Epic: Live-P2P-Sync per QR-Pairing (WebRTC + CRDT)

**Status:** Wird gemeinsam mit #36/#41 in Milestone 5 umgesetzt (#49–#57).

**Ist:** Mehrgeräte-Nutzung ist nur über den manuellen Export/Import-Umweg (`backup.ts`) möglich — kein automatischer Abgleich, kein "einfach auf zwei Geräten weiterarbeiten".

**Soll:** Bewusst als eigenständige, **serverlose Alternative** zu #36 angelegt (nicht als dessen Vorstufe): ein QR-Code vermittelt nur den WebRTC-Verbindungsaufbau zwischen zwei Geräten; die eigentliche Synchronisation läuft danach direkt Gerät-zu-Gerät über einen DataChannel, ohne dass je ein Server die Bewerbungsdaten sieht oder speichert — auch nicht verschlüsselt. Kernstück ist eine Umstellung des Datenmodells auf CRDT (z. B. Yjs), damit Änderungen aus Offline-Phasen beider Geräte automatisch und ohne Datenverlust zusammengeführt werden, statt nur die neueste Momentaufnahme zu gewinnen. Einziges externes Infrastrukturstück ist ein zustandsloser Signaling-Relay (kein Datenspeicher). Details, Vergleichstabelle zu #36 und offene Fragen siehe [#41](https://github.com/dstN/bewerby/issues/41). Wie #36/#40 bewusst als Backlog-Epic nach v1 eingeordnet, kein aktueller Implementierungsauftrag.

---

## Ad-hoc-Fixes außerhalb der Nummerierung

Nicht Teil der ursprünglichen 36-Punkte-Analyse, sondern beiläufig während der Umsetzung entdeckt und sofort behoben — trotzdem dokumentiert, damit nichts stillschweigend passiert.

### 37 — Sicherheitsupdate: verwundbare Abhängigkeiten patchen

**Status:** ✅ Erledigt (siehe [#37](https://github.com/dstN/bewerby/issues/37) für den schließenden Commit und Details).

**Ist:** Die permanente Installation von `@playwright/test` für #30 löste einen `npm audit`-Lauf aus, der 6 Advisories in installierten Abhängigkeiten meldete — darunter **High** direkt in `pdfjs-dist` (`>=5.6.83 <6.2.108`, [GHSA-hq66-cqwq-w95j](https://github.com/advisories/GHSA-hq66-cqwq-w95j): beliebige JavaScript-Ausführung beim Öffnen eines präparierten PDFs), unmittelbar relevant, da `extractTextFromPdf()` genau das mit jedem Nutzer-Upload und jedem Backup-Import tut.

**Behoben:** `npm audit fix` (ohne `--force`) hat fünf der sechs Advisories innerhalb der bestehenden `^`-Ranges in `package.json` gelöst: `pdfjs-dist` → `6.2.108`, `nanoid` → `3.3.18`, `brace-expansion` → `5.0.9`, `postcss` → `8.5.26`, `@sveltejs/kit` → `2.70.3`. Verifiziert mit `npx vitest run` (45 Tests grün), `npm run check` (0 Fehler) und `npm run build` (erfolgreich).

**Bewusst nicht behoben:** 3 verbleibende **Low**-Advisories in `cookie` (`<0.7.0`) — transitiv über `@sveltejs/kit`. Selbst die aktuellste stabile `@sveltejs/kit`-Version (`2.70.3`, npms `latest`-Tag) deklariert weiterhin `cookie: ^0.6.0`; ein Fix existiert nur in `3.0.0-next.*`-Prereleases. `npm audit fix --force` würde daher keinen echten Fix liefern, sondern eine sinnlose Downgrade-Kaskade bis `@sveltejs/kit@0.0.30` erzwingen. Wird bei einem künftigen stabilen Kit-Release erneut geprüft. **Nachtrag v1.6.0:** Mit SvelteKit 3 (`cookie` v2) erledigt.

---

## Nach dem v1-Release — Test- und Barrierefreiheits-Härtung (v1.1.0)

Nicht Teil der ursprünglichen 39-Punkte-Analyse und ohne eigenes GitHub-Issue (auf Nutzerwunsch direkt umgesetzt, nicht über den sonst üblichen Issue-Workflow) — trotzdem hier dokumentiert, aus demselben Grund wie #37: nichts soll stillschweigend passieren.

**Auslöser:** Zwei Aufträge — (1) die bestehende Testabdeckung um tiefere Unit-, E2E- und Barrierefreiheitstests erweitern, (2) ein gemeldetes Mobil-Layout-Problem prüfen ("Suchleiste läuft über den Bildschirmrand hinaus").

### Testabdeckung

**Unit-Tests (Vitest):** von 4 auf 15 Testdateien, von rund 45 auf **217 Tests**. Neu abgedeckt: die Reminder-Engine selbst (Scheduling, Deduplizierung über `localStorage`-Marker, Aufräumen verwaister Marker, `setTimeout`-Clamping auf `2^31-1`) über Fake-Timer und eine ersetzte `liveQuery`/`Notification`-Kette statt nur `getReminderDueAt()`s reine Datumsmathematik; die Theme-, i18n- und Farb-Stores (inkl. System-Preference-Wechsel zur Laufzeit, Persistenz-Roundtrips, korruptem `localStorage`); `isValidApplication()` feldweise (jede Pflicht- und Optionalfeld-Kombination einzeln, da genau diese Funktion die einzige Instanz zwischen einer manipulierten Backup-Datei und der Live-Datenbank ist); OPFS und die Storage-Permission-Hilfsfunktionen über ein In-Memory-`FileSystemDirectoryHandle`; `eraseAllData()` (jeder der fünf Lösch-Schritte einzeln, plus dass ein Fehler in einem Schritt die folgenden nicht abbricht); und ein Konsistenztest, der `de.json`/`en.json` gegen jede tatsächliche `t('...')`-Aufrufstelle in `src/` abgleicht (inklusive der drei dynamischen Template-Literal-Aufrufe). Zwei Umgebungslücken mussten dafür geschlossen werden: Node 26 deklariert ein eigenes, unter Vitest wirkungsloses `globalThis.localStorage`, das jsdoms funktionierende Implementierung verdeckt, und jsdom 30 kennt `matchMedia` überhaupt nicht — beide über `tests/setup/browser-globals.ts` als deterministische Ersatzimplementierungen bereitgestellt.

**E2E-Tests (Playwright):** von 6 auf **108 Tests**, vier neue Spec-Dateien plus eine gemeinsame Seed-Fixture (`tests/e2e/fixtures/seed.ts`, schreibt Testdaten direkt über die rohe IndexedDB-API statt über die UI, damit ein befüllter Board-Zustand nicht den Modal-Erstellungspfad mittestet). `board-filters.spec.ts` fährt Suche/Tag-/Prioritäts-/Farbfilter und die Sortierung über die echten Steuerelemente statt über die zugrunde liegende `$derived`-Kette. `preferences.spec.ts` prüft Theme/Sprache gegen das tatsächliche No-FOUC-Verhalten in `app.html` (dass der gespeicherte Wert _vor_ dem ersten Paint auf `<html>` steht, nicht nur, dass der Store-Zustand stimmt) und dass keine Route in keiner Sprache eine rohe Übersetzungs-Schlüssel-Zeichenkette rendert.

### Barrierefreiheit: WCAG 2.2 Level AAA + Best Practice (`a11y.spec.ts`)

**Ist (vor dieser Änderung):** Die App war gegen WCAG **AA** verifiziert (#34). Ein axe-core-Scan lief nie automatisiert in CI, und mehrere Farb-Tokens erreichten zwar 4,5:1 (AA), aber nicht 7:1 (AAA).

**Umsetzung:** `@axe-core/playwright` neu installiert. Ein Scan über jede Route, beide Themes, Desktop- und 390px-Viewport, gegen `wcag2a`/`wcag2aa`/`wcag2aaa`/`wcag21*`/`wcag22*` plus `best-practice` (nicht nur die sonst übliche AA-Baseline) — zusätzlich das befüllte Board (inkl. Alert-Banner, farbigen/spekularen Karten, Tag-Overflow-Chip), Analytics mit echten Daten, den geöffneten Bewerbungs-Dialog und das DatePicker-Popover, da ein Scan der leeren Standardansicht die meisten Komponenten gar nicht erreicht (dieselbe Lücke, die #34 beim `.total-val`-Fund in Analytics schon einmal aufgezeigt hatte). Ergänzt um handschriftliche Prüfungen, die axe strukturell nicht leisten kann: Skip-Link-Verhalten, Live-Region-Ansagen, `inert` auf der geschlossenen Mobil-Schublade, `prefers-reduced-motion`.

**Gefundene und behobene AAA-Verstöße:** Ein vollständiger Sweep (alle Routen × beide Themes × zwei Viewports × alle Overlay-Zustände, mit `reducedMotion: 'reduce'` gegen Falschmessungen mitten in der `modal-enter`-Öffnungsanimation) förderte 56 einzelne Kontrastbefunde zutage, die sich auf eine Handvoll zugrunde liegender Farb-Tokens in `src/app.css` zurückführen ließen. Jedes Token wurde numerisch neu bestimmt (WCAG-Relative-Luminanz-Formel, Ziel ≥ 7,0:1 gegen jede Oberfläche, auf der es tatsächlich verwendet wird) statt nach Augenmaß angepasst:

- `--text-secondary` / `--text-tertiary` (beide Themes) — reichten bislang nur AA.
- `--color-accent-text` (Fließtext-/Icon-Blau) und, getrennt davon, `--color-accent-600`/`700` (Volltonfarbe für weißen Button-Text — eine andere Kontrastanforderung als dieselbe Farbe als Text auf hellem Grund).
- `--color-danger` / `--color-danger-solid`.
- Der Sidebar-Akzent-Ton im aktiven Navigationseintrag (`--sidebar-text-active`, `--sidebar-item-active` im Dark-Theme) — die einzige nicht-neutrale Hintergrundfläche, gegen die das Akzentblau bestehen muss.
- Die fest codierte Warnbanner-Textfarbe in `+page.svelte` (bewusst themeunabhängig, siehe bestehender Kommentar dort).

Nach der Korrektur: **0 axe-Verstöße** über die gesamte Scan-Matrix (Routen × Themes × Viewports × Board-/Analytics-/Dialog-/DatePicker-Zustände).

### Mobil-Layout: Suchleiste und Filter-Dropdowns

**Ist (Suchleiste):** Auf einem Telefon lief das Suchfeld über den rechten Bildschirmrand hinaus. Ursache: Nirgends im Projekt galt `box-sizing: border-box` global — jedes `width: 100%`-Element addierte sein eigenes Padding/Border obendrauf. Beim Suchfeld allein macht das 36px Icon-Inset + Padding + Rahmen ≈ 50px Überstand, auf dem Desktop unsichtbar (der Wrapper ist dort auf 320px begrenzt, der Überstand verschwand im freien Flex-Platz), auf einem 390px-Telefon jedoch sichtbar jenseits des Rands, sobald der Mobil-Breakpoint diese Begrenzung aufhebt.

**Behoben:** Ein globaler `*, *::before, *::after { box-sizing: border-box; }`-Reset in `src/app.css`. Bei der Gelegenheit zwei weitere, durch denselben Root-Cause verwandte Überlauf-Bugs im Bewerbungs-Dialog gefunden und behoben: `.modal-content` nutzte `width: 100%` unter `position: fixed` (Prozentwerte lösen dort gegen den _Viewport_ auf, nicht gegen die eigene, per `inset: 16px` definierte Box — führte bei 320px zu 16px Überstand unabhängig vom Border-Box-Fix) sowie fehlendes `min-width: 0` im Tag-Eingabefeld und im Formular-Grid (ein `<input>`s intrinsische Mindestbreite verhinderte das Schrumpfen innerhalb von Flex/Grid).

**Ist (Filter-Dropdowns, auf Hinweis nachträglich gefunden):** Die vier Filter-Selects unter der Suchleiste quetschten sich auf einem Telefon in eine einzige Reihe zu je ca. 75px Breite — jedes Label kürzte auf ein bis zwei Zeichen ("Alle Tags" → "Al", "Sortieren nach: Standard" → "So"). Ursache: `.filter-dropdowns select { flex: 1; }` setzt `flex-basis: 0%`, was jedem Element erlaubt, beliebig zu schrumpfen, statt `flex-wrap: wrap` je auszulösen — der Zeilenumbruch griff also nie.

**Behoben:** Die vier Selects stapeln sich auf Mobilbreite jetzt volle Breite untereinander (wie das Suchfeld es bereits tat), statt in eine Reihe gezwängt zu werden. Ein zweispaltiges Raster wurde geprüft und verworfen: Das längste Standard-Label ("Sortieren nach: Standard") passt selbst bei 390px nicht in eine halbe Zeile, ohne erneut zu kürzen.

**Absicherung:** `tests/e2e/mobile-layout.spec.ts` (neu, 29 Tests) prüft bei 320px und 390px auf jeder Route, im befüllten Board und im Dialog, dass kein Element über den Viewport-Rand hinausragt, sowie gezielt für die Filter-Selects, dass sie sich stapeln statt zu quetschen (Regressionstest bewusst _vor_ dem Fix gegen den alten Code laufen lassen und als tatsächlich fehlschlagend verifiziert — 75px statt der erwarteten > 322px —, um sicherzustellen, dass der Test den Bug wirklich erkannt hätte).

### Nebenbei behoben

- `playwright.config.ts`: `workers` auf `4` gedeckelt (Playwrights Default von der halben CPU-Zahl — 12 auf der genutzten Maschine — ließ so viele parallele Browser-Kontexte gleichzeitig den Service Worker registrieren und jede Route precachen, dass es zuverlässig in `net::ERR_INSUFFICIENT_RESOURCES` kippte, sobald die Suite über ~100 Tests wuchs) sowie `retries: 1` **überall**, nicht nur in CI (ein seltener, umgebungsbedingter `browser.newContext: Target page, context or browser has been closed`-Fehler beim Chromium-Start betraf auch bereits bestehende Tests wie `modal-keyboard.spec.ts` — kein Test-Bug, sondern ein Environment-Flake, das eine ehrliche Retry-Politik verdient statt eines Test-seitigen Workarounds).
- `vite.config.ts`: `setupFiles` für die neue `tests/setup/browser-globals.ts`-Shim ergänzt, Kommentar zur Test-Environment-Wahl aktualisiert (einzelne Dateien können jetzt gezielt `// @vitest-environment jsdom` opt-in nutzen).

**Verifikation:** `npm run lint`, `npm run check`, `npm run build`, `npm run test` (217/217) und `npm run test:e2e` (108/108, inkl. mehrfacher Wiederholung zur Flake-Prüfung) laufen fehlerfrei durch.

---

---

## Nach v1.2.0 — Nachweis-Export, Erinnerungen und Anzeigen-Import (v1.3.0)

Ohne eigenes GitHub-Issue, auf Nutzerwunsch direkt umgesetzt — aus demselben
Grund wie #37 und die v1.1.0-Härtung hier dokumentiert: nichts soll
stillschweigend passieren.

**Auslöser:** Drei Aufträge aus der Praxis — (1) ein Export, mit dem sich
Bewerbungen bei der Agentur für Arbeit nachweisen lassen, (2) eine Frage zum
Erinnerungsverhalten, aus der eine Änderung wurde, (3) der offene Punkt aus
`.agents/plans/issues.md`: Import nicht nur per PDF.

### A — Nachweis der Bewerbungsbemühungen als PDF und CSV

**Ist:** Die Daten für einen Vermittlungsnachweis lagen vollständig im Board,
waren aber nur abzuschreiben.

**Umgesetzt:** Zwei Buttons in der Board-Kopfzeile. Beide Formate rendern aus
**einer** Funktion (`toExportRows` in `src/lib/utils/applicationExport.ts`),
damit sie sich über Datum, Reihenfolge und Status-Wortlaut nicht uneinig
werden können. Exportiert wird, was die Filterleiste gerade zeigt.

- **CSV**: `;`-getrennt, CRLF, mit UTF-8-BOM — das ist, was ein deutsches
  Excel per Doppelklick korrekt öffnet. Komma-getrennt landet dort alles in
  Spalte A, ohne BOM ist jeder Umlaut Mojibake. Zellen, die mit `=`, `+`,
  `-` oder `@` beginnen, werden mit einem Apostroph entschärft: Die Datei
  wird von jemand anderem auf einem unbekannten Rechner geöffnet, und der
  Inhalt stammt aus einer geparsten Anzeige.
- **PDF** (`applicationListPdf.ts`): A4-Tabelle, Kopfzeile auf jeder Seite
  wiederholt, Seitennummerierung — bei einem Papiernachweis soll auffallen,
  wenn ein Blatt fehlt. pdf-lib wird dynamisch importiert wie in
  `coverLetterPdf.ts`, die Seitengeometrie von dort geteilt statt kopiert.

Das Datum ist `getAppliedAt()` aus `reminders.ts` — derselbe Anker, ab dem
die Wiedervorlage zählt. „Wann habe ich mich beworben" darf nicht zwei
verschiedene Daten haben.

**Bewusst nicht gebaut:** echtes `.xlsx`. Das bräuchte SheetJS (~600 KB
Fremdcode) oder rund 100 Zeilen ZIP-Plumbing von Hand, um eine Datei zu
erzeugen, die dasselbe zeigt wie die CSV.

### B — Erinnerungen: absoluter Termin statt Intervall ab Bewerbungsdatum

**Ist (Frage des Nutzers, am Code geprüft):** Eine Erinnerung feuerte genau
einmal; `bewerby_notified_<id>_<dueAt>` in `localStorage` sperrte die
Wiederholung. Ein geändertes Intervall wurde weiterhin **ab dem
Bewerbungsdatum** gerechnet — 7d → 14d bei einer 20 Tage alten Bewerbung war
also sofort fällig statt in 14 Tagen.

**Umgesetzt:** Neues optionales Feld `reminderAt` (absoluter Zeitstempel).
`getReminderDueAt` liest es, wenn vorhanden, und fällt sonst auf die
bisherige Intervall-Rechnung zurück — Zeilen aus älteren Builds verhalten
sich unverändert. Im Modal setzt eine Intervalländerung `Date.now() +
Intervall`; die neue Option „Eigenes Datum" öffnet den vorhandenen
`DatePicker`. Ein Speichern, das das Intervall nicht anfasst, lässt einen
fälligen Termin in Ruhe — das war schon vorher die Regel und bleibt es.

### C — Anzeigen-Import per Freitext und per Link

**Ist:** Import ging nur über ein PDF. Der offene Punkt fragte zusätzlich
nach Freitext und nach URL-Import.

**Umgesetzt, beides.** Drei Wege, ein Parser, ein Review-Panel — kein Weg
kann ein Feld schreiben, nach dem ein anderer gefragt hätte.

- **Freitext**: `parseJobText` (neuer Einstiegspunkt in `jobParse.ts`, gibt
  anders als `parseJobDetailsFromText` die Confidence mit zurück).
- **Link**: `POST /api/fetch-ad`, die einzige Route mit `prerender = false`.
  schema.org-`JobPosting`-JSON-LD wird zuerst gelesen und mit `high`
  markiert — das sind Arbeitgeberdaten, keine Heuristik —, sonst der
  Seitentext.

**Zum Datenschutz, nachdem der erste Einwand dagegen teilweise falsch war:**
Die CSP braucht **keine** Aufweitung, weil der Browser nur mit `'self'`
spricht; und der Arbeitgeber sieht die IP unseres Servers statt der des
Nutzers, gegenüber dem direkten Öffnen des Links also _weniger_ Preisgabe.
Richtig bleibt: Der Server erfährt den Link. Gegenmaßnahmen: Link nur im
POST-Body (nie in der Query, also nie im Apache-Log), nichts gespeichert
oder gecacht, Feature optional, Offenlegung in der Datenschutzerklärung nach
Art. 6 Abs. 1 lit. b DSGVO in beiden Locales.

**Sicherheit (der tragende Teil):** `src/lib/server/urlGuard.ts`, unter
`$lib/server`, damit SvelteKit ihn gar nicht erst in Client-Code bündeln
kann. Nur `https:`, keine eingebetteten Credentials, **alle** aufgelösten
Adressen müssen öffentlich sein (ein Host mit einer öffentlichen _und_ einer
privaten Antwort käme sonst durch), IPv4-mapped IPv6 wird nach den
IPv4-Regeln beurteilt. Redirects werden von Hand verfolgt und **pro Hop neu
geprüft** — ein öffentlicher Host, der `302 http://127.0.0.1:8443`
antwortet, hebelt eine einmalige Prüfung sonst komplett aus. Dazu 8 s
Timeout, 3 Redirects, 2 MB inkrementell gelesen, ein einziger Fehlerstatus
nach oben (401/403/404 zu unterscheiden ist genau die Sonde, die ein
SSRF-Versuch zurückhaben will) und ein Rate-Limit pro IP.

**Bekannte Restlücke, benannt statt wegdefiniert:** DNS prüfen und `fetch()`
danach erneut auflösen lassen ist ein TOCTOU-Fenster (DNS-Rebinding).
`assertPublicUrl` gibt die geprüften Adressen bereits zurück, damit die
Verbindung später über einen eigenen Dispatcher daran gebunden werden kann.

**Gegen echte Seiten gemessen:** Arbeitsagentur, StepStone und LinkedIn
liefern eine lesbare Seite; **Indeed blockiert** automatisierte Abrufe (403).
Seiten, die ihre Anzeige rein clientseitig rendern, liefern nur die Hülle.
Jeder Fehlerfall verweist auf das Einfügefeld, das deshalb darunter stehen
bleibt statt ersetzt zu werden.

### Unterwegs gefunden und mitbehoben

- `identifier.name` („req") statt `identifier.value` als Referenznummer
  gelesen — schema.org' `PropertyValue` trägt das Label in `name`.
- `<b>Svelte</b>.` wurde beim Tag-Strippen zu „Svelte ."; Leerzeichen vor
  Satzzeichen werden jetzt entfernt.
- Der neue Einfügen-Button hatte im Dark Mode 2,7:1 Kontrast
  (`--color-accent-600` ist für weiße Schrift _darauf_ gedacht) — jetzt
  `--color-accent-text`.
- Ein E2E-Locator matchte „Anzeigen" als Teilstring des neuen Labels
  „Stattdessen Anzeigentext einfügen"; jetzt `exact`.

**Verifikation:** `npm run lint`, `npm run check`, `npx vitest run`
(405/405) und `npx playwright test` (133/133, keine Flakes) laufen
fehlerfrei durch. Der SSRF-Guard wurde zusätzlich gegen den laufenden
Produktionsbuild geprüft (`tests/e2e/fetch-ad.spec.ts`), der Listen-PDF-Renderer
gegen einen echten Render über 90 Zeilen: 3 Seiten, Kopfzeile je Seite bei
y=775, letzte Datenzeile bei y=87, Fußzeile bei y=44,7 — keine Kollision.

## Nach v1.5.0 — SvelteKit 3 und Backup-Import älterer Exporte (v1.6.0)

Ohne eigenes GitHub-Issue, auf Nutzerwunsch direkt umgesetzt — aus demselben
Grund wie #37 hier dokumentiert: nichts soll stillschweigend passieren.

**Auslöser:** Das Release von SvelteKit 3
([Ankündigung](https://svelte.dev/blog/sveltekit-3-is-here),
[Migrationsleitfaden](https://svelte.dev/docs/kit/migrating-to-sveltekit-3)):
migrieren, alles aus `npm outdated` aktualisieren und reparieren, was danach
nicht mehr funktioniert. Danach die Frage, ob ein Backup der laufenden
1.5.0-Instanz weiterhin importierbar ist.

### A — Migration auf SvelteKit 3

Begonnen mit `npx sv migrate sveltekit-3`, danach von Hand nachgezogen:

- `@sveltejs/kit` 2 → 3, `@sveltejs/adapter-node` 5 → 6.
- `$lib` → `#lib` über das `imports`-Feld in `package.json`
  (Node-Subpath-Imports), `$app/environment` → `$app/env`, der Typ `Handle`
  aus `@sveltejs/kit/hooks`.
- `tsconfig.json` erweitert `$app/tsconfig` statt `.svelte-kit/tsconfig.json`
  und nennt `src`, `tests` und `vite.config.ts` selbst — genau das, was die
  generierte Datei vorher einschloss.
- Service Worker: `src/service-worker.ts` → `src/service-worker/index.ts`,
  als eigenes TypeScript-Projekt (`WebWorker`- statt DOM-Typen,
  `src/service-worker/tsconfig.json`). `$service-worker` gibt es nicht mehr:
  `self` kommt aus `$app/service-worker`, `version` aus `$app/env`,
  `immutable`/`assets` aus `$app/manifest`, absolute Pfade über `asset()`
  aus `$app/paths`. Weil das Projekt jetzt aus dem Root-`tsconfig`
  ausgeschlossen ist, prüft `npm run check` es mit einem zweiten
  `tsc -p`-Lauf — sonst wäre es still aus der Typprüfung gefallen.
  SvelteKit registriert den Worker jetzt als Modul (`type: 'module'`).
- Board: `replaceState` → `goto(…, { shallow: true, replace: true })` beim
  Entfernen von `?new=1`. Flache Navigationen lösen seit Kit 3
  `afterNavigate` aus; das Layout überspringt sie (`shallow`), damit dabei
  nichts passiert, was nur ein echter Routenwechsel auslösen soll.
- `/api/fetch-ad`: das abgekündigte `json()` → `Response.json()`.

**Bewusst nicht übernommen:** das Umschreiben der `.svelte`-Dateien durch den
Codemod. Er druckt jede Komponente neu und veränderte dabei gerenderten
Leerraum — aus `</a>.` wurde `</a>` + Zeilenumbruch + `.`, also ein
sichtbares Leerzeichen vor dem Punkt im Impressum. Diese Dateien wurden
verworfen und nur ihre Importe ersetzt.

**Geprüft und unverändert gelassen:** `resolve('/board')` bleibt —
Routen-IDs beginnen weiterhin mit `/`. `version.pollInterval` fragt jetzt
standardmäßig stündlich `/_app/version.json` ab; harmlos, der Service Worker
beantwortet das aus dem Cache. Quellkarten erzeugt Kit 3 nur für
`build/server/`, nicht im öffentlichen `build/client/`. `/api/fetch-ad`
bleibt gegen CSRF geschützt: Der Client sendet
`content-type: application/json`, eine fremde Formular-Übermittlung wird mit
403 abgelehnt.

### B — Vorgerenderte Seiten ohne `Content-Type` (Fehler in SvelteKit 3.0.0)

**Ist:** Nach dem Upgrade lieferte adapter-node jede vorgerenderte Seite
**ohne** `Content-Type`-Header. Kit 3.0.0 baut die MIME-Tabelle des Adapters
aus den URL-Pfaden der vorgerenderten Seiten (`/board`) statt aus ihren
Dateien (`board.html`), `.html` landet also nie darin. In Produktion setzt
Apache zusätzlich `X-Content-Type-Options: nosniff` (`static/.htaccess`) —
in Chromium nachgestellt: ohne Typ und mit `nosniff` wird die Seite als
`text/plain` angezeigt, also als HTML-Quelltext statt als App. Lokal ohne
Apache fiel das nicht auf, weil der Browser dort raten darf.

**Behoben:** `withHtmlMimeType()` in `vite.config.ts` ergänzt den einen
fehlenden Eintrag. SvelteKits eigene Tabelle hat Vorrang; die Hülle wird
also wirkungslos, sobald der Fehler upstream behoben ist, und kann dann
entfallen (Upstream-`main` hatte zum Zeitpunkt des Upgrades denselben Code).
Abgesichert durch `tests/e2e/prerendered.spec.ts`.

### C — Abhängigkeiten

Alles aus `npm outdated` auf dem neuesten Stand, u. a. Vite 8.3, Vitest 5,
Svelte 5.57, Playwright 1.63, typescript-eslint 8.71 und pdfjs-dist 6.3.
**Ausnahme TypeScript:** bleibt auf 6.x, weil Kit 3 (`^6.0.0`), svelte-check
(`^5 || ^6`) und typescript-eslint (`<6.1.0`) TypeScript 7 noch nicht
zulassen. `npm audit` meldet 0 Befunde (brace-expansion unter eslint per
`npm audit fix` angehoben). Damit sind auch die drei Low-Advisories in
`cookie` erledigt, die #37 offen lassen musste: Kit 3 nutzt `cookie` v2.

### D — Deployment

- `build/` sieht mit adapter-node 6 anders aus: `adapter-node.js` ist neu,
  `env.js` und `shims.js` gibt es nicht mehr; `handler.js` bleibt der
  Einstieg für `app.cjs`. Der Build läuft weiterhin ohne `node_modules` auf
  dem Server (mit einer Kopie von `build/`, `app.cjs` und `package.json`
  allein geprüft).
- adapter-node 6 liefert statische Dateien aus einer beim Build erfassten
  Liste aus, Dotfiles wie bisher ausgenommen; auf andere Methoden als
  GET/HEAD antwortet es dort mit 405.
- Kit 3 braucht mindestens Node 22.17. Produktion (Netcup) läuft auf Node 26,
  wie lokale Entwicklung und CI; DEPLOYMENT.md, README.md und `ci.yml` nannten
  für den Server noch „Node ≥20" und sind korrigiert.

### E — Backup-Import älterer Exporte

**Ist (mit einem echten Export der 1.5.0-Instanz geprüft):** Der Import
scheiterte mit „Einige Einträge im Backup entsprechen nicht dem
Datenmodell." — unabhängig vom Upgrade: Auch 1.5.0 selbst konnte diesen
eigenen Export nicht wieder einlesen. 7 von 38 Zeilen tragen
`appliedAt: null`, Überbleibsel eines frühen Imports aus der Zeit vor der
Zeilenvalidierung (dazu passen ihre UUID-Strings als `id`). Die App liest
solche Zeilen problemlos (`appliedAt ?? createdAt`), `isValidApplication()`
ließ für optionale Felder aber nur „fehlt" oder den richtigen Typ zu.

**Behoben:** `parseBackupPayload()` entfernt `null`-Felder vor der
Validierung. JSON kennt kein `undefined`; `null` ist der andere Weg, „fehlt"
auszudrücken — und das, was `JSON.stringify` aus `NaN` macht. Ein
Pflichtfeld mit `null` fällt weiterhin durch, eben als fehlend. Zwei
Unit-Tests decken beides ab.

**Mit dem echten Export gegen den Produktionsbuild verifiziert,** in beiden
Import-Modi: 38 Karten (20 versendet, 18 Absage); Profil (wie vorgesehen nur
bei „Ersetzen") und der bewerbungsspezifische Lebenslauf wiederhergestellt,
der Lebenslauf übersteht auch den Aufräumlauf verwaister PDFs beim nächsten
Start; Analytics rendert fehlerfrei; ein erneuter Export ist mit dem
Original identisch bis auf die 7 entfernten `null`-Werte, die PDF-Bytes
eingeschlossen.

**Verifikation:** `npm run lint`, `npm run check` (App und Service Worker),
`npm run test` (425/425) und `npm run test:e2e` (140/140) laufen fehlerfrei
durch. Zusätzlich der Build ohne `node_modules` per `node app.cjs` (Seiten
mit 200 und `text/html`, 403 für eine fremde Formular-Übermittlung, 405 für
POST auf statische Dateien) und `npm run dev` mit allen Routen im Browser
ohne Konsolenfehler.

## Verifikation für v1

- `npm run lint` und `npm run check` laufen fehlerfrei durch.
- `npm run build`; danach enthält `build/client/` kein `data/`-Verzeichnis, und `build/client/service-worker.js` nennt weder `data/Bewerbung` noch `.gitignore`.
- In den DevTools ist der Service Worker **activated**, und Cache Storage enthält ein HTML-Dokument.
- Im Offline-Modus lädt ein Hard-Reload auf `/`, `/analytics`, `/backup` und `/settings` jeweils erfolgreich.
- Backup-Roundtrip: Bewerbung mit PDF anlegen, exportieren, alle Daten löschen, importieren — das PDF ist wieder vorhanden und öffnet sich.
- Import einer manipulierten Datei (fehlendes `tags`, fehlendes `history`, unbekannte `version`) erzeugt eine klare Meldung bei unverändertem Datenbestand.
- Auf 390×844 sind alle vier Routen über die Navigation erreichbar, der Status einer Bewerbung ist ohne Maus änderbar, und das Board läuft nicht horizontal über.
- Vollständiger Tastaturdurchlauf ohne Maus: Board → Karte → Dialog (Fokus springt hinein, Escape schließt, Fokus kehrt zur Karte zurück) → DatePicker per Pfeiltasten → Speichern. Jedes fokussierte Element zeigt einen sichtbaren Ring.
- Mit Screenreader werden PDF-Verarbeitung, Speichern, Löschen und Import angesagt.
- Nach fünf Minuten geöffnetem Tab zeigt das Performance-Panel keinen 2-Sekunden-Task, und `localStorage` ist nicht gewachsen.
- Lighthouse (mobil, Inkognito) erreicht auf allen vier Routen 100/100/100/100; axe-DevTools meldet null Verstöße.

## Hinweis zur Belastbarkeit der Befunde

Die Analyse lief als Audit über sechs Dimensionen mit anschließender adversarialer Gegenprüfung. Vier der sechs Gegenprüfungen wurden vorzeitig abgebrochen; deren Befunde waren damit formal unverifiziert. Alle Blocker und alle folgenschweren High-Befunde wurden daraufhin einzeln am Code nachgeprüft — die in dieser Roadmap genannten Ist-Zustände sind belegt.

Für die Medium- und Low-Aufgaben in Milestone 2 und 3 gilt das nicht durchgängig. Einzelne können sich bei der Umsetzung als hinfällig erweisen. Sie werden dann am jeweiligen Issue begründet geschlossen, statt vorab stillschweigend entfernt zu werden.
