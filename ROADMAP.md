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

**Ist:** Weder Impressum noch Datenschutzerklärung existieren. Die Einstellungsseite enthält lediglich drei statische Datenschutz-Stichpunkte (`src/routes/settings/+page.svelte:54-73`). Für einen öffentlich erreichbaren, aus Deutschland betriebenen Dienst sind beide zwingend (§ 5 DDG, Art. 13 DSGVO).

**Soll:** Eigene Routen für Impressum und Datenschutzerklärung, aus der Navigation verlinkt, in beiden Sprachen. Die Datenschutzerklärung beschreibt wahrheitsgemäß, was die App tatsächlich tut: rein lokale Verarbeitung, kein Server-Log personenbezogener Inhalte, welche `localStorage`-Keys zu welchem Zweck gesetzt werden, und wie Nutzer ihre Daten exportieren und löschen.

### 14 — Recht auf Löschung umsetzen

**Status:** ✅ Erledigt (siehe [#14](https://github.com/dstN/bewerby/issues/14) für den schließenden Commit und Details). `src/lib/utils/eraseAllData.ts` löscht IndexedDB (via `db.delete()`), den kompletten OPFS-PDF-Ordner, sämtliche `localStorage`-Keys, alle Cache-Storage-Einträge und offene Notifications. Neue Karte in den Einstellungen mit Bestätigungsdialog, der explizit auf den Export hinweist, bevor gelöscht wird; nach erfolgreicher Löschung lädt die App neu. Mit Playwright end-to-end verifiziert (Bewerbung mit PDF, Theme-Änderung, Custom-Farbe, Notified-Marker als Ausgangszustand): nach der Löschung sind IndexedDB-Zeilen, OPFS-PDFs und `localStorage` vollständig leer, und die App bleibt danach voll funktionsfähig (Zustand einer Neuinstallation). Cache Storage füllt sich nach dem Reload normal mit der App-Shell neu — korrektes Service-Worker-Verhalten, da dort keine personenbezogenen Daten liegen.

**Ist:** Es gibt keine Funktion, um alle eigenen Daten zu löschen. Der einzige Löschpfad ist das Entfernen einzelner Bewerbungen per `confirm()` (`src/routes/+page.svelte:113-117`). `localStorage` behält `bewerby-theme`, `bewerby-locale`, `bewerby_custom_colors` und beliebig viele `bewerby_notified_*`-Keys; Cache Storage und angezeigte Notifications bleiben ebenfalls bestehen.

**Soll:** Eine bestätigungspflichtige Aktion in den Einstellungen räumt vollständig auf: IndexedDB, OPFS-Dateien, alle `localStorage`-Keys, Cache Storage und offene Notifications. Danach ist die App im Zustand einer Neuinstallation. Der Nutzer wird vorher auf den Export hingewiesen.

### 15 — Deployment verifizieren und dokumentieren

**Status:** ✅ Erledigt (siehe [#15](https://github.com/dstN/bewerby/issues/15) für den schließenden Commit und Details). Per Recherche gegen Passengers offizielle Doku und Quellcode zwei bisher unerkannte, schwerwiegendere Befunde bestätigt statt der ursprünglich vermuteten: (1) Apache liefert physisch existierende Dateien unter `DocumentRoot` **immer direkt statisch aus und umgeht Passenger/Node komplett** — bei `DocumentRoot` = Repo-Root wären `package.json`, `.git/config` und `src/*` also tatsächlich öffentlich abrufbar, nicht nur theoretisch. Behoben durch die von Passenger selbst vorgeschriebene Zwei-Wurzel-Architektur (`DocumentRoot` → `build/client/`, `PassengerAppRoot` → Projekt-Root), dokumentiert in `DEPLOYMENT.md`. (2) Passengers Node-Loader lädt die Startdatei per `require()` — eine ESM-Datei (`"type": "module"`) crasht dort zwingend mit `ERR_REQUIRE_ESM`, unabhängig von der Node- oder Passenger-Version (verifiziert direkt im Passenger-Quellcode, ein Fix-Versuch 2021 wurde unmerged geschlossen). Behoben durch Umbenennung zu `app.cjs` mit dynamischem Import statt `import`-Statement — lokal mit `node app.cjs` getestet und läuft korrekt.

Zusätzlich: `engines`-Feld in `package.json` ergänzt (gibt `.npmrc`s `engine-strict` erstmals Wirkung); `static/.htaccess` fließt jetzt automatisch nach `build/client/.htaccess` und trägt Security-Header, Cache-Control (Immutable für `_app/immutable/`, `no-cache` für HTML) sowie Ausspielung der von `precompress: true` erzeugten `.br`/`.gz`-Varianten. Verifiziert: der Build-Output ist vollständig self-contained (keine externen Paket-Referenzen in `build/index.js`) — `node_modules` wird auf dem Server gar nicht benötigt, was den Deploy-Fußabdruck deutlich verkleinert. **Bewusste Konsolidierung:** Das vollständige Runbook (`DEPLOYMENT.md`) entsteht hier statt in #32, da sich beide Issues beim Schreiben der Roadmap inhaltlich überschnitten hatten — #32 fokussiert stattdessen auf README-Neufassung und ein Architekturdokument. **Nicht gegen eine echte Netcup/Plesk-Instanz getestet** (keine verfügbar) — `DEPLOYMENT.md` benennt das explizit als Grenze.

**Ist:** Die `.htaccess` liegt im Repository-Root und setzt `PassengerAppType node` / `PassengerStartupFile app.js`. Das greift nur, wenn Apaches DocumentRoot dieses Verzeichnis ist — dann wären aber `src/`, `node_modules/`, `.git/` und `static/data/` über HTTP erreichbar. `app.js` ist ein ES-Modul (`package.json` setzt `"type": "module"`, `app.js:13` nutzt Top-Level-`import`) ohne Node-Version-Pin: `.npmrc` setzt `engine-strict=true`, aber `package.json` hat **kein `engines`-Feld**. Unfingerprintete Assets (Fonts, Icons, Manifest) haben keine Cache-Control-Vorgabe. `adapter-node` erzeugt `precompress: true`-Varianten, deren Ausspielung ungeprüft ist. Ein Deploy-Runbook existiert nicht; die `README.md` ist noch das unveränderte `sv`-Template.

**Soll:** Die Passenger-Konfiguration ist real verifiziert, und kein Verzeichnis außer dem Build-Output ist über HTTP erreichbar. Das ESM-Startfile ist mit einem `engines`-Pin abgesichert, sodass `engine-strict` etwas erzwingt. Cache-Header für fingerprintete und unfingerprintete Assets sind korrekt getrennt. `robots.txt` passt zur Deployment-Absicht. Ein Runbook beschreibt Build, Upload, Neustart und Rollback reproduzierbar.

---

## Milestone 2 — Performance, A11y & UI Polish

**Ziel:** WCAG 2.2 AA durchgehend erfüllen und Lighthouse 100 in allen vier Kategorien erreichen.

| #   | Aufgabe                                                | Labels                             | Issue                                            |
| :-- | :----------------------------------------------------- | :--------------------------------- | :----------------------------------------------- |
| 16  | ✅ Fokus-Sichtbarkeit wiederherstellen                 | `a11y`                             | [#16](https://github.com/dstN/bewerby/issues/16) |
| 17  | ✅ Kontrastverstöße beheben                            | `a11y`                             | [#17](https://github.com/dstN/bewerby/issues/17) |
| 18  | ✅ Fokusmanagement im Bearbeitungsdialog               | `a11y` `refactoring`               | [#18](https://github.com/dstN/bewerby/issues/18) |
| 19  | ✅ DatePicker als bedienbares Kalender-Grid            | `a11y` `performance` `refactoring` | [#19](https://github.com/dstN/bewerby/issues/19) |
| 20  | ✅ Kanban-Karte semantisch entflechten                 | `a11y`                             | [#20](https://github.com/dstN/bewerby/issues/20) |
| 21  | ✅ Tailwind-Scope eingrenzen (30 KB → ~2 KB CSS)       | `performance`                      | [#21](https://github.com/dstN/bewerby/issues/21) |
| 22  | ✅ Asset-Gewicht reduzieren                            | `performance`                      | [#22](https://github.com/dstN/bewerby/issues/22) |
| 23  | ✅ Board- und Analytics-Queries entkoppeln             | `performance`                      | [#23](https://github.com/dstN/bewerby/issues/23) |
| 24  | $effect-Disziplin herstellen                           | `refactoring`                      | [#24](https://github.com/dstN/bewerby/issues/24) |
| 25  | prefers-reduced-motion durchgehend respektieren        | `a11y`                             | [#25](https://github.com/dstN/bewerby/issues/25) |
| 26  | i18n vervollständigen und Seitentitel differenzieren   | `a11y` `bug`                       | [#26](https://github.com/dstN/bewerby/issues/26) |
| 27  | PDF-Verarbeitung härten                                | `bug` `performance`                | [#27](https://github.com/dstN/bewerby/issues/27) |
| 28  | Cloud-Sync-Platzhalter ehrlich und barrierefrei machen | `a11y`                             | [#28](https://github.com/dstN/bewerby/issues/28) |

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

**Ist:** Fünf `$effect`-Verwendungen ersetzen Lifecycle oder abgeleitete Werte. `src/routes/+layout.svelte:15` ist der gravierendste Fall: der Init-Effect ruft `i18n.init()`, das `this.locale` schreibt **und** über `document.documentElement.lang = this.locale` liest (`src/lib/i18n/index.svelte.ts:49-53`) — der Effect hängt damit an `locale`, sodass jeder Sprachwechsel die komplette Boot-Pipeline erneut ausführt, inklusive Reminder-Sync und Intervall-Registrierung. Es gibt keine Teardown-Funktion. Weiter: Prop-nach-State-Synchronisation in `ApplicationModal.svelte:60-81`, ein einmaliger Permission-Read in `src/routes/settings/+page.svelte:7-9` und zwei Effects im DatePicker (`:49`, `:58`).

**Soll:** Einmalige Initialisierung läuft in `onMount` mit Teardown. Abgeleitete Werte nutzen `$derived`. Die Formularinitialisierung des Dialogs erfolgt über Initialisierer plus `{#key}` statt über einen Prop-Sync-Effect. Ein Sprachwechsel wechselt die Sprache und löst keine Boot-Pipeline aus.

### 25 — prefers-reduced-motion durchgehend respektieren

**Ist:** `src/app.css:191-195` respektiert die Einstellung ausschließlich für `scroll-behavior`. Alles andere ignoriert sie: die Specular-Shine-Keyframe-Animation auf farbmarkierten Karten (`src/routes/+page.svelte:625-669`), `modal-enter` (`ApplicationModal.svelte:436-442`), `transition:scale` im DatePicker (`:279`), die Grid-Transition der Sidebar (`+layout.svelte:91`), Hover-`transform`s und die Funnel-Balken-Transition.

**Soll:** Bei `prefers-reduced-motion: reduce` sind alle nicht-essenziellen Animationen und Transitions deaktiviert oder auf einen Opacity-Wechsel reduziert — inklusive der Svelte-Transitions, nicht nur der CSS-Regeln.

### 26 — i18n vervollständigen und Seitentitel differenzieren

**Ist:** Trotz vollständiger Übersetzungsdateien sind mehrere Strings hartcodiert deutsch: `aria-label="Hinzufügen"` und `"Löschen"` (`src/routes/+page.svelte:265`, `:331`), `title="Farbmarkierung"` (`:295`), `aria-label="Tag löschen"` und `"Farbe löschen"` sowie `title="Entfernen"` (`ApplicationModal.svelte:385`, `:338`, `:337`), `aria-label="Vorheriger Monat"`/`"Nächster Monat"` (`DatePicker.svelte:292`, `:300`), `aria-label="Navigation"` (`Sidebar.svelte:20`), die PDF-Fehlermeldung per `alert()` (`ApplicationModal.svelte:117`) und der Skip-Link in `src/app.html:32` — obwohl `a11y.skipToContent` als Key existiert. Alle vier Routen tragen denselben `<title>` „bewerby", weil er nur im Layout gesetzt wird (`+layout.svelte:24`). Kartendaten werden mit `toLocaleDateString(undefined, …)` formatiert (`+page.svelte:323`), folgen also der Browser- statt der App-Sprache.

**Soll:** Kein nutzersichtbarer oder assistiv gelesener String ist hartcodiert. Jede Route hat einen eigenen, aussagekräftigen Titel. Datums- und Zahlenformate folgen der gewählten App-Sprache.

### 27 — PDF-Verarbeitung härten

**Ist:** `extractTextFromPdf` (`src/lib/utils/pdf.ts:16-56`) liest die Datei vollständig in einen ArrayBuffer und iteriert alle Seiten auf dem Main Thread — ohne Größen- oder Seitenzahl-Grenze; eine sehr große Datei friert den Tab ein. Fehler landen in einem `alert()` mit hartcodiertem deutschem Text und rohem Fehlerinhalt (`ApplicationModal.svelte:115-120`). `accept=".pdf"` prüft nur die Endung, nicht den Inhalt. In den Heuristiken: der Telefon-Regex (`pdf.ts:232-241`) trifft auch Datumsbereiche, Rechnungs- und Bestellnummern; `isCoverLetterOrCV` (`:74`) klassifiziert formelle deutsche Stellenanzeigen falsch und verwirft dadurch Telefonnummer und E-Mail des Recruiters; `match.index || 0` behandelt Index 0 als falsy (`:220`, `:236`); die langen Alternationsketten sind auf Backtracking nicht geprüft.

**Soll:** Vor dem Parsen greifen Größen- und Seitenzahl-Grenzen mit klarer Meldung. Das Parsen läuft außerhalb des Main Threads, mit sichtbarem Fortschritt und Abbruchmöglichkeit. Fehler erscheinen als übersetzte Inline-Meldung statt als `alert()`; ein korruptes, verschlüsseltes oder rein bildbasiertes PDF führt zu einer verständlichen Aussage. Die Dateiart wird inhaltlich geprüft. Die Extraktionsheuristiken sind mit Testfällen belegt und in den benannten Punkten korrigiert.

### 28 — Cloud-Sync-Platzhalter ehrlich und barrierefrei machen

**Ist:** Die Tier-3-Karte (`src/routes/backup/+page.svelte:169-194`) zeigt „Google Drive" und „Dropbox" als ausgegrauten Platzhalter, umgesetzt über `opacity: 0.6` und `pointer-events: none` (`:342-348`). `pointer-events: none` entfernt nichts aus dem Baum assistiver Technik, und die reduzierte Deckkraft senkt den Kontrast unter jeden Grenzwert.

**Soll:** Der Platzhalter ist über `inert` bzw. `aria-disabled` korrekt als nicht verfügbar ausgezeichnet, erfüllt trotz gedämpfter Darstellung die Kontrastanforderungen und ist unmissverständlich als „geplant" gekennzeichnet — ohne den Eindruck zu erzeugen, es bestehe bereits eine Cloud-Anbindung.

---

## Milestone 3 — Final v1 Release Prep

**Ziel:** Das Erreichte gegen Regression absichern und den Release ausliefern.

| #   | Aufgabe                                                   | Labels          | Issue                                            |
| :-- | :-------------------------------------------------------- | :-------------- | :----------------------------------------------- |
| 29  | Unit-Tests für die risikoreiche Logik                     | `dx`            | [#29](https://github.com/dstN/bewerby/issues/29) |
| 30  | End-to-End-Smoketests                                     | `dx`            | [#30](https://github.com/dstN/bewerby/issues/30) |
| 31  | CI-Pipeline als Merge-Gate                                | `dx`            | [#31](https://github.com/dstN/bewerby/issues/31) |
| 32  | Dokumentation: README, Runbook, Architektur               | `documentation` | [#32](https://github.com/dstN/bewerby/issues/32) |
| 33  | Toten Code und Konfigurationsdrift entfernen              | `refactoring`   | [#33](https://github.com/dstN/bewerby/issues/33) |
| 34  | Manifest vervollständigen und Lighthouse 100 verifizieren | `performance`   | [#34](https://github.com/dstN/bewerby/issues/34) |
| 35  | Versionsstände synchronisieren und v1.0.0 releasen        | `enhancement`   | [#35](https://github.com/dstN/bewerby/issues/35) |

### 29 — Unit-Tests für die risikoreiche Logik

**Ist:** Es existiert kein Testframework und keine einzige Testdatei. Die fehleranfälligsten Teile sind völlig ungetestet: 256 Zeilen Regex-Heuristik in `src/lib/utils/pdf.ts`, die Reminder-Arithmetik in `src/lib/utils/reminders.ts`, die Trichter- und Antwortzeit-Berechnung in `src/routes/analytics/+page.svelte:9-76` und der Backup-Roundtrip.

**Soll:** Vitest ist eingerichtet. Abgedeckt sind: die PDF-Extraktionsheuristiken gegen echte Beispieldokumente (Fixtures außerhalb von `static/`, siehe Aufgabe 1), die Reminder-Fälligkeitslogik inklusive aller Intervallwerte, der Backup-Roundtrip mit PDF, die Analytics-Kennzahlen inklusive leerer Datenmenge, und die Dexie-v1-nach-v2-Migration.

### 30 — End-to-End-Smoketests

**Ist:** Keine Browsertests. Genau die Pfade, die im Audit gebrochen waren (Offline-Reload, Mobile-Navigation, Tastaturbedienung des Dialogs, Import/Export), sind nur manuell prüfbar.

**Soll:** Playwright deckt als Smoketest ab: Bewerbung anlegen, bearbeiten, verschieben und löschen; Tastaturpfad durch den Dialog inklusive Fokusrückgabe; Erreichbarkeit aller Routen auf einem 390px-Viewport; Offline-Hard-Reload jeder Route; Export- und Import-Roundtrip mit PDF; Ablehnung einer manipulierten Importdatei bei unverändertem Datenbestand.

### 31 — CI-Pipeline als Merge-Gate

**Ist:** Kein `.github/`-Verzeichnis, keine Automatisierung. `npm run lint` ist derzeit dauerhaft rot (siehe Aufgabe 2) und würde als Gate ohnehin nichts durchlassen.

**Soll:** Ein GitHub-Actions-Workflow führt `lint`, `check`, `test` und `build` auf jeden Push und Pull Request aus und blockt bei Fehlern. Das `engines`-Feld ist ergänzt, sodass `engine-strict=true` aus `.npmrc` etwas erzwingt, und die CI läuft auf derselben Node-Version wie die Produktion.

### 32 — Dokumentation: README, Runbook, Architektur

**Hinweis zur Konsolidierung:** Das Runbook ist bereits Teil von #15 entstanden (`DEPLOYMENT.md`), da sich die beiden Issues beim ursprünglichen Schreiben der Roadmap inhaltlich überschnitten hatten. #32 beschränkt sich daher auf die README-Neufassung und ein kurzes Architekturdokument; das bestehende `DEPLOYMENT.md` wird von dort aus verlinkt statt dupliziert.

**Ist:** `README.md` ist unverändert das `sv`-Scaffold-Template und beschreibt das Projekt nicht. Die Datenschutz- und Offline-Architektur ist nirgends dokumentiert.

**Soll:** Die `README.md` beschreibt Zweck, Stack, lokale Entwicklung und Projektstruktur, und verlinkt `DEPLOYMENT.md` für den Deploy-Prozess. Ein kurzes Architekturdokument hält fest, wo Daten liegen, warum sie das Gerät nicht verlassen, und wie Offline-Fähigkeit und Reminder tatsächlich funktionieren — inklusive der Grenzen.

### 33 — Toten Code und Konfigurationsdrift entfernen

**Ist:** `phosphor-svelte` ist als Abhängigkeit deklariert, wird aber nie importiert (alle Icons sind inline-SVG). Der `$i18n`-Alias in `vite.config.ts:19` wird nie genutzt. `skills-lock.json:40-45` deklariert die Skill `ui-ux-pro-max`, deren Verzeichnis nicht existiert. Die Klasse `.info-card` wird in `src/routes/settings/+page.svelte:55` gesetzt, aber nie definiert. Mehrere i18n-Keys sind ungenutzt (u. a. `nav.dashboard`, `kanban.actions.move`, `theme.light`, `theme.dark`, `analytics.title`, `empty.kanban`). `I18nState` hat einen leeren Konstruktor mit reinem Kommentarinhalt. `app.d.ts:13` deklariert pdf.js als untypisiertes Modul, wodurch die gesamte pdf.js-API `any` ist.

**Soll:** Ungenutzte Abhängigkeiten, Aliase, CSS-Klassen und Übersetzungsschlüssel sind entfernt. `skills-lock.json` und Verzeichnisinhalt stimmen überein. pdf.js wird typisiert eingebunden statt per `any`-Deklaration.

### 34 — Manifest vervollständigen und Lighthouse 100 verifizieren

**Ist:** `static/manifest.json` fehlen `id`, `scope`, `screenshots` und `shortcuts`; `lang` ist fest auf `de`, obwohl die App zweisprachig ist. `src/app.html:6-7` deklariert zwei `theme-color`-Werte (`#ffffff` light, `#2563eb` dark), das Manifest nur `#2563eb`. Ein Lighthouse-Lauf mit 100 in allen vier Kategorien ist nie belegt worden.

**Soll:** Das Manifest ist vollständig und installierbar, mit `id`, `scope`, Screenshots und passenden `theme-color`-Werten. Ein dokumentierter Lighthouse-Lauf (mobil, Inkognito) erreicht auf allen vier Routen 100 in Performance, Accessibility, Best Practices und SEO; axe-DevTools meldet null Verstöße, auch im geöffneten Dialog.

### 35 — Versionsstände synchronisieren und v1.0.0 releasen

**Ist:** `src/lib/components/layout/Sidebar.svelte:79` zeigt ein hartcodiertes `v0.0.1`, das unabhängig von `package.json` driftet.

**Soll:** Die angezeigte Version stammt aus einer einzigen Quelle. `package.json` steht auf `1.0.0`, der Release ist getaggt, und alle Verifikationsschritte dieser Roadmap sind nachweislich erfüllt.

---

## Nach v1 (Backlog, ohne Milestone)

| #   | Aufgabe                                       | Labels        | Issue                                            |
| :-- | :-------------------------------------------- | :------------ | :----------------------------------------------- |
| 36  | Epic: Ende-zu-Ende-verschlüsselter Cloud-Sync | `enhancement` | [#36](https://github.com/dstN/bewerby/issues/36) |

### 36 — Epic: Ende-zu-Ende-verschlüsselter Cloud-Sync

**Ist:** Die Tier-3-Karte auf der Backup-Seite kündigt Google-Drive- und Dropbox-Synchronisation an, ohne dass eine Implementierung existiert.

**Soll:** Ein echter Synchronisationsweg, bei dem Daten das Gerät ausschließlich clientseitig verschlüsselt verlassen (WebCrypto, Zero-Knowledge gegenüber dem Anbieter). Braucht ein eigenes Krypto- und Schlüsselverwaltungskonzept — inklusive Antwort darauf, was bei Schlüsselverlust passiert — und wird deshalb bewusst nach v1 gelegt, um den Release nicht zu blockieren.

---

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
