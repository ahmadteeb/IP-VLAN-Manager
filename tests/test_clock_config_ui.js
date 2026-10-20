const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync('static/js/sites.js', 'utf8');

test('clock prompt supports multiple selections, skipping, and cancelling', async () => {
    let onHidden;
    let checked = [];
    const elements = {
        clockConfigModal: { addEventListener(event, callback) { onHidden = callback; } },
        clockInterfaceChoices: { querySelectorAll: () => checked.map(value => ({ value })) },
        includeClockConfig: {}, skipClockConfig: {}
    };
    const context = {
        document: { getElementById: id => elements[id] },
        escapeHtml: text => text,
        bootstrap: { Modal: { getOrCreateInstance: () => ({ show() {}, hide() { onHidden(); } }) } }
    };
    vm.createContext(context);
    vm.runInContext(source.slice(source.indexOf('function chooseClockInterfaces('), source.indexOf('async function generateConfigForSelectedSites(')), context);
    const interfaces = [1, 2, 3].map(id => ({ id, name: `p${id}`, router_name: 'Core' }));
    const pending = context.chooseClockInterfaces(interfaces);
    assert.equal(elements.includeClockConfig.disabled, true);
    checked = ['1', '3'];
    elements.clockInterfaceChoices.onchange();
    assert.equal(elements.includeClockConfig.disabled, false);
    elements.includeClockConfig.onclick();
    assert.deepEqual((await pending).map(iface => iface.id), [1, 3]);
    const skipped = context.chooseClockInterfaces(interfaces);
    elements.skipClockConfig.onclick();
    assert.equal((await skipped).length, 0);
    const cancelled = context.chooseClockInterfaces(interfaces);
    onHidden();
    assert.equal(await cancelled, null);
});

test('generation includes only chosen clock blocks and keeps regular configuration', async () => {
    let shown = 0;
    const iface = { id: 7, clock_config: 'interface p1\n clock synchronization enable\n ptp enable\n#' };
    const elements = { generateConfigBtn: {}, generatedConfigContent: {}, configModal: {} };
    const context = {
        document: { getElementById: id => elements[id] },
        getSelectedSiteIds: () => [11, 12],
        window: { API_URLS: { sitesConfig: '/ip-manager/api/sites/config' } },
        apiRequest: async (url, options) => {
            assert.deepEqual(JSON.parse(options.body).site_ids, [11, 12]);
            return { combined_config: 'SITE CONFIG', interfaces: [iface] };
        },
        chooseClockInterfaces: async () => [iface],
        showToast() { assert.fail('Unexpected error'); },
        bootstrap: { Modal: class { show() { shown++; } } }
    };
    vm.createContext(context);
    vm.runInContext(source.slice(source.indexOf('async function generateConfigForSelectedSites('), source.indexOf('async function copyGeneratedConfigToClipboard(')), context);
    await context.generateConfigForSelectedSites();
    assert.equal(elements.generatedConfigContent.textContent, iface.clock_config + '\n\nSITE CONFIG');
    assert.equal(elements.generateConfigBtn.disabled, false);
    context.chooseClockInterfaces = async () => [];
    await context.generateConfigForSelectedSites();
    assert.equal(elements.generatedConfigContent.textContent, 'SITE CONFIG');
    context.chooseClockInterfaces = async () => null;
    await context.generateConfigForSelectedSites();
    assert.equal(shown, 2);
});

test('transfer opens generation with transferred IDs after its modal closes', async () => {
    let onHidden;
    let generated;
    const selected = new Set([11, 12]);
    const elements = {
        transferRouter: { value: '2' }, transferInterface: { value: '7' }, generateConfigBtn: {},
        transferSitesModal: { addEventListener(event, callback) { onHidden = callback; } }
    };
    const context = {
        document: { getElementById: id => elements[id] },
        window: { API_URLS: { transferCheck: '/check', transferSites: '/transfer' } },
        getSelectedSiteIds: () => Array.from(selected), selectedSiteIds: selected,
        apiRequest: async url => url === '/check' ? { has_conflicts: false } : { count: 2 },
        showToast() {}, updateTransferButton() {}, loadSites() {},
        generateConfigForSelectedSites(ids) { generated = ids; },
        bootstrap: { Modal: { getInstance: () => ({ hide() { onHidden(); } }) } }
    };
    vm.createContext(context);
    vm.runInContext(source.slice(source.indexOf('async function transferSites()'), source.indexOf('// Individual release function')), context);
    await context.transferSites();
    assert.deepEqual(generated, [11, 12]);
    assert.equal(selected.size, 0);
});
