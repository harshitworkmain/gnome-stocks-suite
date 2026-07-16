'use strict';

const { Adw, Gio, Gtk } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

function init() {
    // No-op
}

function fillPreferencesWindow(window) {
    const settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.stocks');

    // ── Panel Settings Page ──
    let panelPage = new Adw.PreferencesPage({ title: 'Panel', icon_name: 'display-symbolic' });

    let panelGroup = new Adw.PreferencesGroup({ title: 'Panel Settings' });

    // Position
    let posRow = new Adw.ComboRow({ title: 'Panel Position', subtitle: 'Where to place the indicator' });
    let posModel = new Gtk.StringList();
    posModel.append('left');
    posModel.append('center');
    posModel.append('right');
    posRow.set_model(posModel);
    let posMap = { 'left': 0, 'center': 1, 'right': 2 };
    posRow.set_selected(posMap[settings.get_string('panel-position')] || 2);
    posRow.connect('notify::selected', () => {
        let vals = ['left', 'center', 'right'];
        settings.set_string('panel-position', vals[posRow.get_selected()]);
    });
    panelGroup.add(posRow);

    // Max visible items (ActionRow + SpinButton for GNOME 42 compat)
    let maxRow = new Adw.ActionRow({ title: 'Max Visible Items', subtitle: 'Number of tickers shown at once (1–5)' });
    let maxSpin = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({ lower: 1, upper: 5, step_increment: 1, value: settings.get_int('max-visible-items') }),
        valign: Gtk.Align.CENTER
    });
    settings.bind('max-visible-items', maxSpin, 'value', Gio.SettingsBindFlags.DEFAULT);
    maxRow.add_suffix(maxSpin);
    maxRow.set_activatable_widget(maxSpin);
    panelGroup.add(maxRow);

    // Enable rotation
    let rotToggle = new Adw.ActionRow({ title: 'Enable Rotation', subtitle: 'Cycle through stocks in the panel' });
    let rotSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
    settings.bind('enable-rotation', rotSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
    rotToggle.add_suffix(rotSwitch);
    rotToggle.set_activatable_widget(rotSwitch);
    panelGroup.add(rotToggle);

    // Rotation interval (ActionRow + SpinButton)
    let rotIntervalRow = new Adw.ActionRow({ title: 'Rotation Interval', subtitle: 'Seconds between rotations (2–15)' });
    let rotSpin = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({ lower: 2, upper: 15, step_increment: 1, value: settings.get_int('rotation-interval') }),
        valign: Gtk.Align.CENTER
    });
    settings.bind('rotation-interval', rotSpin, 'value', Gio.SettingsBindFlags.DEFAULT);
    rotIntervalRow.add_suffix(rotSpin);
    rotIntervalRow.set_activatable_widget(rotSpin);
    panelGroup.add(rotIntervalRow);

    panelPage.add(panelGroup);

    // ── Display Settings Page ──
    let displayPage = new Adw.PreferencesPage({ title: 'Display', icon_name: 'preferences-desktop-appearance-symbolic' });

    let displayGroup = new Adw.PreferencesGroup({ title: 'Display' });

    // Show currency
    let curRow = new Adw.ActionRow({ title: 'Show Currency Symbols', subtitle: 'Prefix prices with $ or ₹' });
    let curSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
    settings.bind('show-currency', curSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
    curRow.add_suffix(curSwitch);
    curRow.set_activatable_widget(curSwitch);
    displayGroup.add(curRow);

    // Show % change
    let pctRow = new Adw.ActionRow({ title: 'Show % Change', subtitle: 'Display percentage change' });
    let pctSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
    settings.bind('show-change-percent', pctSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
    pctRow.add_suffix(pctSwitch);
    pctRow.set_activatable_widget(pctSwitch);
    displayGroup.add(pctRow);

    // Show time
    let timeRow = new Adw.ActionRow({ title: 'Show Update Time', subtitle: 'Display last update time in popup' });
    let timeSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
    settings.bind('show-time', timeSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
    timeRow.add_suffix(timeSwitch);
    timeRow.set_activatable_widget(timeSwitch);
    displayGroup.add(timeRow);

    displayPage.add(displayGroup);

    // ── Appearance Settings ──
    let appearGroup = new Adw.PreferencesGroup({ title: 'Appearance' });

    // Compact mode
    let compactRow = new Adw.ActionRow({ title: 'Compact Mode', subtitle: 'Smaller font and tighter spacing in panel' });
    let compactSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
    settings.bind('compact-mode', compactSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
    compactRow.add_suffix(compactSwitch);
    compactRow.set_activatable_widget(compactSwitch);
    appearGroup.add(compactRow);

    // Debug
    let debugRow = new Adw.ActionRow({ title: 'Debug Logging', subtitle: 'Print debug messages to journal' });
    let debugSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
    settings.bind('debug', debugSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
    debugRow.add_suffix(debugSwitch);
    debugRow.set_activatable_widget(debugSwitch);
    appearGroup.add(debugRow);

    displayPage.add(appearGroup);

    // Add pages
    window.add(panelPage);
    window.add(displayPage);
}
