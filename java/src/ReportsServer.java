/*
 * ReportsServer.java
 * -------------------------------------------------------------------
 * Camp Mayagay - Admin Reports module (Java backend).
 *
 * This is a small, dependency-free Java web service that powers the
 * "Reports" page of the admin dashboard (dashboard-admin.html). It is
 * a SEPARATE server from PHP - it runs on its own port (default 8081)
 * next to your existing XAMPP/Apache setup.
 *
 * WHY A SEPARATE JAVA SERVICE INSTEAD OF JUST PHP?
 * It talks to the SAME reservations/feedback data (through the PHP
 * API you already have), but does the report building - totals,
 * revenue, occupancy per cabin, CSV export - in Java. This is a
 * simple example of a polyglot system: PHP handles auth/booking/
 * CRUD, Java handles reporting/analytics, and the browser (HTML/CSS/
 * JavaScript) is the single front-end that talks to both.
 *
 * HOW IT WORKS
 * 1. The admin is already logged in through PHP (dashboard-admin.html),
 *    so the browser holds a PHPSESSID cookie for your site.
 * 2. When the admin opens the Reports page, the page's JavaScript
 *    calls this Java service directly, e.g.:
 *        fetch('http://localhost:8081/reports/summary', { credentials: 'include' })
 * 3. Because the browser is on the same host (localhost / 127.0.0.1),
 *    it sends the PHPSESSID cookie along with that request too.
 * 4. This Java service reads that cookie from the incoming request and
 *    forwards it to php/api.php?action=reservations_list and
 *    php/api.php?action=feedback_list, so PHP recognizes the same
 *    logged-in admin and returns the same data your dashboard already
 *    uses.
 * 5. Java then aggregates that JSON into a report (totals, revenue,
 *    per-cabin breakdown, per-status breakdown) and either returns it
 *    as JSON (for the on-screen summary cards) or as a downloadable
 *    CSV file (for the "Download CSV Report" button).
 *
 * HOW TO RUN (Windows / XAMPP, matches the rest of this project)
 *   1. Make sure XAMPP's Apache + MySQL are running and you can open
 *      the admin dashboard normally in the browser and log in.
 *   2. Open Command Prompt in this "java" folder and run:
 *          javac -d out src\ReportsServer.java
 *          java -cp out ReportsServer
 *      (On Mac/Linux: javac -d out src/ReportsServer.java && java -cp out ReportsServer)
 *   3. You should see: "Camp Mayagay Reports service running on http://localhost:8081"
 *   4. Leave that window open, then open the admin dashboard in your
 *      browser as usual and click "Reports" in the sidebar.
 *
 * CONFIGURATION
 *   - PHP_BASE_URL below must point at where your PHP project is
 *     served (XAMPP default shown). Change it if your folder name/
 *     port differs.
 *   - No external libraries or Maven/Gradle needed - this file only
 *     uses classes built into the standard Java SE runtime
 *     (java.net.http, com.sun.net.httpserver), so `javac` alone is
 *     enough to compile it.
 * -------------------------------------------------------------------
 */

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ReportsServer {

    /** Where your PHP project is served. Change the port/path if yours differs. */
    private static final String PHP_BASE_URL = "http://localhost/camp-mayagay";

    /** Port this Java service listens on. The dashboard JS calls this. */
    private static final int JAVA_PORT = 8081;

    private static final HttpClient HTTP_CLIENT = HttpClient.newHttpClient();

    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(JAVA_PORT), 0);

        server.createContext("/reports/summary", new SummaryHandler());
        server.createContext("/reports/export.csv", new CsvExportHandler());
        server.createContext("/reports/health", new HealthHandler());

        server.setExecutor(null);
        server.start();

        System.out.println("=======================================================");
        System.out.println(" Camp Mayagay Reports service (Java)");
        System.out.println(" Running on http://localhost:" + JAVA_PORT);
        System.out.println(" Talking to PHP backend at " + PHP_BASE_URL);
        System.out.println(" Endpoints:");
        System.out.println("   GET /reports/summary     -> JSON report");
        System.out.println("   GET /reports/export.csv  -> CSV download");
        System.out.println("   GET /reports/health       -> service check");
        System.out.println("=======================================================");
    }

    /* ================================================================
       HANDLERS
    ================================================================ */

    static class HealthHandler implements HttpHandler {
        public void handle(HttpExchange exchange) throws IOException {
            withCors(exchange);
            if (preflight(exchange)) return;
            writeJson(exchange, 200, "{\"success\":true,\"service\":\"reports-java\",\"status\":\"ok\"}");
        }
    }

    static class SummaryHandler implements HttpHandler {
        public void handle(HttpExchange exchange) throws IOException {
            withCors(exchange);
            if (preflight(exchange)) return;

            String cookie = exchange.getRequestHeaders().getFirst("Cookie");
            try {
                Report report = buildReport(cookie);
                writeJson(exchange, 200, report.toJson());
            } catch (ReportAuthException e) {
                writeJson(exchange, 401, "{\"success\":false,\"message\":\"Not logged in as admin. Please log in to the admin dashboard first.\"}");
            } catch (Exception e) {
                writeJson(exchange, 500, "{\"success\":false,\"message\":" + jsonString("Report error: " + e.getMessage()) + "}");
            }
        }
    }

    static class CsvExportHandler implements HttpHandler {
        public void handle(HttpExchange exchange) throws IOException {
            withCors(exchange);
            if (preflight(exchange)) return;

            String cookie = exchange.getRequestHeaders().getFirst("Cookie");
            try {
                Report report = buildReport(cookie);
                String csv = report.toCsv();
                byte[] bytes = csv.getBytes(StandardCharsets.UTF_8);

                exchange.getResponseHeaders().add("Content-Type", "text/csv; charset=utf-8");
                exchange.getResponseHeaders().add("Content-Disposition",
                        "attachment; filename=\"camp-mayagay-report-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmm")) + ".csv\"");
                exchange.sendResponseHeaders(200, bytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(bytes);
                }
            } catch (ReportAuthException e) {
                writeJson(exchange, 401, "{\"success\":false,\"message\":\"Not logged in as admin.\"}");
            } catch (Exception e) {
                writeJson(exchange, 500, "{\"success\":false,\"message\":" + jsonString("Report error: " + e.getMessage()) + "}");
            }
        }
    }

    /* ================================================================
       REPORT BUILDING - calls the existing PHP API and aggregates it
    ================================================================ */

    static class ReportAuthException extends RuntimeException {}

    static Report buildReport(String cookieHeader) throws IOException, InterruptedException {
        String reservationsJson = callPhp("action=reservations_list", cookieHeader);
        String feedbackJson = callPhp("action=feedback_list", cookieHeader);

        if (reservationsJson.contains("\"success\":false") && reservationsJson.contains("must be logged in")) {
            throw new ReportAuthException();
        }

        List<Map<String, String>> reservations = parseObjectArray(reservationsJson, "reservations");
        List<Map<String, String>> feedbackList = parseObjectArray(feedbackJson, "feedback");

        Report report = new Report();
        report.generatedAt = LocalDateTime.now().format(DateTimeFormatter.ofPattern("MMM d, yyyy - h:mm a"));

        for (Map<String, String> r : reservations) {
            report.totalReservations++;
            double amount = parseDouble(r.getOrDefault("total_amount", "0"));
            String status = r.getOrDefault("status", "pending");

            report.statusCounts.merge(status, 1, Integer::sum);

            if (!status.equals("declined") && !status.equals("cancelled")) {
                report.totalRevenue += amount;
            }

            String cabin = r.getOrDefault("cabin_name", "Unknown");
            CabinStat stat = report.cabinStats.computeIfAbsent(cabin, k -> new CabinStat());
            stat.bookings++;
            stat.revenue += amount;

            report.guestsTotal += (int) parseDouble(r.getOrDefault("guests_count", "1"));
        }

        report.totalFeedback = feedbackList.size();
        double ratingSum = 0;
        for (Map<String, String> f : feedbackList) {
            ratingSum += parseDouble(f.getOrDefault("rating", "0"));
        }
        report.averageRating = feedbackList.isEmpty() ? 0 : (ratingSum / feedbackList.size());

        return report;
    }

    static String callPhp(String queryAction, String cookieHeader) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(PHP_BASE_URL + "/php/api.php?" + queryAction))
                .timeout(java.time.Duration.ofSeconds(10))
                .POST(HttpRequest.BodyPublishers.ofString("{}"))
                .header("Content-Type", "application/json");

        if (cookieHeader != null && !cookieHeader.isBlank()) {
            builder.header("Cookie", cookieHeader);
        }

        HttpResponse<String> response = HTTP_CLIENT.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        return response.body();
    }

    /* ================================================================
       REPORT MODEL
    ================================================================ */

    static class CabinStat {
        int bookings = 0;
        double revenue = 0;
    }

    static class Report {
        String generatedAt;
        int totalReservations = 0;
        int guestsTotal = 0;
        double totalRevenue = 0;
        int totalFeedback = 0;
        double averageRating = 0;
        Map<String, Integer> statusCounts = new LinkedHashMap<>();
        Map<String, CabinStat> cabinStats = new LinkedHashMap<>();

        String toJson() {
            StringBuilder sb = new StringBuilder();
            sb.append("{");
            sb.append("\"success\":true,");
            sb.append("\"generated_at\":").append(jsonString(generatedAt)).append(",");
            sb.append("\"total_reservations\":").append(totalReservations).append(",");
            sb.append("\"guests_total\":").append(guestsTotal).append(",");
            sb.append("\"total_revenue\":").append(fmt(totalRevenue)).append(",");
            sb.append("\"total_feedback\":").append(totalFeedback).append(",");
            sb.append("\"average_rating\":").append(fmt(averageRating)).append(",");

            sb.append("\"status_breakdown\":{");
            int i = 0;
            for (Map.Entry<String, Integer> e : statusCounts.entrySet()) {
                if (i++ > 0) sb.append(",");
                sb.append(jsonString(e.getKey())).append(":").append(e.getValue());
            }
            sb.append("},");

            sb.append("\"cabin_breakdown\":[");
            i = 0;
            for (Map.Entry<String, CabinStat> e : cabinStats.entrySet()) {
                if (i++ > 0) sb.append(",");
                sb.append("{\"cabin\":").append(jsonString(e.getKey()))
                  .append(",\"bookings\":").append(e.getValue().bookings)
                  .append(",\"revenue\":").append(fmt(e.getValue().revenue))
                  .append("}");
            }
            sb.append("]");

            sb.append("}");
            return sb.toString();
        }

        String toCsv() {
            StringBuilder sb = new StringBuilder();
            sb.append("Camp Mayagay - Reservation Report\n");
            sb.append("Generated,").append(csvSafe(generatedAt)).append("\n\n");

            sb.append("Metric,Value\n");
            sb.append("Total Reservations,").append(totalReservations).append("\n");
            sb.append("Total Guests,").append(guestsTotal).append("\n");
            sb.append("Total Revenue (PHP),").append(fmt(totalRevenue)).append("\n");
            sb.append("Total Feedback Entries,").append(totalFeedback).append("\n");
            sb.append("Average Rating,").append(fmt(averageRating)).append("\n\n");

            sb.append("Status,Count\n");
            for (Map.Entry<String, Integer> e : statusCounts.entrySet()) {
                sb.append(csvSafe(e.getKey())).append(",").append(e.getValue()).append("\n");
            }
            sb.append("\n");

            sb.append("Cabin,Bookings,Revenue (PHP)\n");
            for (Map.Entry<String, CabinStat> e : cabinStats.entrySet()) {
                sb.append(csvSafe(e.getKey())).append(",")
                  .append(e.getValue().bookings).append(",")
                  .append(fmt(e.getValue().revenue)).append("\n");
            }
            return sb.toString();
        }
    }

    /* ================================================================
       TINY JSON HELPERS (no external library - good enough for the
       flat, known shape returned by php/api.php)
    ================================================================ */

    /** Extracts a JSON array of flat objects under the given key, as a list of String maps. */
    static List<Map<String, String>> parseObjectArray(String json, String key) {
        List<Map<String, String>> results = new ArrayList<>();
        String marker = "\"" + key + "\":[";
        int start = json.indexOf(marker);
        if (start < 0) return results;
        start += marker.length();

        int depth = 1;
        int i = start;
        int objStart = -1;
        int braceDepth = 0;
        while (i < json.length() && depth > 0) {
            char c = json.charAt(i);
            if (c == '[') depth++;
            else if (c == ']') { depth--; if (depth == 0) break; }
            else if (c == '{') { if (braceDepth == 0) objStart = i; braceDepth++; }
            else if (c == '}') {
                braceDepth--;
                if (braceDepth == 0 && objStart >= 0) {
                    results.add(parseFlatObject(json.substring(objStart, i + 1)));
                    objStart = -1;
                }
            }
            i++;
        }
        return results;
    }

    private static final Pattern FIELD_PATTERN = Pattern.compile(
            "\"([a-zA-Z0-9_]+)\":(?:\"((?:[^\"\\\\]|\\\\.)*)\"|(-?\\d+(?:\\.\\d+)?)|null)"
    );

    static Map<String, String> parseFlatObject(String objJson) {
        Map<String, String> map = new LinkedHashMap<>();
        Matcher m = FIELD_PATTERN.matcher(objJson);
        while (m.find()) {
            String field = m.group(1);
            String strVal = m.group(2);
            String numVal = m.group(3);
            if (strVal != null) {
                map.put(field, strVal.replace("\\\"", "\"").replace("\\\\", "\\"));
            } else if (numVal != null) {
                map.put(field, numVal);
            }
        }
        return map;
    }

    static double parseDouble(String s) {
        try { return Double.parseDouble(s); } catch (Exception e) { return 0; }
    }

    static String fmt(double d) {
        return String.format("%.2f", d);
    }

    static String csvSafe(String s) {
        if (s == null) return "";
        if (s.contains(",") || s.contains("\"") || s.contains("\n")) {
            return "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }

    static String jsonString(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                default: sb.append(c);
            }
        }
        sb.append("\"");
        return sb.toString();
    }

    /* ================================================================
       LOW-LEVEL HTTP HELPERS
    ================================================================ */

    static void withCors(HttpExchange exchange) {
        String origin = exchange.getRequestHeaders().getFirst("Origin");
        exchange.getResponseHeaders().add("Access-Control-Allow-Origin", origin != null ? origin : "*");
        exchange.getResponseHeaders().add("Access-Control-Allow-Credentials", "true");
        exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");
    }

    static boolean preflight(HttpExchange exchange) throws IOException {
        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            return true;
        }
        return false;
    }

    static void writeJson(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
