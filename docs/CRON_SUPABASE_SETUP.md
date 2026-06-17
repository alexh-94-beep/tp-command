# Booking-Inbox Cron via Supabase (pg_cron + pg_net)

Stündliches Polling der Booking.com-Mails ohne Vercel Pro — der Cron
läuft in der Supabase-Datenbank selbst und pingt unseren API-Endpoint.

## Voraussetzung
- ENV `CRON_SECRET` ist in Vercel Production gesetzt (war für die anderen
  Crons schon nötig).
- Du brauchst Admin-Zugriff aufs Supabase-Projekt **Prod**
  (`kbuelyfeqvgtpipyhrcx`).

## Schritt 1: Extensions aktivieren
1. Supabase Dashboard → Projekt **TP-Command Prod** öffnen
2. Linke Sidebar → **Database** → **Extensions**
3. In der Suche `pg_cron` eintippen → **Enable**
4. In der Suche `pg_net` eintippen → **Enable**

## Schritt 2: CRON_SECRET in Vault hinterlegen
1. CRON_SECRET aus Vercel kopieren:
   - Vercel Dashboard → tp-command → Settings → Environment Variables
   - `CRON_SECRET` → Show → Wert kopieren
2. Supabase Dashboard → **SQL Editor** → New Query
3. Folgendes ausführen (`<PASTE>` durch den kopierten Wert ersetzen):
   ```sql
   select vault.create_secret('<PASTE>', 'tp_cron_secret');
   ```
4. Antwort: eine UUID. Das Secret ist jetzt verschlüsselt im Vault.

## Schritt 3: Cron-Job anlegen
Im selben SQL Editor:

```sql
select cron.schedule(
  'booking-inbox-poll-hourly',
  '0 * * * *',  -- jede volle Stunde
  $$
  select net.http_get(
    url := 'https://tp-command.vercel.app/api/cron/booking-inbox-poll',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (
        select decrypted_secret
          from vault.decrypted_secrets
         where name = 'tp_cron_secret'
      )
    ),
    timeout_milliseconds := 30000
  ) as request_id
  $$
);
```

Antwort: eine Zahl (Job-ID, z.B. `1`).

## Verifizieren

**Job-Liste anzeigen:**
```sql
select jobid, schedule, jobname, active
  from cron.job
 where jobname = 'booking-inbox-poll-hourly';
```

**Manuell sofort triggern (zum Test):**
```sql
select net.http_get(
  url := 'https://tp-command.vercel.app/api/cron/booking-inbox-poll',
  headers := jsonb_build_object(
    'Authorization',
    'Bearer ' || (
      select decrypted_secret
        from vault.decrypted_secrets
       where name = 'tp_cron_secret'
    )
  )
) as request_id;
```
Dann in **TP-Command** → Settings → Booking-Inbox prüfen ob neue
Einträge erscheinen.

**Run-Historie sehen:**
```sql
select runid, job_pid, database, username, status, return_message, start_time, end_time
  from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'booking-inbox-poll-hourly')
 order by start_time desc
 limit 20;
```

## Frequenz ändern
```sql
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'booking-inbox-poll-hourly'),
  schedule := '*/30 * * * *'  -- z.B. alle 30 min
);
```

## Job pausieren / wieder aktivieren
```sql
-- Pause
select cron.alter_job(
  (select jobid from cron.job where jobname = 'booking-inbox-poll-hourly'),
  active := false
);

-- Wieder aktiv
select cron.alter_job(
  (select jobid from cron.job where jobname = 'booking-inbox-poll-hourly'),
  active := true
);
```

## Job löschen (falls Migration auf Vercel Pro / cron-job.org)
```sql
select cron.unschedule('booking-inbox-poll-hourly');
```

## Secret rotieren
Wenn `CRON_SECRET` in Vercel rotiert wird:
```sql
-- 1. Vault-Eintrag updaten
select vault.update_secret(
  (select id from vault.secrets where name = 'tp_cron_secret'),
  '<NEUER_WERT>',
  'tp_cron_secret'
);
-- 2. Cron läuft automatisch mit dem neuen Wert weiter — kein Re-Schedule nötig
```

## Was passiert intern
- pg_cron läuft als Postgres-Background-Worker in der `postgres`-Datenbank
- Jeden Lauf macht `net.http_get` einen HTTP-Aufruf an unseren Vercel-Endpoint
- Der Endpoint prüft den Bearer-Token (timing-safe), pullt die Mailbox,
  schreibt nach `processed_emails` + `pending_reservations`
- Antwort wird in `cron.job_run_details` geloggt — bei Fehler steht der
  HTTP-Status / Body dort
