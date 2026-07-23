SCHRITT 8 – VERSION 0.0.8

V8 baut auf dem installierten V7-Stand auf und ergänzt Polling-Diagnoseobjekte:

- info.pollingActive
  true, solange der PollingService aktiv ist

- info.lastPoll
  Zeitstempel jedes gestarteten Polling-Versuchs

- info.lastSuccessfulPoll
  Zeitstempel des letzten vollständig erfolgreichen Pollings

- info.lastError
  Letzter Polling-Fehler; wird nach einem erfolgreichen Polling wieder geleert

Damit ist das Polling auch ohne Debug-Log direkt unter den ioBroker-Objekten sichtbar.

Anwenden:

chmod +x apply_step8.sh
./apply_step8.sh /opt/iobroker/iobroker.kripsol

Danach:

cd /opt/iobroker/iobroker.kripsol
npm pack

Erwartete Datei:

iobroker.kripsol-0.0.8.tgz

Installieren:

iobroker url "file:///opt/iobroker/iobroker.kripsol/iobroker.kripsol-0.0.8.tgz"
iobroker restart kripsol.0
iobroker logs kripsol.0 --watch

Kontrolle in ioBroker:

kripsol.0.info.pollingActive
kripsol.0.info.lastPoll
kripsol.0.info.lastSuccessfulPoll
kripsol.0.info.lastError

Bei einem Polling-Intervall von 30 Sekunden muss sich info.lastPoll ungefähr alle
30 Sekunden ändern. Bei erfolgreicher Cloudabfrage wird auch
info.lastSuccessfulPoll aktualisiert.

Commit:

git add .
git commit -m "V0.0.8"
git push
