package com.example.bcaautologger;

import android.app.Notification;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class BCAListenerService extends NotificationListenerService {
    private static final String TAG = "BCAListener";
    public static final String DEFAULT_URL = "https://bca-server-three.vercel.app/api/webhook";
    public static final String ACTION_LOG_UPDATED = "com.example.bcaautologger.ACTION_LOG_UPDATED";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;

        String packageName = sbn.getPackageName();
        if (packageName == null) return;

        Log.d(TAG, "Notification received from package: " + packageName);

        SharedPreferences prefs = getSharedPreferences("bca_prefs", Context.MODE_PRIVATE);
        boolean captureAllApps = prefs.getBoolean("pref_capture_all_apps", false);

        // Check for BCA-related package names
        boolean isBcaApp = captureAllApps ||
                packageName.equals("com.bca") ||
                packageName.equals("id.co.bca.mybca") ||
                packageName.equals("com.bca.mybca.omni.android") ||
                packageName.equals("id.co.bcadigital.blu") ||
                packageName.toLowerCase().contains("bca");

        if (isBcaApp) {
            Log.d(TAG, "Intercepted Notification from: " + packageName);
            Bundle extras = sbn.getNotification().extras;
            if (extras == null) return;

            // Extract text from notification title, main text, and big text
            CharSequence titleChar = extras.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence textChar = extras.getCharSequence(Notification.EXTRA_TEXT);
            CharSequence bigTextChar = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);

            String title = titleChar != null ? titleChar.toString() : "";
            String text = textChar != null ? textChar.toString() : "";
            String bigText = bigTextChar != null ? bigTextChar.toString() : "";

            String fullText = (title + " " + text + " " + bigText).trim();
            if (!fullText.isEmpty()) {
                Log.d(TAG, "Full Notification Content: " + fullText);
                processTransactionText(fullText, packageName);
            }
        }
    }

    private void processTransactionText(String rawText, String packageName) {
        // Regex to search for "Rp" or "IDR" followed by optional dot, optional spaces, and numbers/dots/commas
        Pattern pattern = Pattern.compile("(?:Rp|IDR)\\.?\\s*([0-9.,]+)", Pattern.CASE_INSENSITIVE);
        Matcher matcher = pattern.matcher(rawText);

        if (matcher.find()) {
            String amountString = matcher.group(1);
            if (amountString != null) {
                String cleanAmount = cleanAmount(amountString);
                Log.d(TAG, "Extracted Amount: " + cleanAmount);

                String serverUrl = getServerUrl();
                sendToBackend(cleanAmount, rawText, packageName, serverUrl);
            }
        }
    }

    public static String cleanAmount(String amountString) {
        if (amountString == null) return "0";
        String str = amountString.trim().replaceAll("\\s+", "");
        // Remove trailing cents like ,00 or .00
        if (str.matches(".*[.,]\\d{2}")) {
            str = str.substring(0, str.length() - 3);
        }
        String clean = str.replaceAll("[^0-9]", "");
        return clean.isEmpty() ? "0" : clean;
    }

    public void sendToBackend(String amount, String rawText, String targetUrl) {
        sendToBackend(amount, rawText, "Manual/Test", targetUrl);
    }

    public void sendToBackend(String amount, String rawText, String packageName, String targetUrl) {
        new Thread(() -> {
            String logEntry;
            String timestamp = new SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(new Date());

            try {
                URL url = new URL(targetUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                conn.setRequestProperty("Accept", "application/json");
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                conn.setDoOutput(true);

                // Use JSONObject for bulletproof JSON encoding (escapes quotes, newlines, etc.)
                JSONObject jsonPayload = new JSONObject();
                jsonPayload.put("amount", amount);
                jsonPayload.put("raw_text", rawText);
                jsonPayload.put("package_name", packageName);

                byte[] input = jsonPayload.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(input, 0, input.length);
                }

                int code = conn.getResponseCode();
                Log.d(TAG, "Server Response Code: " + code);
                String appIndicator = packageName.contains(".") ? packageName.substring(packageName.lastIndexOf(".") + 1) : packageName;
                logEntry = "[" + timestamp + "] [" + appIndicator + "] Rp " + amount + " -> Code: " + code;

            } catch (Exception e) {
                Log.e(TAG, "Failed to send data: " + e.getMessage());
                String appIndicator = packageName.contains(".") ? packageName.substring(packageName.lastIndexOf(".") + 1) : packageName;
                logEntry = "[" + timestamp + "] [" + appIndicator + "] Err Rp " + amount + ": " + e.getMessage();
            }

            appendLog(logEntry);
        }).start();
    }

    private String getServerUrl() {
        SharedPreferences prefs = getSharedPreferences("bca_prefs", Context.MODE_PRIVATE);
        return prefs.getString("pref_server_url", DEFAULT_URL);
    }

    private void appendLog(String logMessage) {
        SharedPreferences prefs = getSharedPreferences("bca_prefs", Context.MODE_PRIVATE);
        String currentLogs = prefs.getString("pref_logs", "");
        String newLogs = logMessage + "\n" + currentLogs;
        
        // Keep last 15 log entries
        String[] lines = newLogs.split("\n");
        StringBuilder sb = new StringBuilder();
        int count = Math.min(lines.length, 15);
        for (int i = 0; i < count; i++) {
            sb.append(lines[i]).append("\n");
        }

        prefs.edit().putString("pref_logs", sb.toString().trim()).apply();
        sendBroadcast(new Intent(ACTION_LOG_UPDATED));
    }
}