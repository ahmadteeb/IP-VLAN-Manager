let selectedVlanIds = new Set();
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
document.addEventListener('DOMContentLoaded', function() {
    loadTechnologiesForVlansPage();
    loadVLANs();
    setupEventListeners();
});

function setupEventListeners() {
    const addVlanBtn = document.getElementById('addVlanBtn');
    if (addVlanBtn) {
        addVlanBtn.addEventListener('click', function() {
            const modal = new bootstrap.Modal(document.getElementById('addVlanModal'));
            modal.show();
            resetAddVlanForm();
            loadVendorsForSelect();
        });
    }
    
    // Toggle OM VLAN fields when pair checkbox is checked
    const createVlanPair = document.getElementById('createVlanPair');
    if (createVlanPair) {
        createVlanPair.addEventListener('change', function() {
            const omVlanFields = document.getElementById('omVlanFields');
            if (omVlanFields) {
                omVlanFields.style.display = this.checked ? 'block' : 'none';
                const omVlanInput = document.getElementById('omVlanId');
                if (omVlanInput) {
                    omVlanInput.required = this.checked;
                }
            }
        });
    }
    
    document.getElementById('confirmAddVlan').addEventListener('click', addVLAN);
    document.getElementById('techFilter').addEventListener('change', function() {
        currentPage = 1;
        loadVLANs();
    });
    document.getElementById('statusFilter').addEventListener('change', function() {
        currentPage = 1;
        loadVLANs();
    });
    
    // Delete selected button
    const deleteBtn = document.getElementById('deleteVlansBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteSelectedVLANs);
    }

    // Export selected
    const exportBtn = document.getElementById('exportVlansBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportSelectedVlans);
    }
    
    // Select all checkbox
    const selectAll = document.getElementById('selectAllVlans');
    if (selectAll) {
        selectAll.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.vlan-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = this.checked;
                if (this.checked) {
                    selectedVlanIds.add(parseInt(cb.value));
                } else {
                    selectedVlanIds.delete(parseInt(cb.value));
                }
            });
            updateDeleteButton();
        });
    }
}

async function loadTechnologiesForVlansPage() {
    try {
        const data = await apiRequest('/api/technologies');
        const techs = data.technologies || [];
        const filter = document.getElementById('techFilter');
        if (filter) {
            filter.innerHTML = '<option value="">All Technologies</option>' +
                techs.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
        }
        const select = document.getElementById('vlanTechnology');
        if (select) {
            select.innerHTML = '<option value="">Select Technology</option>' +
                techs.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
            if (window.initSearchableDropdown) {
                window.initSearchableDropdown(select);
            }
            resetSelectById('vlanTechnology');
        }
    } catch (error) {
        console.error('Error loading technologies:', error);
    }
}

async function loadVLANs() {
    const tech = document.getElementById('techFilter').value;
    const status = document.getElementById('statusFilter').value;
    
    const params = new URLSearchParams({
        page: currentPage,
        per_page: perPage
    });
    if (tech) params.append('technology', tech);
    if (status) params.append('status', status);
    
    try {
        const data = await apiRequest(`/api/vlans?${params}`);
        window._vlansPage = data.vlans || [];
        renderVLANsTable(data.vlans);
        renderPagination(data.total, data.pages, data.current_page);
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

function renderVLANsTable(vlans) {
    const tbody = document.getElementById('vlanTableBody');
    
    const isAdmin = document.getElementById('addVlanBtn') !== null;
    const colspan = isAdmin ? 5 : 4;
    if (vlans.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center text-muted">No VLANs found</td></tr>`;
        return;
    }
    
    // Filter to show only service VLANs (or unpaired VLANs), and group pairs
    const serviceVlans = vlans.filter(vlan => !vlan.pair_type || vlan.pair_type === 'service');
    // Also create a map from pair_id to OM VLANs for fallback (in case pair_vlan_number is not set)
    const omVlansMap = new Map();
    vlans.filter(vlan => vlan.pair_type === 'om').forEach(vlan => {
        if (vlan.pair_id) {
            omVlansMap.set(vlan.pair_id, vlan);
        }
    });
    
    tbody.innerHTML = serviceVlans.map(vlan => {
        const isChecked = selectedVlanIds.has(vlan.id) ? 'checked' : '';
        const checkbox = isAdmin ? `<td><input type="checkbox" class="vlan-checkbox" value="${vlan.id}" ${isChecked} onchange="toggleVlanSelection(${vlan.id}, this.checked)"></td>` : '';
        
        // Use pair_vlan_number from API response (more reliable across pagination)
        // Fallback to matching by pair_id in current page if pair_vlan_number is not available
        let omVlanDisplay = '<span class="text-muted">—</span>';
        if (vlan.pair_vlan_number) {
            omVlanDisplay = `<code>${vlan.pair_vlan_number}</code>`;
        } else if (vlan.pair_id) {
            const omVlan = omVlansMap.get(vlan.pair_id);
            if (omVlan) {
                omVlanDisplay = `<code>${omVlan.vlan_id}</code>`;
            }
        }
        
        return `
        <tr>
            ${checkbox}
            <td><code>${vlan.vlan_id}</code></td>
            <td>${omVlanDisplay}</td>
            <td><span class="badge bg-secondary">${vlan.type}</span></td>
            <td>${vlan.vendor || 'N/A'}</td>
        </tr>
        `;
    }).join('');
    
    updateDeleteButton();
    updateSelectAllCheckbox();
}

function exportSelectedVlans() {
    const selectedIds = Array.from(selectedVlanIds);
    if (selectedIds.length === 0) {
        showToast('Error', 'Please select at least one VLAN to export', 'error');
        return;
    }
    const list = (window._vlansPage || []).filter(v => selectedIds.includes(v.id));
    if (list.length === 0) {
        showToast('Error', 'Selected VLANs are not in the current view. Change page or reload.', 'error');
        return;
    }
    const headers = ['Service VLAN', 'OM VLAN', 'Technology', 'Vendor'];
    const rows = list.map(v => [
        v.vlan_id,
        v.pair_vlan_number || '',
        v.type,
        v.vendor || ''
    ]);
    exportToCsv(`vlans_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'')}`, headers, rows);
}

function toggleVlanSelection(vlanId, isChecked) {
    if (isChecked) {
        selectedVlanIds.add(vlanId);
    } else {
        selectedVlanIds.delete(vlanId);
    }
    updateDeleteButton();
    updateSelectAllCheckbox();
}

function updateDeleteButton() {
    const deleteBtn = document.getElementById('deleteVlansBtn');
    if (deleteBtn) {
        deleteBtn.style.display = selectedVlanIds.size > 0 ? 'inline-block' : 'none';
    }
}

function updateSelectAllCheckbox() {
    const selectAll = document.getElementById('selectAllVlans');
    if (selectAll) {
        const checkboxes = document.querySelectorAll('.vlan-checkbox');
        const allChecked = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
        selectAll.checked = allChecked;
    }
}

async function deleteSelectedVLANs() {
    const selectedIds = Array.from(selectedVlanIds);
    if (selectedIds.length === 0) {
        showToast('Error', 'Please select at least one VLAN to delete', 'error');
        return;
    }
    
    const count = selectedIds.length;
    const message = count === 1
        ? 'Are you sure you want to delete this VLAN? This action cannot be undone.'
        : `Are you sure you want to delete ${count} VLANs? This action cannot be undone.`;

    const confirmed = await showConfirm({
        title: 'Delete VLANs',
        message,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmBtnClass: 'btn-danger'
    });
    if (!confirmed) {
        return;
    }
    
    try {
        for (const vlanId of selectedIds) {
            await apiRequest(`/api/vlans/${vlanId}`, {
                method: 'DELETE'
            });
        }
        
        showToast('Success', `Successfully deleted ${count} VLAN(s)`, 'success');
        selectedVlanIds.clear();
        currentPage = 1;
        loadVLANs();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

function renderPagination(total, pages, current) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    
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
    loadVLANs();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadVendorsForSelect() {
    try {
        const data = await apiRequest('/api/vendors');
        const select = document.getElementById('vlanVendor');
        select.innerHTML = '<option value="">Select Vendor</option>' + 
            data.vendors.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
        if (window.initSearchableDropdown) {
            window.initSearchableDropdown(select);
        }
        resetSelectById('vlanVendor');
    } catch (error) {
        console.error('Error loading vendors:', error);
    }
}

function resetAddVlanForm() {
    document.getElementById('addVlanForm').reset();
    const omVlanFields = document.getElementById('omVlanFields');
    if (omVlanFields) {
        omVlanFields.style.display = 'none';
    }
    resetSelectById('vlanTechnology');
    resetSelectById('vlanVendor');
}

async function addVLAN() {
    const createPair = document.getElementById('createVlanPair').checked;
    const vlanIdInput = document.getElementById('vlanId').value.trim();
    const omVlanIdInput = document.getElementById('omVlanId') ? document.getElementById('omVlanId').value.trim() : '';
    const technology = document.getElementById('vlanTechnology').value;
    const vendorId = document.getElementById('vlanVendor').value;
    
    if (!vlanIdInput || !technology || !vendorId) {
        showToast('Error', 'VLAN ID, Technology, and Vendor are required', 'error');
        return;
    }

    // If creating pair, validate OM VLAN
    let omVlanIds = [];
    if (createPair) {
        if (!omVlanIdInput) {
            showToast('Error', 'OM VLAN ID is required when creating a pair', 'error');
            return;
        }
        
        // Parse OM VLAN range
        if (omVlanIdInput.includes('-')) {
            const parts = omVlanIdInput.split('-', 2);
            if (parts.length !== 2) {
                showToast('Error', 'Invalid OM VLAN range format. Use e.g., "20-25".', 'error');
                return;
            }
            const start = parseInt(parts[0].trim(), 10);
            const end = parseInt(parts[1].trim(), 10);
            if (isNaN(start) || isNaN(end)) {
                showToast('Error', 'OM VLAN range must contain valid numbers.', 'error');
                return;
            }
            if (start < 1 || end > 4095 || start > end) {
                showToast('Error', 'OM VLAN range must be within 1-4095 and start <= end.', 'error');
                return;
            }
            omVlanIds = Array.from({ length: end - start + 1 }, (_, i) => start + i);
        } else {
            const omVid = parseInt(omVlanIdInput, 10);
            if (isNaN(omVid) || omVid < 1 || omVid > 4095) {
                showToast('Error', 'OM VLAN ID must be a number between 1 and 4095', 'error');
                return;
            }
            omVlanIds = [omVid];
        }
        
        // Parse service VLAN range to check count
        let serviceVlanIds = [];
        if (vlanIdInput.includes('-')) {
            const parts = vlanIdInput.split('-', 2);
            if (parts.length !== 2) {
                showToast('Error', 'Invalid service VLAN range format. Use e.g., "100-200".', 'error');
                return;
            }
            const start = parseInt(parts[0].trim(), 10);
            const end = parseInt(parts[1].trim(), 10);
            if (isNaN(start) || isNaN(end)) {
                showToast('Error', 'Service VLAN range must contain valid numbers.', 'error');
                return;
            }
            if (start < 1 || end > 4095 || start > end) {
                showToast('Error', 'Service VLAN range must be within 1-4095 and start <= end.', 'error');
                return;
            }
            serviceVlanIds = Array.from({ length: end - start + 1 }, (_, i) => start + i);
        } else {
            const single = parseInt(vlanIdInput, 10);
            if (isNaN(single) || single < 1 || single > 4095) {
                showToast('Error', 'Service VLAN ID must be a number between 1 and 4095', 'error');
                return;
            }
            serviceVlanIds = [single];
        }
        
        // Check that ranges have the same count
        if (serviceVlanIds.length !== omVlanIds.length) {
            showToast('Error', `Service VLAN range (${serviceVlanIds.length} VLANs) and OM VLAN range (${omVlanIds.length} VLANs) must have the same number of VLANs`, 'error');
            return;
        }
    }

    // Client-side validation for single or range (only if not creating pair, since pair validation already handled it)
    if (!createPair) {
        if (vlanIdInput.includes('-')) {
            const parts = vlanIdInput.split('-', 2);
            if (parts.length !== 2) {
                showToast('Error', 'Invalid range format. Use e.g., "20-25".', 'error');
                return;
            }
            const start = parseInt(parts[0].trim(), 10);
            const end = parseInt(parts[1].trim(), 10);
            if (isNaN(start) || isNaN(end)) {
                showToast('Error', 'Range must contain valid numbers.', 'error');
                return;
            }
            if (start < 1 || end > 4095 || start > end) {
                showToast('Error', 'Range must be within 1-4095 and start <= end.', 'error');
                return;
            }
        } else {
            const single = parseInt(vlanIdInput, 10);
            if (isNaN(single) || single < 1 || single > 4095) {
                showToast('Error', 'VLAN ID must be a number between 1 and 4095', 'error');
                return;
            }
        }
    }

    try {
        const requestData = {
            vlan_id: vlanIdInput.includes('-') ? vlanIdInput : parseInt(vlanIdInput, 10),
            technology: technology,
            vendor_id: parseInt(vendorId),
            create_pair: createPair
        };
        
        if (createPair) {
            // Send OM VLAN as string if range, otherwise as number
            requestData.om_vlan_id = omVlanIdInput.includes('-') ? omVlanIdInput : parseInt(omVlanIdInput, 10);
        }
        
        await apiRequest('/api/vlans', {
            method: 'POST',
            body: JSON.stringify(requestData)
        });

        const message = createPair 
            ? 'VLAN pair created successfully (Service + OM)'
            : (vlanIdInput.includes('-') ? 'VLANs created successfully' : 'VLAN created successfully');
        showToast('Success', message, 'success');
        bootstrap.Modal.getInstance(document.getElementById('addVlanModal')).hide();
        loadVLANs();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

// Individual delete function removed - use bulk delete instead
