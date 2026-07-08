let currentPage = 1;
const perPage = 50;

function resetSelectById(id) {
    const select = document.getElementById(id);
    if (!select) return;
    if (window.resetSelectElement) {
        window.resetSelectElement(select);
    } else {
        if (select.multiple) {
            Array.from(select.options).forEach(option => option.selected = false);
        } else if (select.options.length > 0) {
            select.selectedIndex = 0;
        } else {
            select.selectedIndex = -1;
        }
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', function () {
    loadSites();
    setupEventListeners();
});

let selectedSiteIds = new Set();
let selectedSitesData = new Map();

function setupEventListeners() {
    const addBtn = document.getElementById('addSiteBtn');
    if (addBtn) {
        addBtn.addEventListener('click', function () {
            const modal = new bootstrap.Modal(document.getElementById('addSiteModal'));
            modal.show();
            resetAddSiteForm();
            loadTechnologiesForSitesPage();
            loadVendorsForSelect();
            loadRoutersForSelect();
        });
    }

    const bulkAddBtn = document.getElementById('bulkAddSitesBtn');
    if (bulkAddBtn) {
        bulkAddBtn.addEventListener('click', function () {
            const modal = new bootstrap.Modal(document.getElementById('bulkAddSitesModal'));
            modal.show();
            resetBulkImportForm();
        });
    }

    const downloadTemplateBtn = document.getElementById('downloadTemplateBtn');
    if (downloadTemplateBtn) {
        downloadTemplateBtn.addEventListener('click', downloadTemplate);
    }

    const confirmBulkImportBtn = document.getElementById('confirmBulkImport');
    if (confirmBulkImportBtn) {
        confirmBulkImportBtn.addEventListener('click', bulkImportSites);
    }

    const confirmAddBtn = document.getElementById('confirmAddSite');
    if (confirmAddBtn) {
        confirmAddBtn.addEventListener('click', addSite);
    }

    // Load interfaces when router is selected (only if the add site modal exists)
    const siteRouterSelect = document.getElementById('siteRouter');
    if (siteRouterSelect) {
        siteRouterSelect.addEventListener('change', function () {
            const routerId = this.value;
            const interfaceSelect = document.getElementById('siteInterface');
            if (routerId) {
                loadInterfacesForRouter(routerId);
            } else {
                interfaceSelect.innerHTML = '<option value="">Select Interface (Optional)</option>';
                if (window.initSearchableDropdown) {
                    window.initSearchableDropdown(interfaceSelect);
                }
            }
        });
    }

    // Transfer sites button
    const transferBtn = document.getElementById('transferSitesBtn');
    if (transferBtn) {
        transferBtn.addEventListener('click', function () {
            const selected = getSelectedSiteIds();
            if (selected.length === 0) {
                showToast('Error', 'Please select at least one site to transfer', 'error');
                return;
            }
            openTransferModal(selected);
        });
    }

    // Export selected
    const exportBtn = document.getElementById('exportSitesBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportSelectedSites);
    }

    const generateConfigBtn = document.getElementById('generateConfigBtn');
    if (generateConfigBtn) {
        generateConfigBtn.addEventListener('click', generateConfigForSelectedSites);
    }

    const copyConfigBtn = document.getElementById('copyConfigBtn');
    if (copyConfigBtn) {
        copyConfigBtn.addEventListener('click', copyGeneratedConfigToClipboard);
    }

    // Release sites button
    const releaseBtn = document.getElementById('releaseSitesBtn');
    if (releaseBtn) {
        releaseBtn.addEventListener('click', function () {
            const selected = getSelectedSiteIds();
            if (selected.length === 0) {
                showToast('Error', 'Please select at least one site to release', 'error');
                return;
            }
            releaseSelectedSites(selected);
        });
    }

    // Confirm transfer
    const confirmTransferBtn = document.getElementById('confirmTransferSites');
    if (confirmTransferBtn) {
        confirmTransferBtn.addEventListener('click', transferSites);
    }

    // Load interfaces when transfer router is selected
    const transferRouterSelect = document.getElementById('transferRouter');
    if (transferRouterSelect) {
        transferRouterSelect.addEventListener('change', function () {
            const routerId = this.value;
            if (routerId) {
                loadInterfacesForTransferRouter(routerId);
            } else {
                document.getElementById('transferInterface').innerHTML = '<option value="">Select Interface</option>';
            }
        });
    }

    // Load interfaces when transfer router is selected
    const transferRouter = document.getElementById('transferRouter');
    if (transferRouter) {
        transferRouter.addEventListener('change', function () {
            const routerId = this.value;
            if (routerId) {
                loadInterfacesForTransferRouter(routerId);
            } else {
                document.getElementById('transferInterface').innerHTML = '<option value="">Select Interface</option>';
            }
        });
    }

    // Select all checkbox
    const selectAll = document.getElementById('selectAllSites');
    if (selectAll) {
        selectAll.addEventListener('change', function () {
            const checkboxes = document.querySelectorAll('.site-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = this.checked;
                const siteId = parseInt(cb.value);
                if (this.checked) {
                    selectedSiteIds.add(siteId);
                    const site = window._sitesPage.find(s => s.id === siteId);
                    if (site) selectedSitesData.set(siteId, site);
                } else {
                    selectedSiteIds.delete(siteId);
                    selectedSitesData.delete(siteId);
                }
            });
            updateTransferButton();
        });
    }

    document.getElementById('searchInput').addEventListener('input', debounce(function () {
        currentPage = 1;
        selectedSiteIds.clear();
        loadSites();
    }, 500));

    // Listen for real-time SSE updates
    document.addEventListener('app:data_updated', function (e) {
        const res = e.detail.resource;
        if (res === 'all' || res === 'sites' || res === 'vlans' || res === 'ips' || res === 'interfaces' || res === 'routers') {
            loadSites();
        }
    });
}

async function loadTechnologiesForSitesPage() {
    try {
        const data = await apiRequest(window.API_URLS.technologies);
        const techs = data.technologies || [];

        // Multi-select in Add Site
        const multi = document.getElementById('siteTechnologies');
        if (multi) {
            multi.innerHTML = techs.map(t => `
                <li>
                    <label class="dropdown-item d-flex align-items-center gap-2 py-2 m-0" for="tech_${t.name.replace(/\s+/g, '_')}" style="cursor:pointer; user-select:none;">
                        <input class="form-check-input tech-checkbox m-0" type="checkbox" value="${t.name}" id="tech_${t.name.replace(/\s+/g, '_')}">
                        <span class="fw-medium">${t.name}</span>
                    </label>
                </li>
            `).join('');
            
            const checkboxes = multi.querySelectorAll('.tech-checkbox');
            const btnText = document.querySelector('#siteTechnologiesDropdown .selected-text');
            checkboxes.forEach(cb => {
                cb.addEventListener('change', () => {
                    const selected = Array.from(checkboxes).filter(c => c.checked).map(c => c.value);
                    if (selected.length === 0) {
                        btnText.textContent = 'Select Technologies';
                    } else {
                        btnText.textContent = selected.join(', ');
                    }
                });
            });
            resetTechMultiselect();
        }
    } catch (error) {
        console.error('Error loading technologies:', error);
    }
}

async function loadSites() {
    const params = new URLSearchParams({
        page: currentPage,
        per_page: perPage
    });

    const search = document.getElementById('searchInput').value;

    if (search) params.append('search', search);

    try {
        const data = await apiRequest(`${window.API_URLS.sites}?${params}`);
        window._sitesPage = data.sites || [];
        renderSitesTable(data.sites);
        renderPagination(data.total, data.pages, data.current_page);
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

let currentSitesMap = new Map();

function renderSitesTable(sites) {
    const tbody = document.getElementById('siteTableBody');
    currentSitesMap.clear();
    sites.forEach(s => currentSitesMap.set(s.id, s));

    // Check if checkbox column exists
    const hasCheckbox = document.getElementById('selectAllSites') !== null;

    // Check if Actions column exists
    let hasActions = false;
    document.querySelectorAll('th').forEach(th => {
        if (th.textContent.trim() === 'Actions') hasActions = true;
    });

    const colspan = hasCheckbox ? (hasActions ? 13 : 12) : (hasActions ? 12 : 11);

    if (sites.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center text-muted">No sites found</td></tr>`;
        return;
    }

    tbody.innerHTML = sites.map(site => {
        // Display technologies - use technologies array if available, otherwise fall back to technology_type
        const techs = site.technologies && site.technologies.length > 0
            ? site.technologies
            : (site.technology_type ? [site.technology_type] : []);
        const techBadges = techs.map(t => `<span class="badge bg-secondary me-1">${escapeHtml(t)}</span>`).join('');
        const isChecked = selectedSiteIds.has(site.id) ? 'checked' : '';

        // Use pair fields if available, otherwise fall back to legacy fields
        const serviceIp = site.service_gateway_ip || site.gateway || 'N/A';
        const serviceVlan = site.service_vlan_number || site.vlan_number || 'N/A';
        const omIp = site.om_gateway_ip || '—';
        const omVlan = site.om_vlan_number || '—';

        // Escape HTML to prevent XSS and ensure proper display
        const siteId = escapeHtml(site.site_id);
        const siteName = escapeHtml(site.site_name);
        const vendor = escapeHtml(site.vendor || 'N/A');
        const routerName = escapeHtml(site.router_name || 'Not Assigned');
        const routerIp = escapeHtml(site.router_ip || 'Not Assigned');
        const interfaceName = escapeHtml(site.interface_name || 'Not Assigned');

        // Truncate interface name to 20 characters
        const interfaceDisplay = interfaceName.length > 20
            ? interfaceName.substring(0, 20) + '...'
            : interfaceName;

        // Checkbox column only if checkbox header exists
        const checkbox = hasCheckbox ? `<td><input type="checkbox" class="site-checkbox" value="${site.id}" ${isChecked} onchange="toggleSiteSelection(${site.id}, this.checked)"></td>` : '';

        return `
        <tr>
            ${checkbox}
            <td><code title="${siteId}">${siteId}</code></td>
            <td><strong title="${siteName}">${siteName}</strong></td>
            <td title="${techs.join(', ')}">${techBadges || 'N/A'}</td>
            <td title="${vendor}">${vendor}</td>
            <td><code title="${serviceIp}">${serviceIp}</code></td>
            <td><code title="${serviceVlan}">${serviceVlan}</code></td>
            <td><code title="${omIp}">${omIp}</code></td>
            <td><code title="${omVlan}">${omVlan}</code></td>
            <td title="${routerName}">${routerName}</td>
            <td><code title="${routerIp}">${routerIp}</code></td>
            <td title="${interfaceName}">${interfaceDisplay}</td>
            ${hasActions ? `<td>
                <button class="btn btn-sm btn-outline-primary" onclick="openEditModal(${site.id})" title="Edit Site">
                    <i class="fas fa-edit"></i>
                </button>
            </td>` : ''}
        </tr>
        `;
    }).join('');

    updateTransferButton();
    updateSelectAllCheckbox();
}

// Helper function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function exportSelectedSites() {
    const selectedIds = Array.from(selectedSiteIds);
    if (selectedIds.length === 0) {
        showToast('Warning', 'Please select at least one site to export', 'warning');
        return;
    }
    const list = (window._sitesPage || []).filter(s => selectedIds.includes(s.id));
    if (list.length === 0) {
        showToast('Error', 'Selected sites are not in the current view. Change page or reload.', 'error');
        return;
    }
    const headers = ['Site ID', 'Site Name', 'Technologies', 'Vendor', 'Service GW IP', 'Service VLAN', 'OM GW IP', 'OM VLAN', 'Router', 'Router IP', 'Interface'];
    const rows = list.map(s => [
        s.site_id,
        s.site_name,
        (s.technologies || (s.technology_type ? [s.technology_type] : [])).join(', '),
        s.vendor || '',
        s.service_gateway_ip || s.gateway || '',
        s.service_vlan_number || s.vlan_number || '',
        s.om_gateway_ip || '',
        s.om_vlan_number || '',
        s.router_name || '',
        s.router_ip || '',
        s.interface_name || ''
    ]);
    exportToCsv(`sites_export_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}`, headers, rows);
}

async function generateConfigForSelectedSites() {
    const selectedIds = getSelectedSiteIds();
    if (selectedIds.length === 0) {
        showToast('Warning', 'Please select at least one site to generate configuration', 'warning');
        return;
    }

    try {
        const data = await apiRequest(window.API_URLS.sitesConfig, {
            method: 'POST',
            body: JSON.stringify({ site_ids: selectedIds })
        });

        const configText = data.combined_config || (data.configs || []).map(c => c.config).join('\n\n');
        if (!configText) {
            showToast('Error', 'No configuration could be generated for the selected sites', 'error');
            return;
        }

        const container = document.getElementById('generatedConfigContent');
        if (container) {
            container.textContent = configText;
        }

        const modalElement = document.getElementById('configModal');
        if (modalElement) {
            const modal = new bootstrap.Modal(modalElement);
            modal.show();
        }
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

async function copyGeneratedConfigToClipboard() {
    const container = document.getElementById('generatedConfigContent');
    const text = container ? container.textContent : '';

    if (!text || text.trim().length === 0) {
        showToast('Error', 'No configuration to copy', 'error');
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
        showToast('Success', 'Configuration copied to clipboard', 'success');
    } catch (err) {
        showToast('Error', err, 'error');
    }
}

function toggleSiteSelection(siteId, isChecked) {
    if (isChecked) {
        selectedSiteIds.add(siteId);
        const site = window._sitesPage.find(s => s.id === siteId);
        if (site) selectedSitesData.set(siteId, site);
    } else {
        selectedSiteIds.delete(siteId);
        selectedSitesData.delete(siteId);
    }
    updateTransferButton();
    updateSelectAllCheckbox();
}

function updateTransferButton() {
    const transferBtn = document.getElementById('transferSitesBtn');
    if (transferBtn) {
        transferBtn.style.display = selectedSiteIds.size > 0 ? 'inline-block' : 'none';
    }

    const releaseBtn = document.getElementById('releaseSitesBtn');
    if (releaseBtn) {
        releaseBtn.style.display = selectedSiteIds.size > 0 ? 'inline-block' : 'none';
    }
}

function updateSelectAllCheckbox() {
    const selectAll = document.getElementById('selectAllSites');
    if (selectAll) {
        const checkboxes = document.querySelectorAll('.site-checkbox');
        const allChecked = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
        selectAll.checked = allChecked;
    }
}

function getSelectedSiteIds() {
    return Array.from(selectedSiteIds);
}

function renderPagination(total, pages, current) {
    const pagination = document.getElementById('pagination');

    if (pages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';

    html += `<li class="page-item ${current === 1 ? 'disabled' : ''}">
        <a class="page-link" href="#" onclick="changePage(${current - 1}); return false;">Previous</a>
    </li>`;

    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || (i >= current - 2 && i <= current + 2)) {
            html += `<li class="page-item ${i === current ? 'active' : ''}">
                <a class="page-link" href="#" onclick="changePage(${i}); return false;">${i}</a>
            </li>`;
        } else if (i === current - 3 || i === current + 3) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
    }

    html += `<li class="page-item ${current === pages ? 'disabled' : ''}">
        <a class="page-link" href="#" onclick="changePage(${current + 1}); return false;">Next</a>
    </li>`;

    pagination.innerHTML = html;
}

function changePage(page) {
    currentPage = page;
    loadSites();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadVendorsForSelect() {
    try {
        const data = await apiRequest(window.API_URLS.vendors);
        const select = document.getElementById('siteVendor');
        select.innerHTML = '<option value="">Select Vendor</option>' +
            data.vendors.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
        if (window.initSearchableDropdown) {
            window.initSearchableDropdown(select);
        }
        resetSelectById('siteVendor');
    } catch (error) {
        console.error('Error loading vendors:', error);
    }
}

async function loadRoutersForSelect() {
    try {
        const data = await apiRequest(window.API_URLS.routers);
        const select = document.getElementById('siteRouter');
        select.innerHTML = '<option value="">Select Router</option>' +
            data.routers.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
        if (window.initSearchableDropdown) {
            window.initSearchableDropdown(select);
        }
        resetSelectById('siteRouter');
    } catch (error) {
        console.error('Error loading routers:', error);
    }
}

async function loadInterfacesForRouter(routerId) {
    try {
        const data = await apiRequest(`${window.API_URLS.interfaces}?router_id=${routerId}`);
        const select = document.getElementById('siteInterface');
        select.innerHTML = '<option value="">Select Interface</option>' +
            data.interfaces.map(i => `<option value="${i.id}">${i.name}</option>`).join('');
        if (window.initSearchableDropdown) {
            window.initSearchableDropdown(select);
        }
        resetSelectById('siteInterface');
    } catch (error) {
        console.error('Error loading interfaces:', error);
    }
}

function resetTechMultiselect() {
    const multi = document.getElementById('siteTechnologies');
    if (multi) {
        multi.querySelectorAll('.tech-checkbox').forEach(cb => cb.checked = false);
        const btnText = document.querySelector('#siteTechnologiesDropdown .selected-text');
        if (btnText) btnText.textContent = 'Select Technologies';
    }
}

function resetAddSiteForm() {
    document.getElementById('addSiteForm').reset();
    document.getElementById('siteInterface').innerHTML = '<option value="">Select Interface (Optional)</option>';
    resetSelectById('siteVendor');
    resetSelectById('siteRouter');
    resetSelectById('siteInterface');
    resetTechMultiselect();
}

async function addSite() {
    const siteId = document.getElementById('siteId').value;
    const siteName = document.getElementById('siteName').value;
    const techSelect = document.getElementById('siteTechnologies');
    const selectedTechnologies = Array.from(techSelect.querySelectorAll('.tech-checkbox:checked')).map(cb => cb.value);
    const vendorId = document.getElementById('siteVendor').value;
    const routerId = document.getElementById('siteRouter').value;
    const interfaceId = document.getElementById('siteInterface').value;

    // Required fields: siteId, siteName, technologies, vendorId
    // routerId and interfaceId are optional
    if (!siteId || !siteName || selectedTechnologies.length === 0 || !vendorId) {
        showToast('Error', 'Site ID, Site Name, Technologies, and Vendor are required', 'error');
        return;
    }

    // If router is selected, interface must also be selected (and vice versa)
    if ((routerId && !interfaceId) || (!routerId && interfaceId)) {
        showToast('Error', 'Both Router and Interface must be selected together, or leave both empty', 'error');
        return;
    }

    try {
        const requestBody = {
            site_id: siteId,
            site_name: siteName,
            technologies: selectedTechnologies,
            vendor_id: parseInt(vendorId)
        };

        // Only include router_id and interface_id if both are provided
        if (routerId && interfaceId) {
            requestBody.router_id = parseInt(routerId);
            requestBody.interface_id = parseInt(interfaceId);
        }

        const data = await apiRequest(window.API_URLS.addSite, {
            method: 'POST',
            body: JSON.stringify(requestBody)
        });

        if (data.count > 1) {
            showToast('Success', `Successfully created ${data.count} sites (one for each technology) with automatic IP and VLAN assignment`, 'success');
        } else {
            showToast('Success', 'Site created successfully with automatic IP and VLAN assignment', 'success');
        }
        bootstrap.Modal.getInstance(document.getElementById('addSiteModal')).hide();
        loadSites();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

async function loadRoutersForTransfer() {
    try {
        const data = await apiRequest(window.API_URLS.routers);
        const select = document.getElementById('transferRouter');
        select.innerHTML = '<option value="">Select Router</option>' +
            data.routers.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
        if (window.initSearchableDropdown) {
            window.initSearchableDropdown(select);
        }
    } catch (error) {
        console.error('Error loading routers:', error);
    }
}

async function loadInterfacesForTransferRouter(routerId) {
    try {
        const data = await apiRequest(`${window.API_URLS.interfaces}?router_id=${routerId}`);
        const select = document.getElementById('transferInterface');
        select.innerHTML = '<option value="">Select Interface</option>' +
            data.interfaces.map(i => `<option value="${i.id}">${i.name}</option>`).join('');
        if (window.initSearchableDropdown) {
            window.initSearchableDropdown(select);
        }
    } catch (error) {
        console.error('Error loading interfaces:', error);
    }
}

async function openTransferModal(selectedSiteIds) {
    try {
        // Use globally tracked site objects to preserve selection across pages
        const selectedSites = selectedSiteIds.map(id => selectedSitesData.get(id)).filter(Boolean);

        const sitesList = document.getElementById('selectedSitesList');
        sitesList.innerHTML = selectedSites.map(s => {
            const techs = s.technologies && s.technologies.length > 0 
                ? s.technologies.join(', ') 
                : (s.technology_type || 'N/A');
            return `<div class="mb-1"><strong>${s.site_id}</strong> - ${s.site_name} <span class="badge bg-secondary ms-2">${techs} - ${s.vendor || 'N/A'}</span></div>`;
        }).join('');

        // Load routers and reset interface
        await loadRoutersForTransfer();
        document.getElementById('transferInterface').innerHTML = '<option value="">Select Interface</option>';

        // Pre-select the assigned router if all selected sites have the same router
        if (selectedSites.length > 0) {
            const routerIds = selectedSites
                .map(s => s.router_id)
                .filter(id => id != null && id !== undefined);

            if (routerIds.length > 0) {
                // If all sites have the same router, pre-select it
                const uniqueRouterIds = [...new Set(routerIds)];
                if (uniqueRouterIds.length === 1) {
                    const routerSelect = document.getElementById('transferRouter');
                    routerSelect.value = uniqueRouterIds[0];
                    // Trigger change to load interfaces for this router
                    routerSelect.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }

        const modal = new bootstrap.Modal(document.getElementById('transferSitesModal'));
        modal.show();
    } catch (error) {
        showToast('Error', 'Failed to load site information', 'error');
    }
}

async function transferSites() {
    const selectedIds = getSelectedSiteIds();
    const routerId = document.getElementById('transferRouter').value;
    const interfaceId = document.getElementById('transferInterface').value;

    if (selectedIds.length === 0) {
        showToast('Error', 'Please select at least one site to transfer', 'error');
        return;
    }

    if (!routerId || !interfaceId) {
        showToast('Error', 'Router and Interface are required', 'error');
        return;
    }

    try {
        // First check for VLAN conflicts
        const checkData = await apiRequest(window.API_URLS.transferCheck, {
            method: 'POST',
            body: JSON.stringify({
                site_ids: selectedIds,
                interface_id: parseInt(interfaceId)
            })
        });

        let reassignVlans = false;

        // If there are conflicts, ask user for confirmation
        if (checkData.has_conflicts && checkData.conflicts.length > 0) {
            const conflictsList = checkData.conflicts.map(c =>
                `• ${c.site_id} (${c.site_name}): VLAN ${c.current_vlan} (${c.technology}, ${c.vendor})`
            ).join('\n');

            const confirmed = await showConfirm({
                title: 'VLAN Conflicts Detected',
                message: `The following sites have VLAN conflicts on the target interface:\n\n${conflictsList}\n\nDo you want to assign new VLANs for these sites?`,
                confirmText: 'Reassign VLANs',
                cancelText: 'Cancel',
                confirmBtnClass: 'btn-warning'
            });
            if (!confirmed) {
                return;
            }
            reassignVlans = true;
        }

        // Proceed with transfer
        const data = await apiRequest(window.API_URLS.transferSites, {
            method: 'POST',
            body: JSON.stringify({
                site_ids: selectedIds,
                router_id: parseInt(routerId),
                interface_id: parseInt(interfaceId),
                reassign_vlans: reassignVlans
            })
        });

        showToast('Success', `Successfully transferred ${data.count} site(s)`, 'success');
        bootstrap.Modal.getInstance(document.getElementById('transferSitesModal')).hide();
        selectedSiteIds.clear();
        loadSites();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

// Individual release function removed - use bulk release instead

async function releaseSelectedSites(siteIds) {
    const count = siteIds.length;
    const message = count === 1
        ? 'Are you sure you want to release this site? This will free up the assigned IP.'
        : `Are you sure you want to release ${count} sites? This will free up the assigned IPs.`;

    const confirmed = await showConfirm({
        title: 'Release Sites',
        message,
        confirmText: 'Release',
        cancelText: 'Cancel',
        confirmBtnClass: 'btn-danger'
    });
    if (!confirmed) {
        return;
    }

    try {
        const data = await apiRequest(window.API_URLS.bulkReleaseSites, {
            method: 'POST',
            body: JSON.stringify({
                site_ids: siteIds
            })
        });

        showToast('Success', `Successfully released ${data.count} site(s)`, 'success');
        selectedSiteIds.clear();
        loadSites();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

function resetBulkImportForm() {
    document.getElementById('bulkImportForm').reset();
    document.getElementById('bulkImportResults').style.display = 'none';
    document.getElementById('bulkImportMessage').innerHTML = '';
    document.getElementById('bulkImportErrors').innerHTML = '';
}

async function downloadTemplate() {
    const downloadBtn = document.getElementById('downloadTemplateBtn');
    const originalText = downloadBtn ? downloadBtn.innerHTML : '';

    // Show loading indicator
    if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width: 0.8rem; height: 0.8rem; border-width: 0.15em;"></span><small>Downloading...</small>';
    }

    try {
        const response = await fetch(window.API_URLS.sitesTemplateDownload, {
            method: 'GET',
            credentials: 'same-origin'
        });

        if (!response.ok) {
            let errorMessage = 'Failed to download template';
            try {
                const error = await response.json();
                errorMessage = error.error || errorMessage;
            } catch (e) {
                // If response is not JSON, use status text
                errorMessage = response.statusText || errorMessage;
            }
            throw new Error(errorMessage);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sites_import_template.xlsx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showToast('Success', 'Template downloaded successfully', 'success');
    } catch (error) {
        showToast('Error', error.message, 'error');
        console.error('Error downloading template:', error);
    } finally {
        // Restore button state
        if (downloadBtn) {
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = originalText;
        }
    }
}

async function bulkImportSites() {
    const fileInput = document.getElementById('bulkImportFile');
    const file = fileInput.files[0];

    if (!file) {
        showToast('Error', 'Please select a file to upload', 'error');
        return;
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        showToast('Error', 'Please upload an Excel file (.xlsx or .xls)', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    const confirmBtn = document.getElementById('confirmBulkImport');
    const originalText = confirmBtn.innerHTML;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width: 0.75rem; height: 0.75rem; border-width: 0.1em;"></span>Importing...';

    try {
        const response = await fetch(window.API_URLS.sitesBulkImport, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Import failed');
        }

        // Show results
        const resultsDiv = document.getElementById('bulkImportResults');
        const messageDiv = document.getElementById('bulkImportMessage');
        const errorsDiv = document.getElementById('bulkImportErrors');

        resultsDiv.style.display = 'block';

        let messageHtml = `<div class="alert alert-success">
            <strong>Import Completed!</strong><br>
            ${data.created_count} site(s) created successfully
        </div>`;

        if (data.error_count > 0) {
            messageHtml += `<div class="alert alert-warning">
                <strong>Warning:</strong> ${data.error_count} error(s) occurred
            </div>`;
        }

        messageDiv.innerHTML = messageHtml;

        // Show errors if any
        if (data.errors && data.errors.length > 0) {
            let errorsHtml = '<h6>Errors:</h6><ul class="list-group">';
            data.errors.forEach(error => {
                errorsHtml += `<li class="list-group-item list-group-item-danger">${escapeHtml(error)}</li>`;
            });
            errorsHtml += '</ul>';
            errorsDiv.innerHTML = errorsHtml;
        } else {
            errorsDiv.innerHTML = '';
        }

        showToast('Success', `Successfully imported ${data.created_count} site(s)`, 'success');

        // Reload sites table
        loadSites();

        // Reset form after a delay
        setTimeout(() => {
            resetBulkImportForm();
            fileInput.value = '';
        }, 3000);

    } catch (error) {
        showToast('Error', error.message, 'error');
        console.error('Error importing sites:', error);
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = originalText;
    }
}

// --- Edit Site Logic ---
let editSiteModalInstance = null;

window.openEditModal = function (siteId) {
    if (!editSiteModalInstance) {
        editSiteModalInstance = new bootstrap.Modal(document.getElementById('editSiteModal'));
    }

    const site = currentSitesMap.get(siteId);
    if (!site) return;

    document.getElementById('editSiteIdHidden').value = site.id;
    document.getElementById('editSiteTechHidden').value = site.technology_type;
    document.getElementById('editSiteVendorIdHidden').value = site.vendor_id;
    document.getElementById('editSiteInterfaceIdHidden').value = site.interface_id;

    document.getElementById('editSiteId').value = site.site_id;
    document.getElementById('editSiteName').value = site.site_name;
    document.getElementById('editSiteTechVendor').value = `${site.technology_type || 'N/A'} - ${site.vendor || 'N/A'}`;
    document.getElementById('editSiteRouterInterface').value = `${site.router_name || 'N/A'} - ${site.interface_name || 'N/A'}`;

    const sip = site.service_gateway_ip || 'N/A';
    const oip = site.om_gateway_ip || 'N/A';
    document.getElementById('editSiteIp').value = `Service: ${sip} | OM: ${oip}`;

    const svlan = site.service_vlan_number || 'N/A';
    const ovlan = site.om_vlan_number || 'N/A';
    document.getElementById('currentVlansLabel').textContent = `SVLAN: ${svlan}, OMVLAN: ${ovlan}`;

    // Reset radio buttons
    document.getElementById('editVlanKeep').checked = true;
    document.getElementById('editManualVlanDiv').style.display = 'none';

    // Add event listener to clear focus when modal hides (fixes aria-hidden warning)
    document.getElementById('editSiteModal').addEventListener('hidden.bs.modal', function () {
        if (document.activeElement) {
            document.activeElement.blur();
        }
    }, { once: true });

    editSiteModalInstance.show();
};

document.querySelectorAll('input[name="editVlanMode"]').forEach(radio => {
    radio.addEventListener('change', async function () {
        const manualDiv = document.getElementById('editManualVlanDiv');
        if (this.value === 'manual') {
            manualDiv.style.display = 'block';
            await populateEditManualVlans();
        } else {
            manualDiv.style.display = 'none';
        }
    });
});

async function populateEditManualVlans() {
    const tech = document.getElementById('editSiteTechHidden').value;
    const vendorId = document.getElementById('editSiteVendorIdHidden').value;
    const interfaceId = document.getElementById('editSiteInterfaceIdHidden').value;
    const siteId = document.getElementById('editSiteIdHidden').value;

    const select = document.getElementById('editManualVlanSelect');
    select.innerHTML = '<option value="">Loading...</option>';

    if (!tech || !vendorId || !interfaceId) {
        select.innerHTML = '<option value="">Cannot load VLANs (Router and Interface are not assigned)</option>';
        return;
    }

    try {
        const response = await apiRequest(`${window.API_URLS.availableVlans}?technology=${encodeURIComponent(tech)}&vendor_id=${vendorId}&interface_id=${interfaceId}&exclude_site_id=${siteId}`, {
            showLoading: true,
            loadingMessage: 'Fetching available VLANs...'
        });

        select.innerHTML = '<option value="" disabled selected>-- Select VLAN Pair --</option>';
        if (response.vlans && response.vlans.length > 0) {
            response.vlans.forEach(v => {
                select.innerHTML += `<option value="${v.service_vlan_id}">${v.label}</option>`;
            });
        } else {
            select.innerHTML = '<option value="" disabled selected>No free VLANs available for this interface</option>';
        }

        // Update searchable dropdown UI
        if (select.dataset.searchable === 'true') {
            select.dispatchEvent(new Event('rebuildSearchable'));
            // Trigger change to update the displayed text
            select.dispatchEvent(new Event('change'));
        } else if (window.initSearchableDropdown) {
            window.initSearchableDropdown(select);
        }
    } catch (error) {
        select.innerHTML = '<option value="" disabled selected>Failed to load VLANs</option>';
        if (select.dataset.searchable === 'true') {
            select.dispatchEvent(new Event('rebuildSearchable'));
            select.dispatchEvent(new Event('change'));
        }
    }
}

document.getElementById('saveEditSiteBtn')?.addEventListener('click', async () => {
    const id = document.getElementById('editSiteIdHidden').value;
    const site_id = document.getElementById('editSiteId').value.trim();
    const site_name = document.getElementById('editSiteName').value.trim();
    const vlan_mode = document.querySelector('input[name="editVlanMode"]:checked').value;
    const manual_service_vlan_id = document.getElementById('editManualVlanSelect').value;

    if (!site_id || !site_name) {
        showToast('Validation Error', 'Site ID and Site Name are required.', 'warning');
        return;
    }

    if (vlan_mode === 'manual' && !manual_service_vlan_id) {
        showToast('Validation Error', 'Please select a VLAN pair.', 'warning');
        return;
    }

    try {
        await apiRequest(window.API_URLS.updateSite(id), {
            method: 'PUT',
            body: JSON.stringify({
                site_id,
                site_name,
                vlan_mode,
                manual_service_vlan_id: manual_service_vlan_id ? parseInt(manual_service_vlan_id) : null
            }),
            showLoading: true,
            loadingMessage: 'Saving changes...'
        });

        showToast('Success', 'Site updated successfully.', 'success');
        editSiteModalInstance.hide();
        loadSites();
    } catch (error) {
        showToast('Error', error.message || 'Failed to update site.', 'error');
    }
});

