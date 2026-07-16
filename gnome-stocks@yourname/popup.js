const { St, Clutter, Gio, GLib, Soup } = imports.gi;
const PopupMenu = imports.ui.popupMenu;

const CONFIG_FILE = GLib.get_home_dir() + '/.config/gnome-stocks/config.json';
const API_URL = 'http://127.0.0.1:5005';

// ─── Helpers ────────────────────────────────────────────────────────────────

function _formatNumber(n) {
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
    return price;
}

// ─── HTTP Helper (Soup 3.0 for GNOME 42+) ──────────────────────────────────

function _httpGetAsync(url, callback) {
    try {
        let session = new Soup.Session();
        let message = Soup.Message.new('GET', url);
        session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (source, result) => {
                try {
                    let bytes = session.send_and_read_finish(result);
                    let text = new TextDecoder().decode(bytes.get_data());
                    let data = JSON.parse(text);
                    callback(null, data);
                } catch (e) {
                    callback(e, null);
                }
            }
        );
    } catch (e) {
        // Fallback: try Soup 2.x API
        try {
            let session = new Soup.SessionAsync();
            let message = Soup.Message.new('GET', url);
            session.queue_message(message, (_session, msg) => {
                try {
                    let text = msg.response_body.data;
                    let data = JSON.parse(text);
                    callback(null, data);
                } catch (e2) {
                    callback(e2, null);
                }
            });
        } catch (e3) {
            callback(e3, null);
        }
    }
}

// ─── Menu ───────────────────────────────────────────────────────────────────

var StockMenu = class StockMenu extends PopupMenu.PopupMenuSection {
    constructor(settings) {
        super();

        this._settings = settings;
        this._searchDebounceId = 0;

        // ── Header ──
        let headerItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        let headerBox = new St.BoxLayout({ style_class: 'stock-popup-header', x_expand: true });
        let headerLabel = new St.Label({
            text: '📈 Stocks Watchlist',
            style_class: 'stock-popup-title',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        headerBox.add_child(headerLabel);
        headerItem.add_child(headerBox);
        this.addMenuItem(headerItem);

        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ── Search bar ──
        let searchItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });

        // Container for search + autocomplete
        this._searchContainer = new St.BoxLayout({ vertical: true, x_expand: true });

        // Search row
        let searchRow = new St.BoxLayout({ x_expand: true });
        this._searchEntry = new St.Entry({
            hint_text: 'Search stocks (e.g. RELIANCE, AAPL)',
            style_class: 'stock-search-entry',
            can_focus: true,
            x_expand: true
        });
        this._searchEntry.clutter_text.connect('activate', () => {
            this._onAddSymbol();
        });
        // Phase 3b: Debounced autocomplete on text change
        this._searchEntry.clutter_text.connect('text-changed', () => {
            this._onSearchTextChanged();
        });

        let addBtn = new St.Button({
            label: ' + ',
            style_class: 'stock-add-btn',
            y_align: Clutter.ActorAlign.CENTER
        });
        addBtn.connect('clicked', () => this._onAddSymbol());

        searchRow.add_child(this._searchEntry);
        searchRow.add_child(addBtn);
        this._searchContainer.add_child(searchRow);

        // Autocomplete dropdown container
        this._autocompleteBox = new St.BoxLayout({
            vertical: true,
            style_class: 'stock-autocomplete-box',
            visible: false,
        });
        this._searchContainer.add_child(this._autocompleteBox);

        searchItem.add_child(this._searchContainer);
        this.addMenuItem(searchItem);

        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ── Quotes list ──
        this._itemsBox = new St.BoxLayout({ vertical: true, style_class: 'stock-items-box' });
        let itemWrapper = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        itemWrapper.add_child(this._itemsBox);
        this.addMenuItem(itemWrapper);

        // ── Status bar ──
        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._statusLabel = new St.Label({
            text: '',
            style_class: 'stock-popup-status'
        });
        let statusItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        statusItem.add_child(this._statusLabel);
        this.addMenuItem(statusItem);
    }

    // ── Phase 3b: Autocomplete Search ──

    _onSearchTextChanged() {
        let text = this._searchEntry.get_text().trim();

        // Clear previous debounce
        if (this._searchDebounceId) {
            GLib.source_remove(this._searchDebounceId);
            this._searchDebounceId = 0;
        }

        // Hide dropdown if too short
        if (text.length < 2) {
            this._autocompleteBox.destroy_all_children();
            this._autocompleteBox.visible = false;
            return;
        }

        // Debounce 300ms
        this._searchDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            this._searchDebounceId = 0;
            this._fetchAutocomplete(text);
            return GLib.SOURCE_REMOVE;
        });
    }

    _fetchAutocomplete(query) {
        let url = `${API_URL}/api/search?q=${encodeURIComponent(query)}`;

        _httpGetAsync(url, (err, data) => {
            if (err || !data || !data.results) {
                this._autocompleteBox.destroy_all_children();
                this._autocompleteBox.visible = false;
                return;
            }

            this._autocompleteBox.destroy_all_children();

            let results = data.results.slice(0, 8);
            if (results.length === 0) {
                this._autocompleteBox.visible = false;
                return;
            }

            results.forEach((item, i) => {
                let row = new St.BoxLayout({
                    style_class: 'stock-ac-row',
                    reactive: true,
                    can_focus: true,
                    track_hover: true,
                    x_expand: true,
                });

                // Hover effect
                row.connect('enter-event', () => row.add_style_class_name('stock-ac-row-hover'));
                row.connect('leave-event', () => row.remove_style_class_name('stock-ac-row-hover'));

                // Symbol label (bold)
                let symLabel = new St.Label({
                    text: item.symbol || '',
                    style_class: 'stock-ac-symbol',
                    x_expand: false,
                });

                // Name label
                let nameLabel = new St.Label({
                    text: item.name || '',
                    style_class: 'stock-ac-name',
                    x_expand: true,
                    x_align: Clutter.ActorAlign.START,
                });

                // Provider badge
                let providerLabel = new St.Label({
                    text: (item.provider || '').toUpperCase(),
                    style_class: 'stock-ac-provider',
                    x_expand: false,
                });

                row.add_child(symLabel);
                row.add_child(nameLabel);
                row.add_child(providerLabel);

                // Click to add symbol
                let btn = new St.Button({
                    child: row,
                    style_class: 'stock-ac-btn',
                    x_expand: true,
                });
                btn.connect('clicked', () => {
                    this._addSymbolDirect(item.symbol);
                    this._autocompleteBox.destroy_all_children();
                    this._autocompleteBox.visible = false;
                    this._searchEntry.set_text('');
                });

                this._autocompleteBox.add_child(btn);
            });

            this._autocompleteBox.visible = true;
        });
    }

    _addSymbolDirect(symbol) {
        if (!symbol) return;
        symbol = symbol.toUpperCase();

        try {
            let file = Gio.File.new_for_path(CONFIG_FILE);
            if (file.query_exists(null)) {
                let [ok, contents] = file.load_contents(null);
                if (ok) {
                    let config = JSON.parse(imports.byteArray.toString(contents));
                    let symbols = config.symbols || [];
                    if (symbols.indexOf(symbol) === -1) {
                        symbols.push(symbol);
                        config.symbols = symbols;

                        let bytes = new GLib.Bytes(JSON.stringify(config, null, 2));
                        file.replace_contents(
                            bytes.get_data(),
                            null, false,
                            Gio.FileCreateFlags.REPLACE_DESTINATION,
                            null
                        );
                    }
                }
            }
        } catch (e) {
            log('[gnome-stocks] Add symbol error: ' + e.message);
        }
    }

    _onAddSymbol() {
        let text = this._searchEntry.get_text().trim().toUpperCase();
        if (!text) return;

        // Hide autocomplete
        this._autocompleteBox.destroy_all_children();
        this._autocompleteBox.visible = false;

        this._addSymbolDirect(text);
        this._searchEntry.set_text('');
    }

    _removeSymbol(symbol) {
        try {
            let file = Gio.File.new_for_path(CONFIG_FILE);
            if (file.query_exists(null)) {
                let [ok, contents] = file.load_contents(null);
                if (ok) {
                    let config = JSON.parse(imports.byteArray.toString(contents));
                    config.symbols = (config.symbols || []).filter(s => s !== symbol);

                    let bytes = new GLib.Bytes(JSON.stringify(config, null, 2));
                    file.replace_contents(
                        bytes.get_data(),
                        null, false,
                        Gio.FileCreateFlags.REPLACE_DESTINATION,
                        null
                    );
                }
            }
        } catch (e) {
            log('[gnome-stocks] Remove symbol error: ' + e.message);
        }
    }

    _togglePin(symbol) {
        let pinned = this._settings.get_strv('pinned-symbols');
        let idx = pinned.indexOf(symbol);
        if (idx === -1) {
            pinned.push(symbol);
        } else {
            pinned.splice(idx, 1);
        }
        this._settings.set_strv('pinned-symbols', pinned);
    }

    updateUI(quotes, errorMsg, settings) {
        this._itemsBox.destroy_all_children();

        if (settings) this._settings = settings;

        let showCurrency = this._settings.get_boolean('show-currency');
        let showPct = this._settings.get_boolean('show-change-percent');
        let showTime = this._settings.get_boolean('show-time');
        let pinnedList = this._settings.get_strv('pinned-symbols');

        if (errorMsg) {
            this._statusLabel.set_text('⚠ ' + errorMsg);
        } else {
            this._statusLabel.set_text('');
        }

        if (!quotes || quotes.length === 0) {
            let empty = new St.Label({
                text: 'No symbols. Use the search bar to add.',
                style_class: 'stock-popup-empty'
            });
            this._itemsBox.add_child(empty);
            return;
        }

        quotes.forEach((q, i) => {
            let row = new St.BoxLayout({ style_class: 'stock-popup-row', reactive: true });

            // Add hover class
            row.connect('enter-event', () => row.add_style_class_name('stock-popup-row-hover'));
            row.connect('leave-event', () => row.remove_style_class_name('stock-popup-row-hover'));

            // Add separator class for all but last
            if (i < quotes.length - 1) {
                row.add_style_class_name('stock-popup-row-border');
            }

            // Pin toggle
            let isPinned = pinnedList.indexOf(q.symbol) !== -1;
            let pinBtn = new St.Button({
                label: isPinned ? '★' : '☆',
                style_class: 'stock-pin-btn' + (isPinned ? ' stock-pinned' : ''),
                y_align: Clutter.ActorAlign.CENTER
            });
            pinBtn.connect('clicked', () => {
                this._togglePin(q.symbol);
            });

            // Symbol
            let symLabel = new St.Label({
                text: q.symbol || '???',
                style_class: 'stock-popup-symbol',
                x_expand: false
            });

            if (q.error) {
                let errLabel = new St.Label({
                    text: 'ERR',
                    style_class: 'stock-popup-change stock-down',
                    x_expand: true,
                    x_align: Clutter.ActorAlign.END
                });
                let errRemoveBtn = new St.Button({
                    label: '✕',
                    style_class: 'stock-remove-btn',
                    y_align: Clutter.ActorAlign.CENTER
                });
                errRemoveBtn.connect('clicked', () => {
                    this._removeSymbol(q.symbol);
                });
                row.add_child(pinBtn);
                row.add_child(symLabel);
                row.add_child(errLabel);
                row.add_child(errRemoveBtn);
                this._itemsBox.add_child(row);
                return;
            }

            let pct = q.changePercent || 0;
            let arrow = pct > 0 ? '▲' : (pct < 0 ? '▼' : '•');
            let colorCls = pct > 0 ? 'stock-up' : (pct < 0 ? 'stock-down' : '');
            let priceStr = _formatPrice(q, showCurrency);
            let pctStr = Math.abs(pct).toFixed(2);

            let priceLabel = new St.Label({
                text: priceStr,
                style_class: 'stock-popup-price',
                x_expand: true,
                x_align: Clutter.ActorAlign.END
            });

            row.add_child(pinBtn);
            row.add_child(symLabel);
            row.add_child(priceLabel);

            if (showPct) {
                let pctLabel = new St.Label({
                    text: arrow + ' ' + pctStr + '%',
                    style_class: 'stock-popup-change ' + colorCls,
                    x_expand: false
                });
                row.add_child(pctLabel);
            }

            if (showTime) {
                let timeLabel = new St.Label({
                    text: q.time || '',
                    style_class: 'stock-popup-time',
                    x_expand: false
                });
                row.add_child(timeLabel);
            }

            let removeBtn = new St.Button({
                label: '✕',
                style_class: 'stock-remove-btn',
                y_align: Clutter.ActorAlign.CENTER
            });
            removeBtn.connect('clicked', () => {
                this._removeSymbol(q.symbol);
            });
            row.add_child(removeBtn);

            this._itemsBox.add_child(row);
        });

        // Status
        if (quotes.length > 0 && !errorMsg) {
            let providers = [];
            let seen = {};
            quotes.forEach(q => {
                if (q.provider && !seen[q.provider]) {
                    seen[q.provider] = true;
                    providers.push(q.provider);
                }
            });
            this._statusLabel.set_text('via ' + providers.join(', '));
        }
    }

    destroy() {
        if (this._searchDebounceId) {
            GLib.source_remove(this._searchDebounceId);
            this._searchDebounceId = 0;
        }
        super.destroy();
    }
};
