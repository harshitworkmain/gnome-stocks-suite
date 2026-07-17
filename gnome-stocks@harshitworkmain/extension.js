const { GObject, St, Clutter, GLib, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;

const Me = ExtensionUtils.getCurrentExtension();
const Popup = Me.imports.popup;

const DATA_FILE = '/dev/shm/gnome-stocks.json';

// ─── Helpers ────────────────────────────────────────────────────────────────

function _formatNumber(n) {
    // Add commas: 23002.15 → 23,002.15
    let parts = Number(n).toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
}

function _formatPrice(quote, showCurrency) {
    if (quote.price == null) return '—';
    let price = _formatNumber(quote.price);
    if (!showCurrency) return price;
    let cur = quote.currency || 'USD';
    if (cur === 'USD') return '$' + price;
    if (cur === 'INR') return '₹' + price;
    return price; // PTS — no prefix
}

function _formatPanelPrice(quote, showCurrency) {
    // Shorter format for panel (no commas for compactness if needed)
    if (quote.price == null) return '—';
    let price = Number(quote.price).toFixed(2);
    if (!showCurrency) return price;
    let cur = quote.currency || 'USD';
    if (cur === 'USD') return '$' + price;
    if (cur === 'INR') return '₹' + price;
    return price;
}

// ─── Main Indicator ─────────────────────────────────────────────────────────

var StockIndicator = GObject.registerClass(
class StockIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Stock Indicator');

        this._settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.stocks');

        // State
        this._state = {
            quotes: [],
            rotatingIndex: 0,
            lastUpdate: '',
            lastPanelText: ''
        };

        // Panel label
        let box = new St.BoxLayout({ style_class: 'stock-panel-box' });
        this._tickerText = new St.Label({
            text: 'Stocks ⏳',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'stock-panel-label'
        });
        box.add_child(this._tickerText);
        this.add_child(box);

        // Apply compact mode
        if (this._settings.get_boolean('compact-mode')) {
            this._tickerText.add_style_class_name('stock-panel-compact');
        }

        // Popup menu
        this._stockMenu = new Popup.StockMenu(this._settings);
        this.menu.addMenuItem(this._stockMenu);

        // Watch the shared JSON file
        this._monitor = null;
        this._monitorId = 0;
        this._setupFileMonitor();

        // Initial read
        this._readData();

        // Fallback poll (30s)
        this._fallbackId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
            this._readData();
            return GLib.SOURCE_CONTINUE;
        });

        // Rotation timer
        this._rotationId = 0;
        this._setupRotation();

        // Listen for settings changes
        this._settingsChangedId = this._settings.connect('changed', () => {
            this._onSettingsChanged();
        });
    }

    _setupFileMonitor() {
        try {
            let file = Gio.File.new_for_path(DATA_FILE);
            this._monitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
            this._monitorId = this._monitor.connect('changed', (monitor, file, otherFile, eventType) => {
                if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
                    eventType === Gio.FileMonitorEvent.CHANGED) {
                    this._readData();
                }
            });
        } catch (e) {
            this._logDebug('FileMonitor setup failed: ' + e.message);
        }
    }

    _setupRotation() {
        // Clear existing timer
        if (this._rotationId) {
            GLib.source_remove(this._rotationId);
            this._rotationId = 0;
        }

        if (!this._settings.get_boolean('enable-rotation')) return;

        let interval = Math.max(this._settings.get_int('rotation-interval'), 2);
        this._rotationId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._rotatePanel();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _onSettingsChanged() {
        // Re-apply compact mode
        if (this._settings.get_boolean('compact-mode')) {
            this._tickerText.add_style_class_name('stock-panel-compact');
        } else {
            this._tickerText.remove_style_class_name('stock-panel-compact');
        }

        // Restart rotation with new interval
        this._setupRotation();

        // Re-render
        this._renderPanel();
        if (this._state.quotes.length > 0) {
            this._stockMenu.updateUI(this._state.quotes, null, this._settings);
        }
    }

    _readData() {
        try {
            let file = Gio.File.new_for_path(DATA_FILE);
            if (!file.query_exists(null)) {
                this._tickerText.set_text('DAEMON OFF');
                this._stockMenu.updateUI([], 'Daemon not running', this._settings);
                return;
            }

            let [ok, contents] = file.load_contents(null);
            if (!ok) {
                this._tickerText.set_text('READ ERR');
                return;
            }

            let text = imports.byteArray.toString(contents);
            let payload = JSON.parse(text);

            // Debounce: skip if same timestamp
            if (payload.timestamp === this._state.lastUpdate) return;
            this._state.lastUpdate = payload.timestamp;

            let quotes = payload.quotes || [];
            this._state.quotes = quotes;

            // Detect stale (>5 min old)
            let stale = false;
            try {
                let ts = new Date(payload.timestamp).getTime();
                if (Date.now() - ts > 300000) stale = true;
            } catch (e) { /* ignore */ }

            this._renderPanel(stale);
            this._stockMenu.updateUI(quotes, stale ? 'Data stale (>5 min)' : null, this._settings);
        } catch (e) {
            this._logDebug('Read error: ' + e.message);
            this._tickerText.set_text('ERR');
        }
    }

    _renderPanel(stale) {
        let quotes = this._state.quotes;
        let showCurrency = this._settings.get_boolean('show-currency');
        let showPct = this._settings.get_boolean('show-change-percent');
        let maxItems = Math.max(this._settings.get_int('max-visible-items'), 1);
        let pinnedList = this._settings.get_strv('pinned-symbols');

        let validQuotes = quotes.filter(q => q && !q.error);
        if (validQuotes.length === 0) {
            let failCount = quotes.filter(q => q && q.error).length;
            this._tickerText.set_text(failCount > 0 ? 'ERR / OFFLINE' : '—');
            return;
        }

        // Split into pinned and rotating
        let pinned = validQuotes.filter(q => pinnedList.indexOf(q.symbol) !== -1);
        let rotating = validQuotes.filter(q => pinnedList.indexOf(q.symbol) === -1);
        let availSlots = Math.max(maxItems - pinned.length, 0);

        let panelItems;
        if (rotating.length <= availSlots) {
            panelItems = pinned.concat(rotating);
        } else {
            let window = [];
            for (let i = 0; i < availSlots; i++) {
                window.push(rotating[(this._state.rotatingIndex + i) % rotating.length]);
            }
            panelItems = pinned.concat(window);
        }

        // Format
        let strs = panelItems.map(q => {
            let pct = q.changePercent || 0;
            let arrow = pct > 0 ? '▲' : (pct < 0 ? '▼' : '•');
            let price = _formatPanelPrice(q, showCurrency);
            let s = q.symbol + ' ' + price;
            if (showPct) s += ' ' + arrow;
            return s;
        });

        let text = strs.join(' | ');
        if (stale) text += ' ⏳';

        // Anti-flicker: only update if changed
        if (text !== this._state.lastPanelText) {
            this._state.lastPanelText = text;
            this._tickerText.set_text(text);
        }
    }

    _rotatePanel() {
        let pinnedList = this._settings.get_strv('pinned-symbols');
        let validQuotes = this._state.quotes.filter(q => q && !q.error);
        let rotating = validQuotes.filter(q => pinnedList.indexOf(q.symbol) === -1);

        if (rotating.length > 0) {
            this._state.rotatingIndex = (this._state.rotatingIndex + 1) % rotating.length;
        }
        this._renderPanel();
    }

    _logDebug(msg) {
        if (this._settings.get_boolean('debug')) {
            log('[gnome-stocks] ' + msg);
        }
    }

    destroy() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        if (this._rotationId) {
            GLib.source_remove(this._rotationId);
            this._rotationId = 0;
        }
        if (this._fallbackId) {
            GLib.source_remove(this._fallbackId);
            this._fallbackId = 0;
        }
        if (this._monitor && this._monitorId) {
            this._monitor.disconnect(this._monitorId);
            this._monitorId = 0;
        }
        if (this._monitor) {
            this._monitor.cancel();
            this._monitor = null;
        }
        super.destroy();
    }
});

let _indicator;

function init() {
    // No-op for GNOME 42
}

function enable() {
    _indicator = new StockIndicator();
    let position = 'right';
    try {
        let settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.stocks');
        position = settings.get_string('panel-position') || 'right';
    } catch (e) { /* use default */ }
    Main.panel.addToStatusArea('gnome-stocks-indicator', _indicator, 0, position);
}

function disable() {
    if (_indicator) {
        _indicator.destroy();
        _indicator = null;
    }
}
