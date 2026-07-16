#!/usr/bin/env python3
"""
GNOME Stocks Desktop Widget (Phase 2b).
A GTK3 window hosting a WebKit2 WebView that renders a Google Finance-style
stock dashboard. Communicates with the local API server on localhost:5005.
"""

import os
import sys
import signal

import gi
gi.require_version('Gtk', '3.0')
gi.require_version('WebKit2', '4.0')
from gi.repository import Gtk, WebKit2, Gdk, GLib

# ─── Paths ───────────────────────────────────────────────────────────────────

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(SCRIPT_DIR, "web")
INDEX_HTML = os.path.join(WEB_DIR, "index.html")
API_BASE = "http://127.0.0.1:5005"


class StockWidget(Gtk.Window):
    def __init__(self):
        super().__init__(title="GNOME Stocks")

        # ── Window setup ──
        self.set_default_size(1200, 800)
        self.set_position(Gtk.WindowPosition.CENTER)

        # Dark titlebar
        settings = Gtk.Settings.get_default()
        settings.set_property("gtk-application-prefer-dark-theme", True)

        # Set window icon name
        self.set_icon_name("accessories-calculator")

        # ── Header bar ──
        header = Gtk.HeaderBar()
        header.set_show_close_button(True)
        header.set_title("📈 GNOME Stocks")
        header.set_subtitle("Desktop Widget")
        self.set_titlebar(header)

        # Fullscreen button
        fullscreen_btn = Gtk.Button()
        fullscreen_btn.set_image(Gtk.Image.new_from_icon_name("view-fullscreen-symbolic", Gtk.IconSize.BUTTON))
        fullscreen_btn.set_tooltip_text("Toggle fullscreen")
        fullscreen_btn.connect("clicked", self._on_fullscreen_toggle)
        header.pack_end(fullscreen_btn)

        # Refresh button
        refresh_btn = Gtk.Button()
        refresh_btn.set_image(Gtk.Image.new_from_icon_name("view-refresh-symbolic", Gtk.IconSize.BUTTON))
        refresh_btn.set_tooltip_text("Refresh data")
        refresh_btn.connect("clicked", self._on_refresh)
        header.pack_end(refresh_btn)

        # ── WebKit2 WebView ──
        self._webview = WebKit2.WebView()

        # WebView settings
        ws = self._webview.get_settings()
        ws.set_enable_javascript(True)
        ws.set_enable_developer_extras(True)  # Enable DevTools (F12)
        ws.set_allow_file_access_from_file_urls(True)
        ws.set_allow_universal_access_from_file_urls(True)
        ws.set_enable_write_console_messages_to_stdout(True)
        ws.set_javascript_can_access_clipboard(True)
        ws.set_enable_smooth_scrolling(True)

        # Set dark background to avoid white flash on load
        rgba = Gdk.RGBA()
        rgba.parse("#202124")
        self._webview.set_background_color(rgba)

        # Load the HTML
        self._load_ui()

        # Pack
        self.add(self._webview)
        self.connect("destroy", Gtk.main_quit)

        # Handle keyboard shortcuts
        self.connect("key-press-event", self._on_key_press)

    def _load_ui(self):
        """Load the local HTML file into the WebView."""
        if not os.path.exists(INDEX_HTML):
            print(f"[widget] ERROR: {INDEX_HTML} not found!", file=sys.stderr)
            # Show error in webview
            self._webview.load_html(
                '<html><body style="background:#202124;color:#E8EAED;font-family:sans-serif;'
                'display:flex;align-items:center;justify-content:center;height:100vh;">'
                '<h1>⚠️ web/index.html not found</h1></body></html>',
                "file://"
            )
            return

        uri = "file://" + INDEX_HTML
        self._webview.load_uri(uri)

    def _on_refresh(self, button):
        """Reload the webview."""
        self._webview.reload()

    def _on_fullscreen_toggle(self, button):
        """Toggle fullscreen mode."""
        if self.get_window().get_state() & Gdk.WindowState.FULLSCREEN:
            self.unfullscreen()
        else:
            self.fullscreen()

    def _on_key_press(self, widget, event):
        """Handle keyboard shortcuts."""
        keyval = event.keyval
        state = event.state

        # F5 or Ctrl+R → Refresh
        if keyval == Gdk.KEY_F5 or (state & Gdk.ModifierType.CONTROL_MASK and keyval == Gdk.KEY_r):
            self._webview.reload()
            return True

        # F11 → Fullscreen
        if keyval == Gdk.KEY_F11:
            self._on_fullscreen_toggle(None)
            return True

        # F12 → DevTools (Inspector)
        if keyval == Gdk.KEY_F12:
            inspector = self._webview.get_inspector()
            inspector.show()
            return True

        # Escape → Exit fullscreen
        if keyval == Gdk.KEY_Escape:
            if self.get_window().get_state() & Gdk.WindowState.FULLSCREEN:
                self.unfullscreen()
                return True

        return False


def main():
    # Handle SIGINT gracefully
    signal.signal(signal.SIGINT, signal.SIG_DFL)

    win = StockWidget()
    win.show_all()
    Gtk.main()


if __name__ == "__main__":
    main()
