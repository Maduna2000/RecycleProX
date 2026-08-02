package com.renovopros.guardstation;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Kiosk tablet stays plugged in and on-screen all shift — never let
        // the OS dim/sleep it away from under a guard mid-entry.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemBars();
        configureWebView();
    }

    // Immersive fullscreen — hides the status bar and navigation bar so the
    // WebView owns the whole screen like a real kiosk, not a browser tab.
    // "Sticky" so a swipe-in from the edge only shows them briefly before
    // they auto-hide again, rather than staying revealed. Must be re-applied
    // on every focus regain (system dialogs, app switches, etc. can bring
    // the system bars back — this is standard Android immersive-mode
    // behavior, not specific to this app).
    private void hideSystemBars() {
        View decorView = getWindow().getDecorView();
        decorView.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void configureWebView() {
        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();

        // Core — must be explicit for Huawei WebView
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);

        // Huawei fix: allow mixed content & force hardware rendering
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);

        // Viewport & zoom — prevents layout issues on tablets
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setDisplayZoomControls(false);

        // Cache — load fresh but use cache when offline
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Huawei fix: set Chrome-compatible user agent so Next.js renders correctly
        String currentUA = settings.getUserAgentString();
        settings.setUserAgentString(currentUA + " GuardStation/1.0");

        // NOTE: Do NOT set a custom WebViewClient here!
        // Capacitor's BridgeWebViewClient handles JavaScript bridge injection.
        // Replacing it breaks the bridge on older WebViews (like Huawei tablets).
    }

    // Fix: Android back button causes WebView history navigation → goes back to step 1.
    // Instead, minimise the app so the web app manages its own navigation state.
    @Override
    public void onBackPressed() {
        moveTaskToBack(true);
    }
}
