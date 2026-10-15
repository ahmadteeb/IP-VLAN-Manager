const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

test('failed import shows row details safely and keeps the file for correction', async () => {
    const file = { name: 'sites.xlsx' };
    const elements = {
        bulkImportFile: { files: [file] },
        confirmBulkImport: { innerHTML: 'Import', disabled: false },
        bulkImportResults: { style: {}, focus() { this.focused = true; } },
        bulkImportMessage: {},
        bulkImportErrors: {}
    };
    let reloads = 0;
    const context = {
        document: { getElementById: id => elements[id] },
        window: { API_URLS: { sitesBulkImport: '/ip-manager/api/sites/bulk-import' } },
        FormData: class { append() {} },
        escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
        showToast() {},
        console,
        loadSites() { reloads++; },
        setTimeout() { throw new Error('Failure details must remain visible'); },
        fetch: async url => {
            assert.equal(url, '/ip-manager/api/sites/bulk-import');
            return {
                ok: false,
                json: async () => ({ error: 'Validation failed', errors: ['Row 2: Vendor <unknown> not found'], error_count: 1 })
            };
        }
    };
    const source = fs.readFileSync('static/js/sites.js', 'utf8');
    const start = source.indexOf('async function bulkImportSites()');
    const end = source.indexOf('// --- Edit Site Logic ---', start);
    vm.createContext(context);
    vm.runInContext(source.slice(start, end === -1 ? undefined : end), context);
    await context.bulkImportSites();
    assert.equal(elements.bulkImportResults.style.display, 'block');
    assert.equal(elements.bulkImportResults.focused, true);
    assert.match(elements.bulkImportMessage.innerHTML, /Validation failed/);
    assert.match(elements.bulkImportErrors.innerHTML, /Row 2: Vendor &lt;unknown&gt; not found/);
    assert.equal(elements.confirmBulkImport.disabled, false);
    assert.equal(elements.confirmBulkImport.innerHTML, 'Import');
    assert.equal(elements.bulkImportFile.files[0], file);
    assert.equal(reloads, 0);

    context.fetch = async () => ({ ok: false, json: async () => ({ error: 'Invalid template format' }) });
    await context.bulkImportSites();
    assert.equal(elements.bulkImportErrors.innerHTML, '');
    assert.match(elements.bulkImportMessage.innerHTML, /Invalid template format/);
});
