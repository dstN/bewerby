# #36 + #41 — Ende-zu-Ende-verschlüsselte Mehrgeräte-Synchronisation

## Context

bewerby lebt heute auf genau einem Gerät. Gesichert wird nur per unverschlüsseltem JSON-Export (Tier 1) oder Ordner-Dump (Tier 2). Die Tier-3-Karte auf `/backup` kündigt Cloud-Sync nur an.

Ziel sind **echte Mehrgeräte-Synchronisation mit verlustfreiem Zusammenführen** (#41) und **verschlüsselte Cloud-Ablage** (#36). Beides wird gemeinsam gebaut:

- **Ein Datenmodell, drei Transportwege:** Yjs-CRDT als Synchronisationsquelle. Übertragen wird über (a) Cloud-Anbieter (asynchron, Geräte müssen nicht gleichzeitig online sein), (b) WebRTC direkt von Gerät zu Gerät (live) und (c) eine verschlüsselte Datei (manuell, z. B. iCloud über die Dateien-App).
- **Zero-Knowledge:** Ver- und entschlüsselt wird ausschließlich im Browser. Anbieter, bewerby.de, der Signaling-Endpunkt und STUN sehen nie Klartext oder Schlüssel. Jeder Anbieter bekommt nur einen eigenen App-Ordner und darin nur Chiffretext.
- **Verlust des Schlüssels** (offene Frage aus #36): Es gibt einen Wiederherstellungsschlüssel, und weitere eigene Geräte halten den Schlüssel ebenfalls. Gehen Passwort, Wiederherstellungsschlüssel _und_ alle Geräte verloren, sind die Daten weg. Das ist bewusst so, sonst wäre es kein Zero-Knowledge.

**Bereits entschieden (2026-10-01):**

- Umfang: echte Synchronisation, #36 und #41 gemeinsam
- Anbieter: Dropbox, OneDrive, Google Drive und gern mehr
- Google über einen Token-Broker auf bewerby.de
- iCloud über die Dateien-App
- Zusammenführen mit Yjs
- Schlüsselableitung mit Argon2id über `hash-wasm`
- Infrastruktur nur bewerby.de: Signaling per Polling, öffentlicher EU-STUN, kein TURN. Wenn die direkte Verbindung scheitert, läuft der Abgleich über die Cloud.

**Kernversprechen ändert sich.** „Bewerbungsdaten verlassen nie das Gerät“ wird zu „verlassen das Gerät nur verschlüsselt, nur zu Zielen, die du selbst wählst“. README, ARCHITECTURE.md, Startseite und Datenschutzerklärung müssen das gleichlautend sagen.

---

## 0. Was ich VON DIR brauche, bevor es losgeht

### A — Registrierungen

Das kann nur der Kontoinhaber. Ich schreibe dir für jede eine Schritt-für-Schritt-Anleitung. Alle Redirect-URIs: `https://bewerby.de/cloud/callback` und `http://localhost:5173/cloud/callback`.

| #   | Wo                  | Was du anlegst                                                                                                                                                                                                                                                     | Was ich bekomme                                             | Ab Phase |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | -------- |
| A1  | Dropbox App Console | App mit Zugriffstyp **App folder**, Scopes `files.content.read/write` und `files.metadata.read`. Bei mehr als 50 Nutzern „Apply for production“                                                                                                                    | **App key** (öffentlich)                                    | 4        |
| A2  | Microsoft Entra     | App-Registrierung für **Personal + Work/School** (`common`), Plattform **SPA**, Berechtigungen `Files.ReadWrite.AppFolder` und `offline_access`. Publisher-Verifizierung über eine MPN-ID ist optional, sonst sehen Firmenkonten „unverified“                      | **Client-ID** (öffentlich)                                  | 5        |
| A3  | Google Cloud        | Projekt anlegen, Zustimmungsbildschirm „External“ mit Scope `drive.appdata` (nicht sensibel, einfache Verifizierung), Web-Client mit JS-Origin und Redirect-URIs. **bewerby.de per DNS-TXT in der Search Console bestätigen**, den TXT-Eintrag setzt du bei netcup | **Client-ID** (öffentlich) und **Client-Secret** (siehe B1) | 5        |
| A4  | pCloud (optional)   | App unter my.pcloud.com                                                                                                                                                                                                                                            | Client-ID                                                   | 8        |

### B — Server, Hosting und Deploy

- **B1** — Google-Client-Secret im **Plesk-Node.js-Panel als Umgebungsvariable** `GOOGLE_CLIENT_SECRET` hinterlegen. Es kommt nicht ins Repository und nicht in GitHub. Die öffentlichen Client-IDs kommen als **GitHub-Environment-Variablen** (`PUBLIC_DROPBOX_APP_KEY`, `PUBLIC_MS_CLIENT_ID`, `PUBLIC_GOOGLE_CLIENT_ID`) in den Build. Fehlt eine ID, ist der Anbieter einfach ausgeblendet.
- **B2** — Deine **Freigabe, in Phase 0 einen versteckten Test-Endpunkt nach bewerby.de zu deployen.** Er klärt drei Fragen: Teilen sich mehrere Passenger-Prozesse ein beschreibbares `tmp/`-Verzeichnis? Hält Passenger Long-Polling-Requests 25 s offen? Kommt die Plesk-Umgebungsvariable an? Danach wird er wieder entfernt.
- **B3** — Wahl des **öffentlichen EU-STUN-Servers**. Ich schlage vor, `stun.nextcloud.com` (Nextcloud GmbH, Stuttgart) erst zu prüfen und seine Datenschutzangaben zu lesen. Die Entscheidung liegt bei dir: Der Betreiber sieht IP-Adressen.

### C — Tests

- **C1** — Je ein **Testkonto** bei Dropbox, Microsoft und Google, getrennt von deinen privaten Konten.
- **C2** — Testgeräte: ein **iPhone oder iPad** mit Safari (Dateien-App, Speicherverhalten, Kamera öffnet den Pairing-Link), ein **Android-Gerät** mit Chrome und ein **zweiter Desktop-Browser**. Auf den Handys messe ich die Dauer von Argon2id.

### D — Recht

- **D1** — Juristische Gegenprüfung der neuen Datenschutz-Abschnitte (de und en) zu Token-Broker, Signaling, STUN und den Anbietern als Vertragspartnern der Nutzer (US-Anbieter: Drittland, Chiffretext). Ich schreibe die Entwürfe. **Rechtssicher machen kannst nur du bzw. dein Anwalt.**
- **D2** — Ergänzung der Nutzungsbedingungen zum Datenverlust bei verlorenem Passwort, Wiederherstellungsschlüssel und allen Geräten.

### E — Abhängigkeiten

Kurz bestätigen: **`yjs`, `lib0`, `hash-wasm`, `qrcode-generator`** (alle MIT, ohne eigenen Netzwerkzugriff). Ein Paket zum QR-Scannen kommt nicht dazu: Die Kamera-App des Handys öffnet den Pairing-Link selbst, als Fallback lässt sich ein Code eintippen. `yjs` wird erst geladen, wenn Sync eingerichtet ist. Wer ohne Sync arbeitet, lädt beim Start kein zusätzliches Byte.

---

## 1. Bedrohungsmodell: wer was sieht

| Beteiligter                               | Sieht                                                                                                                                                                                                                                     | Sieht **nicht**                                                                                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloud-Anbieter**                        | Konto (kennt er ohnehin), dass „bewerby“ verbunden ist, IP, Zeitpunkte, Anzahl, Namen und aufgerundete Größe der Dateien (Padmé), Aktivitätsmuster                                                                                        | Inhalte, Firmen, Anzahl der Bewerbungen, PDFs, Passwort, Schlüssel. Blob-Namen sind HMACs, gleiche PDFs sind von außen nicht als gleich erkennbar                                  |
| **bewerby.de, Token-Broker** (nur Google) | Code, Refresh- und Access-Token **im Durchlauf**. Die Tokens erlauben nur Zugriff auf den Google-App-Ordner, also nur Chiffretext. Dazu Apache-Log mit IP und Pfad (der Body wird nicht geloggt), Speicherdauer laut Datenschutzerklärung | Daten, Schlüssel. Gespeichert und geloggt wird nichts                                                                                                                              |
| **bewerby.de, Signaling**                 | Raum-ID (zufällig), verschlüsselte SDP- und ICE-Pakete, IP-Adressen. Nach 2 min gelöscht                                                                                                                                                  | Daten, Schlüssel, DTLS-Fingerprints im Klartext. Ein Man-in-the-Middle ist ausgeschlossen, weil die Pakete mit dem Pairing-Geheimnis bzw. dem Tresorschlüssel authentifiziert sind |
| **bewerby.de, OAuth-Rückruf**             | **Nichts.** `/cloud/callback` beantwortet der Service Worker aus dem Cache, ohne Netz. Microsoft liefert den Code zusätzlich per `response_mode=fragment`                                                                                 | —                                                                                                                                                                                  |
| **STUN-Betreiber**                        | Öffentliche IP-Adressen der Geräte während des Verbindungsaufbaus                                                                                                                                                                         | Inhalte (DTLS und zusätzlich eigene Verschlüsselung)                                                                                                                               |
| **Netzwerk und WLAN**                     | Mit welchen Hosts gesprochen wird (SNI), Größen, Zeitpunkte                                                                                                                                                                               | Inhalte, Tokens (TLS 1.2/1.3, HSTS)                                                                                                                                                |
| **Gestohlener Token**                     | Chiffretext lesen, überschreiben oder löschen                                                                                                                                                                                             | Klartext. Manipulation fällt durch AES-GCM auf, ein zurückgespielter alter Stand fällt über Yjs-Zustandsvektor und Revisionsmarke auf                                              |
| **Entferntes Gerät**                      | Was es bis zum Entfernen hatte. Das lässt sich technisch nicht zurückholen                                                                                                                                                                | Alles danach: Schlüsselrotation mit neuer Epoche                                                                                                                                   |
| **XSS oder kompromittierter Deploy**      | Alles. Das gilt für jede Web-App mit E2E-Verschlüsselung                                                                                                                                                                                  | Gegenmittel: strikte CSP, kein Fremdskript, keine Anbieter-SDKs, Deploy-Härtung (Phase 8)                                                                                          |

Ehrlich festgehalten wird auch: Jeder neue `connect-src`-Origin ist ein möglicher Abflussweg für XSS mit dem _eigenen_ Token eines Angreifers. Deshalb kommen nur feste Origins dazu, keine Wildcards, abgesehen von festen Host-Mustern für die S3-Anbieter in Phase 8.

---

## 2. Krypto-Design

| Schlüssel                                   | Herkunft                                                                                                                                                                                                                                 | Zweck                                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DEK** (Epoche _n_)                        | AES-256, zufällig. Mit `wrapKey` gewickelt, danach nur noch nicht exportierbar über `unwrapKey(..., false)` genutzt                                                                                                                      | Wurzel. Teilschlüssel per HKDF-SHA256: `k_upd` (Updates und Snapshots), `k_blob` (PDFs), `k_blobid` (HMAC für Blob-Namen), `k_live` (Live-Kanal, Raum-ID) |
| **KEK aus dem Passwort**                    | Argon2id (`hash-wasm`), Salz 16 B. Startwert m = 64 MiB, t = 3, p = 1, auf etwa 1 s am Testhandy kalibriert. Der OWASP-Mindestwert liegt bei 19 MiB/t = 2. **Beim Lesen gedeckelt**, gegen Speicher-DoS durch einen manipulierten Header | Wickelt den DEK. Dient zum Wiederherstellen auf einem neuen Gerät ohne zweites Gerät                                                                      |
| **KEK aus dem Wiederherstellungsschlüssel** | 160 Bit Zufall, angezeigt als Crockford-Base32 in Fünfergruppen. Abgeleitet mit HKDF, weil der Schlüssel volle Entropie hat                                                                                                              | Notfall, wenn das Passwort vergessen ist                                                                                                                  |
| **Geräteschlüssel**                         | ECDH P-256, privater Teil nicht exportierbar in IndexedDB                                                                                                                                                                                | Bei einer Rotation wird der neue DEK an jedes verbleibende Gerät gewickelt (ECDH → HKDF → AES-GCM)                                                        |
| **Pairing-Geheimnis P**                     | 128 Bit Zufall, gilt einmalig 2 min                                                                                                                                                                                                      | Authentifiziert das Signaling und übergibt den DEK an ein neues Gerät                                                                                     |

**Format** (`.bwv`, binär): `magic | header-len | header-JSON (als AAD) | AES-256-GCM(k, iv96, padmé(gzip(payload)))`.

- Der Header enthält `v`, `vaultId`, `epoch` und `iv`, bei `vault.bwk` zusätzlich die KDF-Parameter und die gewickelten DEKs.
- Gzip über die native `CompressionStream`. Padmé begrenzt das Größenleck bei höchstens 12 % Mehraufwand.
- Der IV wird pro Schreibvorgang neu gewürfelt.
- `ponytail:` Jede Datei wird in einem Stück verschlüsselt. Ab PDFs von etwa 200 MB lohnt ein Chunk-Format nach dem STREAM-Verfahren.

**Passwort ändern** wickelt nur den DEK neu. **Rotation** (Gerät entfernen, Verdacht auf Kompromittierung) erzeugt Epoche _n+1_: einen neuen DEK, gewickelt für Passwort, Wiederherstellungsschlüssel und jedes verbleibende Gerät. Danach wird ein neuer Snapshot geschrieben und die alten Update-Dateien werden gelöscht.

**Auf dem Gerät merken:** Der DEK wird als nicht exportierbarer CryptoKey in der eigenen IndexedDB `bewerby-keys` abgelegt. Abschalten lässt sich das pro Gerät, dann wird das Passwort in jeder Sitzung abgefragt. `navigator.storage.persist()` wird angefragt. Safari ohne installierte PWA darf Speicher nach 7 Tagen ohne Nutzung löschen. Dann koppelt man das Gerät neu, die Daten kommen aus Cloud oder Partnergerät zurück. Die UI sagt das ehrlich.

---

## 3. Datenmodell und Sync (Yjs)

**Dokument-Struktur**

```
apps:     Y.Map<uid, Y.Map{ title, company, …skalare Felder…,
                            notes: Y.Text, coverLetter: Y.Text,
                            tags: Y.Array<string>, history: Y.Array<{status,timestamp}>,
                            pdf: {blobId,name}?, cv: {blobId,name}? }>
profile:  Y.Map (Absenderdaten, globaler CV als blobId)
colors:   Y.Array (eigene Kartenfarben)
devices:  Y.Map<deviceId, {name, pubKey, addedAt, removedAt?}>
```

Nicht synchronisiert werden Ansichtseinstellungen: Theme, Sprache, eingeklappte Karten, Erinnerungs-Merker.

**Regeln**

- **Dexie bleibt das Lesemodell.** Board, Statistik, Erinnerungen und `liveQuery` bleiben unverändert. Ein **Materializer** beobachtet `apps` und schreibt geänderte Zeilen anhand der `uid` in Dexie.
- **`status` ergibt sich beim Materialisieren aus dem jüngsten `history`-Eintrag**, nicht aus Yjs' Regel „letzter Schreiber gewinnt“. Die entscheidet nach Client-ID, nicht nach Uhrzeit, und könnte einen älteren Umzug gewinnen lassen. `history` als `Y.Array` behält die Umzüge beider Geräte.
- `notes` und `coverLetter` als `Y.Text` werden zeichengenau zusammengeführt. `tags` werden beim Materialisieren entdoppelt.
- **PDFs liegen nicht im CRDT.** Sie sind inhaltsadressiert: `blobId = base32(HMAC(k_blobid, bytes))`. Lokal liegen sie weiter in OPFS, eine Tabelle `blobs` ordnet `blobId` und lokale `ref` zueinander. Fehlt eine Datei, wird sie aus Cloud oder Partnergerät nachgeladen, die Karte zeigt so lange „PDF wird geladen“.
- **Dexie v3:** `applications` bekommt einen eindeutigen Index `&uid`; die Migration vergibt `crypto.randomUUID()` an bestehende Zeilen. Neue Tabellen: `crdt` (`++seq`, Yjs-Updates, gelegentlich verdichtet), `syncState` (Schlüssel-Wert-Paare: Tokens, Cursor, gesehene Zustandsvektoren) und `blobs`.
- **Ein Schreibpfad (Repository):** `src/lib/data/applications.ts` mit `create`, `update`, `move`, `remove` und `importRows`. Es ersetzt die fünf direkten Dexie-Zugriffe:
  - `ApplicationModal.svelte:631/633`
  - `board/+page.svelte:204/325`
  - `ApplicationDispatchDialog.svelte:143`
  - `backup/+page.svelte:84-88`

  Profil- und Farb-Store schreiben genauso darüber. **Ohne Sync** schreibt das Repository direkt in Dexie, Yjs wird gar nicht geladen. **Mit Sync** schreibt es in das Y.Doc, und der Materializer schreibt Dexie. So gibt es genau eine Quelle der Wahrheit.

- **Einrichten** befüllt das Y.Doc einmalig aus Dexie. **Zweites Gerät:** Dessen lokale Daten werden _zusammengeführt_, nicht überschrieben. Vorher zeigt eine Vorschau, was zusammenkommt.
- **Backup-Import in einen synchronisierten Tresor:** „Zusammenführen“ legt neue `uid`s an. „Ersetzen“ löscht auf **allen** Geräten und braucht eine ausdrückliche Bestätigung mit Anzahl.

---

## 4. Transportwege

### 4.1 Ablage in der Cloud

Gilt gleich für alle API-Anbieter und den Ordner-Adapter.

```
/vault.bwk                      Header: KDF-Parameter, gewickelte DEKs je Epoche, Geräte-Wraps
/snap/<epoch>-<hash>.bwv        verdichteter Gesamtstand (Y.encodeStateAsUpdate)
/upd/<deviceId>/<seq>.bwv       inkrementelle Updates, jedes Gerät schreibt NUR eigene Dateien
/blob/<blobId>.bwb              verschlüsselte PDFs
```

- **Keine Schreibkonflikte:** Jedes Gerät hängt nur eigene Dateien an. Yjs-Updates sind kommutativ und idempotent, deshalb braucht es weder ETags noch Sperren.
- **Verdichten:** Ein Gerät schreibt einen Snapshot und löscht danach nur die Update-Dateien, die sein Zustandsvektor abdeckt. Verdichten zwei Geräte gleichzeitig, ist das unschädlich.
- **Senden** 20 s nach der letzten Änderung, gebündelt. **Holen:** Dropbox `list_folder/longpoll` (fast live), OneDrive `delta`, Google `changes`, der Ordner-Adapter alle 60 s. Das alles nur bei offenem Tab, dieselbe ehrliche Grenze wie bei den Erinnerungen.
- **Sicherheit:** Ein neues Gerät holt **zuerst** den Stand und schreibt erst danach. Eine unbekannte `vaultId` wird abgewiesen. Ein Anbieter-Ordner gehört zu genau einem Tresor.

### 4.2 Anbieter

| Anbieter                  | Anmeldung                                                                                                                        | Scope                                                                                                                                                       | Hintergrund-Sync                  | `connect-src`                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Dropbox**               | PKCE ohne Secret, `token_access_type=offline`                                                                                    | eigener App-Ordner                                                                                                                                          | ja (longpoll)                     | `api.dropboxapi.com`, `content.dropboxapi.com`                                                                           |
| **OneDrive**              | PKCE (SPA) ohne Secret, `response_mode=fragment`. Refresh-Token gilt 24 h, danach täglich eine Weiterleitung, meist ohne Eingabe | `Files.ReadWrite.AppFolder`                                                                                                                                 | ja                                | `login.microsoftonline.com`, `graph.microsoft.com`                                                                       |
| **Google Drive**          | PKCE und **Token-Broker** `POST /api/oauth/google`                                                                               | `drive.appdata`                                                                                                                                             | ja                                | `www.googleapis.com`, Broker über `'self'`                                                                               |
| **Ordner-Adapter**        | File System Access, Handle bleibt in IndexedDB, Berechtigung pro Sitzung neu                                                     | ein von dir gewählter Ordner **im Sync-Ordner eines beliebigen Clients** (Nextcloud, iCloud für Windows, Proton Drive, Synology, Syncthing, pCloud Drive …) | ja, nur Chromium-Desktop          | keine                                                                                                                    |
| **Datei, manuell**        | Teilen-Menü, „In Dateien sichern“ oder Download                                                                                  | iCloud Drive auf iOS und macOS, jeder Ordner                                                                                                                | nein (Zusammenführen beim Import) | keine                                                                                                                    |
| _S3-kompatibel (Phase 8)_ | Bucket-eigene Zugangsdaten, im Browser mit SigV4 signiert                                                                        | ein Bucket                                                                                                                                                  | ja                                | feste Muster: `*.your-objectstorage.com` (Hetzner), `*.backblazeb2.com`, `*.r2.cloudflarestorage.com`, `*.wasabisys.com` |
| _pCloud (Phase 8)_        | Implicit-Token (laut pCloud-Doku für JS-Apps), EU-Region `eapi`                                                                  | **kein App-Ordner möglich**, der Token hat Vollzugriff. Deshalb ausdrücklich gekennzeichnet                                                                 | ja                                | `api.pcloud.com`, `eapi.pcloud.com`                                                                                      |

Nicht dabei, mit Begründung:

- **Proton Drive:** Eine API für Drittanbieter ist erst für Ende 2026/Anfang 2027 angekündigt. Bis dahin geht es über den Ordner-Adapter.
- **Box:** Der Token-Tausch braucht ein Secret, und es gibt keinen App-Ordner.
- **Beliebiges WebDAV/Nextcloud direkt:** Der Host ist frei wählbar und taugt deshalb nicht für eine statische CSP, dazu kommt CORS. Nextcloud geht über den Ordner-Adapter.
- **iCloud-API (CloudKit):** von dir abgewählt.

### 4.3 Token-Broker für Google (`src/routes/api/oauth/google/+server.ts`)

- `prerender = false`. Akzeptiert nur POST mit JSON-Body, `Origin` muss `https://bewerby.de` sein (bzw. localhost im Dev), Body gedeckelt.
- Ergänzt `client_id` und das `client_secret` aus der Umgebung und ruft genau `https://oauth2.googleapis.com/token` auf, eine feste URL, also kein SSRF-Risiko.
- Gibt die JSON-Antwort zurück. **Speichert nichts und loggt nichts.** Gleiche Drosselung pro IP wie `/api/fetch-ad`. `rateLimited` und `clientAddress` wandern dafür von `src/routes/api/fetch-ad/+server.ts` nach `src/lib/server/` und werden von beiden Endpunkten genutzt.

### 4.4 Live von Gerät zu Gerät (#41)

**Koppeln**

1. Gerät A (schon im Tresor) zeigt einen QR-Code mit dem Link `https://bewerby.de/pair#r=<raum>&p=<P>`. Das Fragment erreicht nie einen Server. Die Kamera-App des Handys öffnet den Link selbst, eine Scan-Bibliothek ist nicht nötig. Auf dem Desktop wird stattdessen ein Code eingetippt (26 Zeichen in Gruppen).
2. Beide Geräte tauschen Offer, Answer und ICE über das **Signaling-Postfach**. Jedes Paket ist mit `HKDF(P)` verschlüsselt und authentifiziert, die DTLS-Fingerprints stecken darin. Der Server kann deshalb nicht dazwischengehen.
3. Über den DataChannel zeigen beide Geräte einen **Prüfcode** (4 Wörter aus den Fingerprints und P). Gerät A bestätigt mit „Gerät ‚Pixel‘ hinzufügen?“. Das schützt vor jemandem, der den QR-Code abfotografiert hat.
4. A überträgt DEK und Tresor-Metadaten, B schickt seinen öffentlichen Geräteschlüssel. Danach tauschen beide Yjs-Zustandsvektoren und Differenzen aus (`Y.encodeStateVector` und `Y.encodeStateAsUpdate(doc, sv)`, ohne `y-protocols`). Fehlende PDFs gehen in Stücken hinterher.

**Live-Betrieb:** Die Raum-ID ist `HMAC(k_live, 'room')`, Nachrichten werden mit `k_live` verschlüsselt. Nur Geräte mit dem DEK finden und verstehen sich. Kommt die direkte Verbindung nicht zustande (kein TURN), zeigt die UI „Live-Verbindung nicht möglich, Abgleich über die Cloud“.

**Signaling-Endpunkt** (`src/routes/api/signal/+server.ts`)

- Postfach pro Raum als **Dateien unter `tmp/signal/`** in der Application Root. Passenger kann mehrere Prozesse starten, die sich so ein Postfach teilen. Das prüft der Test-Endpunkt aus B2.
- Lange Abfrage (Long-Polling) mit 25 s Wartezeit, Pakete höchstens 8 KB, Raum gilt höchstens 2 min, abgelaufene Räume werden bei jedem Request aufgeräumt (wie bei der Drosselung in fetch-ad). Drosselung pro IP.
- Live-Präsenz ist **pro Gerät abschaltbar**. Jeder Poll erscheint mit IP im Apache-Log, das steht so in der Datenschutzerklärung.

### 4.5 Datei (manuell)

„Verschlüsselte Sicherung exportieren“ schreibt eine Datei `.bwv` mit dem verdichteten Gesamtstand und PDFs, auch ohne eingerichteten Sync. Beim Import wird **zusammengeführt** (Yjs), nicht ersetzt. Damit funktioniert iCloud über die Dateien-App ab Phase 1.

---

## 5. Plattform und Konfiguration

- **`vite.config.ts`, CSP:** `connect-src` bekommt nur die Origins aus 4.2 (fest) und den gewählten STUN-Server (`stun:`-URLs fallen nicht unter `connect-src`; das prüfe ich vorab). Neu: `upgrade-insecure-requests`.
- **`static/.htaccess` und `hooks.server.ts`:** Die Permissions-Policy bleibt bei `camera=()`. Wir scannen nicht selbst, die Kamera-App des Handys öffnet den Link.
- **`src/service-worker.ts`:** `/cloud/callback` und `/pair` kommen in `PRERENDERED_ROUTES`. Navigationen dorthin werden **nur aus dem Cache** beantwortet, damit Code bzw. Fragment nie im Server-Log landen. Ins Netz geht es nur, wenn kein Service Worker aktiv ist.
- **Neue Routen:** `src/routes/cloud/callback/+page.svelte` und `src/routes/pair/+page.svelte` (beide prerendered, entfernen Code und State bzw. Fragment sofort per `history.replaceState`), `src/routes/api/oauth/google/+server.ts`, `src/routes/api/signal/+server.ts`.
- **CI und Deploy:** öffentliche IDs als Environment-Variablen im Build. `DEPLOYMENT.md` beschreibt die Plesk-Variable `GOOGLE_CLIENT_SECRET` und das Verzeichnis `tmp/signal/`, das außerhalb der Document Root liegt und beim Deploy erhalten bleibt.

---

## 6. Oberfläche

Die Seite `/backup` wird zu **„Sync & Sicherung“** (Name noch abstimmen).

- **Assistent:** Erklärung, was wohin geht (die Tabelle aus Abschnitt 1, kurz gefasst) → Passwort mit Mindestlänge und Stärkehinweis, ohne Abhängigkeit → Wiederherstellungsschlüssel anzeigen, als Datei sichern oder drucken, Bestätigung durch Abtippen der letzten Gruppe → Ziel wählen (Anbieter, Ordner, nur Datei) → erster Abgleich.
- **Geräte:** Liste mit Name, zuletzt gesehen und „Entfernen“ (löst eine Rotation aus), dazu „Gerät hinzufügen“ (QR, Link, Code).
- **Status:** letzter Abgleich, laufend, Fehler. Meldungen über `aria-live="polite"` und `announcer`. Anbieter-Verbindungen lassen sich trennen, inklusive Token-Widerruf.
- **Löschrecht:** `eraseAllData` löscht zusätzlich `bewerby-keys`, Tokens und Sync-Status. Optional „Auch Cloud-Kopie löschen und Zugriff widerrufen“.
- Barrierefreiheit wie im Projekt üblich: WCAG 2.2 AAA, Tastatur, Fokusführung in den Dialogen nach dem Muster von `ApplicationModal`, 320 und 390 px.

---

## 7. Phasen

Jede Phase endet mit Tests, Doku, Datenschutz-Text (de/en), axe-Prüfung, Versions-Bump, Commit und Push. E2E läuft **sequenziell**.

| Phase                                        | Inhalt                                                                                                                                                                                                                                                                 | Größe | Ergebnis                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------- |
| **0 — Prüfungen**                            | Test-Endpunkt auf bewerby.de (B2). Prototypen der Anbieter mit A1–A3. Argon2-Dauer auf C2. Bundle-Größe von Yjs. STUN-Betreiber (B3). Fallen `stun:`-URLs unter die CSP?                                                                                               | S     | Belegte Annahmen, nur Prototypen, nicht im Repo                      |
| **1 — Krypto-Kern und verschlüsselte Datei** | `src/lib/vault/*`: Format, Argon2id, HKDF, Schlüssel wickeln, Padmé, Keystore. Wiederherstellungsschlüssel. „Verschlüsselt exportieren/importieren“ zunächst mit dem bestehenden Backup-Format (Ersetzen oder Zusammenführen wie heute). ADR 0001 und Bedrohungsmodell | L     | **iCloud über die Dateien-App funktioniert.** v1.6.0                 |
| **2 — Repository-Schicht**                   | Alle fünf Schreibpfade sowie Profil und Farben über `src/lib/data/`. **Keine Verhaltensänderung**, alle bestehenden E2E bleiben grün                                                                                                                                   | M     | Grundlage für den CRDT. v1.6.1                                       |
| **3 — CRDT**                                 | Yjs per dynamischem Import, Dexie v3 (`uid`, `crdt`, `syncState`, `blobs`), Materializer, Status aus `history`, Blob-IDs. Die Datei aus Phase 1 trägt jetzt Yjs-Updates, beim Import wird zusammengeführt                                                              | XL    | Zwei Geräte lassen sich per Datei verlustfrei zusammenführen. v1.7.0 |
| **4 — Cloud-Transport und Dropbox**          | `src/lib/sync/port.ts`, `oauth.ts`, `engine.ts`, Callback-Route (nur aus dem Cache), Ablage wie in 4.1 mit Verdichtung, Ordner-Adapter, Dropbox mit longpoll                                                                                                           | L     | Erster Cloud-Weg und beliebige Sync-Ordner. v1.8.0                   |
| **5 — OneDrive und Google**                  | OneDrive-Adapter. Token-Broker und Google-Adapter. Server-Helfer nach `$lib/server`                                                                                                                                                                                    | M     | v1.9.0                                                               |
| **6 — Live von Gerät zu Gerät (#41)**        | Pairing-Route, QR (`qrcode-generator`), Prüfcode, Signaling-Endpunkt, WebRTC-DataChannel, Yjs-Sync und PDF-Übertragung                                                                                                                                                 | L     | Live-Abgleich, Koppeln ohne Passwort. v1.10.0                        |
| **7 — Geräte und Schlüssel**                 | Geräteschlüssel, Entfernen und Rotation (Epochen), Passwort ändern, Cloud löschen und widerrufen, `eraseAllData`                                                                                                                                                       | M     | v1.11.0                                                              |
| **8 — Weitere Anbieter und Härtung**         | S3-kompatibel, pCloud mit Warnhinweis. GitHub-Actions auf Commit-SHA pinnen, Build-Hash in der App anzeigen, Trusted Types prüfen. Externes Review des Krypto-Kerns (deine Entscheidung)                                                                               | M     | v1.12.0                                                              |

Erst ab Phase 7 ist die Rotation fertig. Bis dahin bietet die UI „Gerät entfernen“ noch nicht an.

---

## 8. Kritische Dateien

- **neu:**
  - `src/lib/vault/{format,crypto,vault,keystore}.ts`
  - `src/lib/data/{applications,profile}.ts`
  - `src/lib/crdt/{doc,materializer,blobs}.ts`
  - `src/lib/sync/{port,oauth,engine,live,signalClient}.ts`, `src/lib/sync/adapters/{file,folder,dropbox,onedrive,gdrive,s3,pcloud}.ts`
  - `src/lib/server/{rateLimit,clientAddress}.ts`
  - die vier Routen aus Abschnitt 5
  - `docs/adr/0001-e2e-sync-crypto.md`, `docs/adr/0002-crdt-yjs.md`, `SECURITY.md`
- **geändert:**
  - `src/lib/db/index.ts` (v3)
  - die Schreibpfade aus Abschnitt 3
  - `src/lib/stores/{profile,colors}.svelte.ts`
  - `src/routes/backup/+page.svelte`
  - `src/lib/utils/backup.ts` (Zusammenführen als Import-Modus für Yjs)
  - `src/lib/utils/eraseAllData.ts`
  - `src/service-worker.ts`, `vite.config.ts`
  - `src/routes/api/fetch-ad/+server.ts` (nutzt die Helfer aus `$lib/server`)
  - i18n (de/en und `types.ts`), `src/routes/datenschutz/+page.svelte`, Nutzungsbedingungen, Startseite (Kernversprechen)
  - `ARCHITECTURE.md`, `README.md`, `ROADMAP.md` (#36 und #41 als Milestone 5), `DEPLOYMENT.md`
  - `.github/workflows/{ci,deploy}.yml`
- **wiederverwendet:**
  - `buildBackupPayload`, `parseBackupPayload`, `prepareImportRows`, `blobToBase64` (`src/lib/utils/backup.ts`)
  - `readPdfFromOpfs`, `writePdfToOpfs`, `cleanupOrphanedPdfs` (`src/lib/utils/opfs.ts`); die Liste gültiger Refs berücksichtigt künftig die Tabelle `blobs`
  - `isValidApplication` (`src/lib/db/index.ts`)
  - `announcer`, das Dialog- und Fokusmuster aus `ApplicationModal`
  - die Grenzen und Fehlerbehandlung aus `src/lib/server/urlGuard.ts` als Vorbild für Body-Limits und einheitliche Fehler

---

## 9. Verifikation

- **Vitest**
  - **Krypto:** Hin- und Rückweg; falsches Passwort führt zu sauberem Fehler; jedes manipulierte Byte in Header oder Chiffretext fällt auf; Wiederherstellungsschlüssel; Passwortwechsel; Rotation; Wrap pro Gerät.
  - **Grenzwerte und Parser:** Grenzen beim Padmé-Padding; gedeckelte KDF-Parameter; Fuzzing des Header-Parsers (Zufallsbytes führen zu `format`-Fehler).
  - **Testvektoren:** Argon2id aus RFC 9106, HKDF aus RFC 5869, PKCE S256 aus RFC 7636.
  - **CRDT:** Konvergenz-Test mit festem Zufallsstartwert. Drei Docs bekommen zufällige Änderungen und werden in zufälliger Reihenfolge abgeglichen. Danach müssen die materialisierten Zeilen identisch sein. Status folgt dem jüngsten `history`-Eintrag. Gleichzeitige Bearbeitung von `notes` verliert nichts. Gelöschte Einträge kehren nicht zurück.
  - **Adapter** mit gemocktem `fetch`: Upload, List, Download, 401 → Token erneuern → Wiederholung, longpoll, delta/changes.
  - **Server:** Broker (Origin, Body-Limit, Drosselung, kein Logging) und Signaling (Postfach über zwei simulierte Prozesse im selben Verzeichnis, Ablauf, Größenlimit).
- **Playwright** (sequenziell)
  - Verschlüsselte Datei → alles löschen → Import per Passwort und per Wiederherstellungsschlüssel.
  - **Zwei Browser-Contexts:** beide offline an derselben Bewerbung ändern → Abgleich über eine simulierte Dropbox (`page.route`) → beide zeigen denselben zusammengeführten Stand.
  - **Live-Kopplung zweier Pages** über WebRTC in Chromium, Prüfcode, Live-Änderung kommt drüben an.
  - **Kein Request auf `/cloud/callback` oder `/pair` ans Netz.** **Kein Request an einen Host außerhalb der Allowlist** (`page.on('request')` über alle Tests).
  - Neues Gerät überschreibt nichts.
  - axe nach WCAG 2.2 AAA für Assistent, Geräteliste und Dialoge, beide Themes, 390 px.
- **Manuell (C1/C2):** echte Anbieter; iPhone „In Dateien sichern“ → iCloud → Mac-Import; Koppeln Handy ↔ Desktop über zwei verschiedene Netze; Verhalten, wenn die direkte Verbindung scheitert.
- **Sicherheit:** Prüfung mit dem `security-auditor` nach Phase 1, 4 und 6. `npm audit` in CI.

## 10. Risiken und offene Punkte

- **Passenger:** Teilen sich die Prozesse ein Verzeichnis, und überleben 25-s-Requests? Das klärt Phase 0. Falls nicht, geht das Signaling über den Cloud-Ordner beider Geräte, langsamer, aber ohne Server.
- **Freigaben der Anbieter:** Dropbox-Produktionsfreigabe ab 50 Nutzern, Google-Verifizierung (Tage bis Wochen), Microsoft-Hinweis „unverified“ ohne MPN-ID.
- **Yjs-Dokumentgröße:** Wächst mit der Historie. Gegenmittel sind regelmäßiges Verdichten und PDFs außerhalb des Docs.
- **Kein TURN:** In restriktiven Netzen gibt es keinen Live-Abgleich. Die Cloud fängt das auf, und die UI sagt es.
- **Safari ohne installierte PWA:** Speicher kann nach 7 Tagen ohne Nutzung gelöscht werden. Dann wird neu gekoppelt, und die UI erklärt das.

## Quellen (am 2026-10-01 geprüft)

- **Google**
  - Implicit Flow nur noch „legacy“, Code-Modell tauscht im Backend
  - `drive.appdata` ist nicht sensibel (developers.google.com/identity/protocols/oauth2/javascript-implicit-flow, …/identity/oauth2/web/guides/use-code-model, developers.google.com/workspace/drive/api/guides/api-specific-auth)
- **Dropbox:** PKCE ohne Secret, Refresh-Token mit `offline`, App-Ordner (docs.dropboxapi.com/dropbox-api/docs/oauth)
- **Microsoft:** SPA mit PKCE ohne Secret, `fragment` nur für Code, Refresh-Token 24 h (learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- **pCloud:** Implicit-Token für JS-Apps, keine Beschränkung auf einen App-Ordner, EU über `eapi` (docs.pcloud.com/methods/oauth_2.0/authorize.html)
- **OWASP Password Storage Cheat Sheet:** Argon2id mindestens 19 MiB/t = 2, PBKDF2 mit 600.000 Iterationen
- **WICG `webcrypto-modern-algos`:** Argon2 vorgeschlagen, in Browsern noch nicht ausgeliefert
- **Proton:** Drive-SDK für Drittanbieter erst Ende 2026/Anfang 2027 (proton.me/blog/drive-sdk-january-2026)
- **npm** (2026-10-01): yjs 13.6.33, lib0 0.2.119, hash-wasm 4.12.0, qrcode-generator 2.0.4, alle MIT
