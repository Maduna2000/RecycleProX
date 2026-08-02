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
        // the OS dim/sleep it away from under a guard mid-entry. (The
        // earlier attempt at hiding the status/nav bars via raw
        // systemUiVisibility flags caused the WebView's viewport to render
        // at a stale/incorrect size — half the screen blank, taps landing
        // in the wrong place — on the actual tablet. Reverted rather than
        // guessed at further since there's no device here to test against;
        // revisit with WindowInsetsControllerCompat + proper edge-to-edge
        // handling if true fullscreen is still wanted later.)
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        configureWebView();
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

        // No overscroll glow/bounce — on a kiosk tablet a mis-registered
        // swipe near the top of the screen can otherwise look like (or
        // trigger) a pull-to-refresh, which would explain a login attempt
        // that visually "just refreshes and does nothing."
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

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
