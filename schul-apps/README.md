# Meine Schul-Apps: Notenheft & Wochenplaner

Zwei eigenständige Offline-Apps für den Schulalltag. Beide laufen komplett im
Browser deines Geräts, **keine Daten werden an einen Server gesendet** – alles
bleibt lokal auf dem Tablet/Handy, auf dem du sie öffnest.

## Kurzfassung

- Kein Account, kein Abo, keine Cloud.
- Funktionieren komplett ohne Internet, sobald sie einmal geladen wurden.
- **Notenheft** und **Wochenplaner** speichern ihre Daten getrennt voneinander.
- Beide haben unter „Verwalten"/"Ferien" einen Export/Import-Knopf für Backups
  – nutze den regelmäßig, am besten wöchentlich!

## Einrichtung (einmalig, ca. 10 Minuten)

Damit die Apps auf dem Tablet wie echte, installierte Apps aussehen (eigenes
Icon, kein Browser-Rahmen) und der Offline-Cache funktioniert, müssen sie
einmal über eine Adresse mit `https://` geladen werden. Der einfachste
kostenlose Weg ist GitHub Pages:

1. Kostenlosen Account auf [github.com](https://github.com) anlegen (falls
   noch nicht vorhanden) – nur E-Mail-Adresse nötig, keine Kreditkarte.
2. Neues Repository erstellen, z. B. „schul-apps" (öffentlich oder privat,
   beides geht).
3. Alle Dateien aus diesem Ordner hochladen: über „Add file → Upload files"
   im Browser den kompletten Inhalt dieses Ordners hineinziehen (die Datei
   `index.html` **und** die beiden Ordner `notenheft/` und `wochenplaner/`
   mitsamt ihrem Inhalt). Direkt committen.
4. Im Repository zu „Settings → Pages" gehen, bei „Source" den Branch `main`
   und Ordner `/ (root)` auswählen, speichern.
5. Nach ca. 1–2 Minuten ist die Startseite unter einer Adresse wie
   `https://DEINNAME.github.io/schul-apps/` erreichbar – dort kannst du
   zwischen beiden Apps wählen.

## Auf dem Tablet/Handy installieren

Für **jede der beiden Apps einzeln**, damit du zwei getrennte App-Icons
bekommst:

**iPad/iPhone (Safari):**
1. Auf der Startseite auf „Notenheft" bzw. „Wochenplaner" tippen, sodass sich
   die jeweilige App öffnet.
2. Teilen-Symbol antippen → „Zum Home-Bildschirm".
3. Das Icon erscheint wie eine normale App und öffnet sich ohne
   Browserleiste.
4. Das Gleiche für die andere App wiederholen.

**Android (Chrome):**
1. Auf der Startseite auf „Notenheft" bzw. „Wochenplaner" tippen.
2. Menü (drei Punkte) → „App installieren" bzw. „Zum Startbildschirm
   hinzufügen".
3. Das Gleiche für die andere App wiederholen.

Danach funktionieren beide Apps auch im Flugmodus/ohne WLAN, weil alle
Dateien beim ersten Öffnen automatisch offline zwischengespeichert werden.

## Updates

Wenn du später eine neue Version bekommst: Dateien im GitHub-Repository
ersetzen und in der jeweiligen `sw.js` die Zahl in `CACHE_NAME` um eins
erhöhen (z. B. `notenheft-cache-v2` → `v3`), sonst lädt das Gerät weiter die
alte zwischengespeicherte Version. Danach die App einmal schließen und neu
öffnen.

## Backup nicht vergessen

Da alle Daten nur auf diesem einen Gerät liegen: Exportiere regelmäßig eine
Sicherungsdatei

- beim **Notenheft** unter „Verwalten → Datensicherung",
- beim **Wochenplaner** ganz unten auf der Seite unter „Datensicherung",

und speichere sie z. B. in iCloud/Google Drive/E-Mail an dich selbst. Bei
Gerätewechsel, Diebstahl oder Browser-Daten-Löschung ist das die einzige
Möglichkeit, die Daten wiederherzustellen.

## Passwortschutz

Es gibt keinen eingebauten Passwortschutz in den Apps (das haben wir bewusst
wieder rausgenommen). Nutze stattdessen die **Bildschirmsperre deines
Tablets** (PIN/Fingerabdruck/Gesichtserkennung) – die schützt zuverlässig
alles auf dem Gerät, nicht nur diese Apps.
