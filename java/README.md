# Camp Mayagay - Reports Module (Java)

This folder adds a **Java** backend service to the system, alongside the
existing **PHP** backend and the **HTML/CSS/JavaScript** front-end. It
powers the admin dashboard's **Reports** page (Sidebar > Reports).

```
Browser (HTML/CSS/JS)
   |
   |--- login, bookings, feedback, notifications --->  PHP  (php/api.php, MySQL)
   |
   \--- reports summary / CSV export ------------->  Java (java/src/ReportsServer.java)
                                                          |
                                                          \--> also calls php/api.php
                                                               to read the same data
```

The Java service does **not** talk to MySQL directly. It calls your
existing `php/api.php` (the same endpoint the rest of the dashboard
uses) using the admin's session cookie, then aggregates the results
into a report and a CSV export. This means:

- No new database driver/config to install.
- The report always matches what's actually in the database, because
  it's reading through the same API as the rest of the app.
- It's a genuine second language/service in the system (not just a
  renamed PHP file) - useful if your capstone requirements ask for a
  multi-language / multi-tier system.

## Requirements

- Java JDK 11 or newer (uses only classes built into the JDK -
  `java.net.http` and `com.sun.net.httpserver` - so there is **nothing
  to download from Maven/Gradle**; `javac`/`java` alone is enough).
- Your PHP project already running under XAMPP/Apache and reachable
  at `http://localhost/camp-mayagay` (adjust `PHP_BASE_URL` near the
  top of `ReportsServer.java` if your folder name or port is
  different).

## How to run

Open a terminal/Command Prompt inside this `java` folder:

```
javac -d out src/ReportsServer.java
java -cp out ReportsServer
```

You should see:

```
=======================================================
 Camp Mayagay Reports service (Java)
 Running on http://localhost:8081
 Talking to PHP backend at http://localhost/camp-mayagay
 Endpoints:
   GET /reports/summary     -> JSON report
   GET /reports/export.csv  -> CSV download
   GET /reports/health       -> service check
=======================================================
```

Leave that window open (it's a running server). Then, with XAMPP also
running, log in to the admin dashboard as usual in your browser and
click **Reports** in the sidebar - it will call this Java service
automatically.

## Endpoints

| Method | URL | What it does |
|---|---|---|
| GET | `http://localhost:8081/reports/summary` | Returns a JSON report: total reservations, total revenue, guests, feedback average, breakdown by status and by cabin. |
| GET | `http://localhost:8081/reports/export.csv` | Downloads the same report as a CSV file. |
| GET | `http://localhost:8081/reports/health` | Quick check that the Java service is up. |

## Notes / things you can change

- **Port**: change `JAVA_PORT` in `ReportsServer.java` if 8081 is
  already used on your machine.
- **PHP location**: change `PHP_BASE_URL` if your project isn't at
  `http://localhost/camp-mayagay`.
- **Authentication**: the Java service doesn't have its own login -
  it reuses the admin's existing PHP session cookie, so you must be
  logged in as admin in the same browser for the Reports page to load
  data.
- This is intentionally dependency-free so it compiles with a plain
  `javac`. If your instructor wants a "real" framework instead (Spring
  Boot, Servlets + Tomcat, etc.), the `buildReport(...)` method is the
  part to keep - only the HTTP server wiring in `main()` would change.
