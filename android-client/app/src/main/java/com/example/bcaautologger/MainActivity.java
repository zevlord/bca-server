package com.example.bcaautologger;

import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.View;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.materialswitch.MaterialSwitch;
import android.content.pm.PackageManager;

public class MainActivity extends AppCompatActivity {

    private View statusDot;
    private TextView tvServiceStatus;
    private MaterialButton btnNotificationPermission;
    private MaterialButton btnBatteryOptimization;
    private EditText etServerUrl;
    private MaterialButton btnSaveUrl;
    private MaterialButton btnTestWebhook;
    private TextView tvTestResult;
    private TextView tvLogText;
    private MaterialButton btnClearLog;
    private MaterialSwitch swCaptureAllApps;
    private MaterialButton btnResyncService;

    private final BroadcastReceiver logReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            updateLogDisplay();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Bind Views
        statusDot = findViewById(R.id.statusDot);
        tvServiceStatus = findViewById(R.id.tvServiceStatus);
        btnNotificationPermission = findViewById(R.id.btnNotificationPermission);
        btnBatteryOptimization = findViewById(R.id.btnBatteryOptimization);
        etServerUrl = findViewById(R.id.etServerUrl);
        btnSaveUrl = findViewById(R.id.btnSaveUrl);
        btnTestWebhook = findViewById(R.id.btnTestWebhook);
        tvTestResult = findViewById(R.id.tvTestResult);
        tvLogText = findViewById(R.id.tvLogText);
        btnClearLog = findViewById(R.id.btnClearLog);
        swCaptureAllApps = findViewById(R.id.swCaptureAllApps);
        btnResyncService = findViewById(R.id.btnResyncService);

        // Load Server URL from SharedPreferences
        SharedPreferences prefs = getSharedPreferences("bca_prefs", MODE_PRIVATE);
        String savedUrl = prefs.getString("pref_server_url", BCAListenerService.DEFAULT_URL);
        etServerUrl.setText(savedUrl);

        // Load Capture All Apps setting
        boolean isCaptureAll = prefs.getBoolean("pref_capture_all_apps", false);
        swCaptureAllApps.setChecked(isCaptureAll);

        swCaptureAllApps.setOnCheckedChangeListener((buttonView, isChecked) -> {
            prefs.edit().putBoolean("pref_capture_all_apps", isChecked).apply();
            Toast.makeText(this, "Capture All Apps: " + (isChecked ? "ON (Test Mode)" : "OFF"), Toast.LENGTH_SHORT).show();
        });

        // Setup Button Click Listeners
        btnNotificationPermission.setOnClickListener(v -> {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            startActivity(intent);
        });

        btnBatteryOptimization.setOnClickListener(v -> requestBatteryExemption());

        btnSaveUrl.setOnClickListener(v -> {
            String url = etServerUrl.getText().toString().trim();
            if (TextUtils.isEmpty(url)) {
                Toast.makeText(this, "Please enter a valid URL", Toast.LENGTH_SHORT).show();
                return;
            }
            prefs.edit().putString("pref_server_url", url).apply();
            Toast.makeText(this, "Server URL saved successfully!", Toast.LENGTH_SHORT).show();
        });

        btnTestWebhook.setOnClickListener(v -> sendTestWebhook());

        btnClearLog.setOnClickListener(v -> {
            prefs.edit().remove("pref_logs").apply();
            updateLogDisplay();
            Toast.makeText(this, "Log cleared", Toast.LENGTH_SHORT).show();
        });

        btnResyncService.setOnClickListener(v -> tryRebindService());
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateSystemStatus();
        updateLogDisplay();
        
        IntentFilter filter = new IntentFilter(BCAListenerService.ACTION_LOG_UPDATED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(logReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(logReceiver, filter);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        try {
            unregisterReceiver(logReceiver);
        } catch (Exception ignored) {}
    }

    private void updateSystemStatus() {
        boolean isNotificationEnabled = isNotificationServiceEnabled();
        if (isNotificationEnabled) {
            statusDot.setBackgroundResource(R.drawable.bg_dot_green);
            tvServiceStatus.setText("SERVICE ACTIVE & LISTENING");
            tvServiceStatus.setTextColor(getResources().getColor(R.color.status_green, getTheme()));
            btnNotificationPermission.setText("Granted ✓");
            btnNotificationPermission.setEnabled(false);
        } else {
            statusDot.setBackgroundResource(R.drawable.bg_dot_red);
            tvServiceStatus.setText("ACTION REQUIRED: GRANT NOTIFICATION ACCESS");
            tvServiceStatus.setTextColor(getResources().getColor(R.color.status_red, getTheme()));
            btnNotificationPermission.setText("Grant Access");
            btnNotificationPermission.setEnabled(true);
        }

        boolean isBatteryExempt = isBatteryOptimizationExempt();
        if (isBatteryExempt) {
            btnBatteryOptimization.setText("Exempted ✓");
            btnBatteryOptimization.setEnabled(false);
        } else {
            btnBatteryOptimization.setText("Exempt Battery");
            btnBatteryOptimization.setEnabled(true);
        }
    }

    private boolean isNotificationServiceEnabled() {
        ComponentName cn = new ComponentName(this, BCAListenerService.class);
        String flat = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return flat != null && flat.contains(cn.flattenToString());
    }

    private boolean isBatteryOptimizationExempt() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            return pm.isIgnoringBatteryOptimizations(getPackageName());
        }
        return false;
    }

    private void requestBatteryExemption() {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (Exception e) {
            Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            startActivity(intent);
        }
    }

    private void sendTestWebhook() {
        String url = etServerUrl.getText().toString().trim();
        if (TextUtils.isEmpty(url)) {
            Toast.makeText(this, "Enter a valid URL first", Toast.LENGTH_SHORT).show();
            return;
        }

        tvTestResult.setVisibility(View.VISIBLE);
        tvTestResult.setText("Sending test webhook payload...");

        BCAListenerService service = new BCAListenerService();
        service.sendToBackend("50000", "Test Transaction from App Dashboard", getPackageName(), url);

        tvTestResult.postDelayed(() -> {
            tvTestResult.setText("Test webhook sent! Check live log below.");
        }, 1000);
    }

    private void tryRebindService() {
        try {
            PackageManager pm = getPackageManager();
            ComponentName cn = new ComponentName(this, BCAListenerService.class);
            pm.setComponentEnabledSetting(cn,
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP);
            pm.setComponentEnabledSetting(cn,
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                    PackageManager.DONT_KILL_APP);
            Toast.makeText(this, "Notification Listener service re-synced!", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "Failed to re-sync service: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void updateLogDisplay() {
        SharedPreferences prefs = getSharedPreferences("bca_prefs", MODE_PRIVATE);
        String logs = prefs.getString("pref_logs", "");
        if (TextUtils.isEmpty(logs)) {
            tvLogText.setText("No transactions intercepted yet.\nListening for BCA notifications...");
        } else {
            tvLogText.setText(logs);
        }
    }
}