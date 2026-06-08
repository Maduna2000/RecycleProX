package com.renovopros.scalestation;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ThermalPrinterPlugin.class);
        super.onCreate(savedInstanceState);
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

        // Viewport & zoom — prevents layout issues on tablets
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setDisplayZoomControls(false);

        // Cache — load fresh but use cache when offline
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Huawei fix: set Chrome-compatible user agent so Next.js renders correctly
        String currentUA = settings.getUserAgentString();
        settings.setUserAgentString(currentUA + " ScaleStation/1.0");

        // Prevent blank screen on resume after OS kills background process
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.setVisibility(WebView.VISIBLE);
            }
        });
    }

    // Fix: Android back button causes WebView history navigation → goes back to step 1.
    // Instead, minimise the app so the web app manages its own navigation state.
    @Override
    public void onBackPressed() {
        moveTaskToBack(true);
    }
}
