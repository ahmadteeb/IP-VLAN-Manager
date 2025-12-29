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
    loadTechnologiesForIpsPage();
    loadIPs();
    setupEventListeners();
});

async function loadTechnologiesForIpsPage() {
    try {
        const data = await apiRequest('/api/technologies');
        const techs = data.technologies || [];
        const select = document.getElementById('ipTechnology');
        if (select) {
            select.innerHTML = '<option value="">Select Technology</option>' +
                techs.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
            if (window.initSearchableDropdown) {
                window.initSearchableDropdown(select);
            }
            resetSelectById('ipTechnology');
        }

        const filter = document.getElementById('techFilter');
        if (filter) {
            filter.innerHTML = '<option value="">All Technologies</option>' +
                techs.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
            if (window.initSearchableDropdown) {
                window.initSearchableDropdown(filter);
            }
        }
    } catch (error) {
        console.error('Error loading technologies:', error);
    }
}

function setupEventListeners() {
    const addIpBtn = document.getElementById('addIpBtn');
    if (addIpBtn) {
        addIpBtn.addEventListener('click', function() {
            const modal = new bootstrap.Modal(document.getElementById('addIpModal'));
            modal.show();
            resetAddIpForm();
            loadVendorsForSelect();
        });
    }
    
    if (document.getElementById('confirmAddIp')) {
        document.getElementById('confirmAddIp').addEventListener('click', addIP);
    }
    
    // Delete selected button
    const deleteBtn = document.getElementById('deleteIpsBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteSelectedIPs);
    }

    // Export selected
    const exportBtn = document.getElementById('exportIpsBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportSelectedIps);
    }
    
    // Select all checkbox
    const selectAll = document.getElementById('selectAllIps');
    if (selectAll) {
        selectAll.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.ip-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = this.checked;
                if (this.checked) {
                    selectedIpIds.add(parseInt(cb.value));
                } else {
                    selectedIpIds.delete(parseInt(cb.value));
                }
            });
            updateDeleteButton();
        });
    }
    
    // Toggle between single IP and subnet fields
    const addMethod = document.getElementById('addMethod');
    if (addMethod) {
        addMethod.addEventListener('change', function() {
            toggleAddMethod(this.value);
        });
    }
    
    // Toggle OM IP fields when pair checkbox is checked
    const createIpPair = document.getElementById('createIpPair');
    if (createIpPair) {
        createIpPair.addEventListener('change', function() {
            const omIpFields = document.getElementById('omIpFields');
            if (omIpFields) {
                omIpFields.style.display = this.checked ? 'block' : 'none';
                const omIpInput = document.getElementById('omIpAddress');
                if (omIpInput) {
                    omIpInput.required = this.checked;
                }
            }
        });
    }
    
    // Toggle OM subnet fields when subnet pair checkbox is checked
    const createSubnetPair = document.getElementById('createSubnetPair');
    if (createSubnetPair) {
        createSubnetPair.addEventListener('change', function() {
            const omSubnetFields = document.getElementById('omSubnetFields');
            if (omSubnetFields) {
                omSubnetFields.style.display = this.checked ? 'block' : 'none';
                const omSubnetInput = document.getElementById('omIpSubnet');
                if (omSubnetInput) {
                    omSubnetInput.required = this.checked;
                }
            }
        });
    }
    
    // Toggle OM subnetting fields when subnetting pair checkbox is checked
    const createSubnettingPair = document.getElementById('createSubnettingPair');
    if (createSubnettingPair) {
        createSubnettingPair.addEventListener('change', function() {
            const omSubnettingFields = document.getElementById('omSubnettingFields');
            if (omSubnettingFields) {
                omSubnettingFields.style.display = this.checked ? 'block' : 'none';
                const omBaseSubnetInput = document.getElementById('omBaseSubnet');
                if (omBaseSubnetInput) {
                    omBaseSubnetInput.required = this.checked;
                }
            }
        });
    }
    
    document.getElementById('searchInput').addEventListener('input', debounce(function() {
        currentPage = 1;
        loadIPs();
    }, 500));
    
    document.getElementById('techFilter').addEventListener('change', function() {
        currentPage = 1;
        loadIPs();
    });
    document.getElementById('vendorFilter').addEventListener('input', debounce(function() {
        currentPage = 1;
        loadIPs();
    }, 500));
    
    document.getElementById('statusFilter').addEventListener('change', function() {
        currentPage = 1;
        loadIPs();
    });
    
    document.getElementById('clearFilters').addEventListener('click', function() {
        document.getElementById('searchInput').value = '';
        document.getElementById('techFilter').value = '';
        document.getElementById('vendorFilter').value = '';
        document.getElementById('statusFilter').value = '';
        currentPage = 1;
        loadIPs();
    });
}

function toggleAddMethod(method) {
    const singleFields = document.getElementById('singleIpFields');
    const subnetFields = document.getElementById('subnetFields');
    const subnettingFields = document.getElementById('subnettingFields');
    const ipAddressField = document.getElementById('ipAddress');
    const ipSubnetField = document.getElementById('ipSubnet');
    const baseSubnetField = document.getElementById('baseSubnet');
    const numSubnetsField = document.getElementById('numSubnets');
    
    // Hide all fields first
    singleFields.style.display = 'none';
    subnetFields.style.display = 'none';
    subnettingFields.style.display = 'none';
    
    // Hide OM fields
    const omIpFields = document.getElementById('omIpFields');
    const omSubnetFields = document.getElementById('omSubnetFields');
    const omSubnettingFields = document.getElementById('omSubnettingFields');
    if (omIpFields) omIpFields.style.display = 'none';
    if (omSubnetFields) omSubnetFields.style.display = 'none';
    if (omSubnettingFields) omSubnettingFields.style.display = 'none';
    
    // Reset pair checkboxes
    const createIpPair = document.getElementById('createIpPair');
    const createSubnetPair = document.getElementById('createSubnetPair');
    const createSubnettingPair = document.getElementById('createSubnettingPair');
    if (createIpPair) createIpPair.checked = false;
    if (createSubnetPair) createSubnetPair.checked = false;
    if (createSubnettingPair) createSubnettingPair.checked = false;
    
    // Remove required from all
    if (ipAddressField) ipAddressField.removeAttribute('required');
    if (ipSubnetField) ipSubnetField.removeAttribute('required');
    if (baseSubnetField) baseSubnetField.removeAttribute('required');
    if (numSubnetsField) numSubnetsField.removeAttribute('required');
    const omIpInput = document.getElementById('omIpAddress');
    const omSubnetInput = document.getElementById('omIpSubnet');
    const omBaseSubnetInput = document.getElementById('omBaseSubnet');
    if (omIpInput) omIpInput.removeAttribute('required');
    if (omSubnetInput) omSubnetInput.removeAttribute('required');
    if (omBaseSubnetInput) omBaseSubnetInput.removeAttribute('required');
    
    if (method === 'subnet') {
        subnetFields.style.display = 'block';
        if (ipSubnetField) ipSubnetField.setAttribute('required', 'required');
    } else if (method === 'subnetting') {
        subnettingFields.style.display = 'block';
        if (baseSubnetField) baseSubnetField.setAttribute('required', 'required');
        if (numSubnetsField) numSubnetsField.setAttribute('required', 'required');
    } else {
        singleFields.style.display = 'block';
        if (ipAddressField) ipAddressField.setAttribute('required', 'required');
    }
}

async function loadIPs() {
    const params = new URLSearchParams({
        page: currentPage,
        per_page: perPage
    });
    
    const search = document.getElementById('searchInput').value;
    const tech = document.getElementById('techFilter').value;
    const vendor = document.getElementById('vendorFilter').value;
    const status = document.getElementById('statusFilter').value;
    
    if (search) params.append('search', search);
    if (tech) params.append('technology', tech);
    if (vendor) params.append('vendor', vendor);
    if (status) params.append('status', status);
    
    try {
        const data = await apiRequest(`/api/ips?${params}`);
        window._ipsPage = data.ips || [];
        renderIPsTable(data.ips);
        renderPagination(data.total, data.pages, data.current_page);
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

let selectedIpIds = new Set();

function renderIPsTable(ips) {
    const tbody = document.getElementById('ipTableBody');
    
    const isAdmin = document.getElementById('addIpBtn') !== null;
    const colspan = isAdmin ? 9 : 8;
    if (ips.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center text-muted">No IPs found</td></tr>`;
        return;
    }
    
    // API now only returns service IPs (or unpaired IPs), so no filtering needed
    // Use pair_gateway from API response (populated by to_dict() method)
    tbody.innerHTML = ips.map(ip => {
        const isChecked = selectedIpIds.has(ip.id) ? 'checked' : '';
        const checkbox = isAdmin ? `<td><input type="checkbox" class="ip-checkbox" value="${ip.id}" ${isChecked} onchange="toggleIpSelection(${ip.id}, this.checked)"></td>` : '';
        
        const omIpDisplay = ip.pair_gateway ? `<code>${ip.pair_gateway}</code>` : '<span class="text-muted">—</span>';
        const serviceMaskDisplay = ip.subnet_mask ? `<code>${ip.subnet_mask}</code>` : '<span class="text-muted">—</span>';
        const omMaskDisplay = ip.pair_subnet_mask ? `<code>${ip.pair_subnet_mask}</code>` : '<span class="text-muted">—</span>';
        
        return `
        <tr>
            ${checkbox}
            <td><code>${ip.gateway}</code></td>
            <td>${serviceMaskDisplay}</td>
            <td>${omIpDisplay}</td>
            <td>${omMaskDisplay}</td>
            <td><span class="badge bg-secondary">${ip.type}</span></td>
            <td>${ip.vendor}</td>
            <td>
                <span class="badge bg-${ip.status === 'assigned' ? 'success' : 'info'}">
                    ${ip.status}
                </span>
            </td>
            <td>${ip.site_name || 'Not Assigned'}</td>
        </tr>
        `;
    }).join('');
    
    updateDeleteButton();
    updateSelectAllCheckbox();
}

function exportSelectedIps() {
    const selectedIds = Array.from(selectedIpIds);
    if (selectedIds.length === 0) {
        showToast('Warning', 'Please select at least one IP to export', 'warning');
        return;
    }
    const list = (window._ipsPage || []).filter(ip => selectedIds.includes(ip.id));
    if (list.length === 0) {
        showToast('Error', 'Selected IPs are not in the current view. Change page or reload.', 'error');
        return;
    }
    const headers = ['Service GW IP', 'Service Subnet Mask', 'OM GW IP', 'OM Subnet Mask', 'Technology', 'Vendor', 'Status', 'Site Name'];
    const rows = list.map(ip => [
        ip.gateway,
        ip.subnet_mask || '',
        ip.pair_gateway || '',
        ip.pair_subnet_mask || '',
        ip.type,
        ip.vendor || '',
        ip.status,
        ip.site_name || ''
    ]);
    exportToCsv(`ips_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'')}`, headers, rows);
}

function toggleIpSelection(ipId, isChecked) {
    if (isChecked) {
        selectedIpIds.add(ipId);
    } else {
        selectedIpIds.delete(ipId);
    }
    updateDeleteButton();
    updateSelectAllCheckbox();
}

function updateDeleteButton() {
    const deleteBtn = document.getElementById('deleteIpsBtn');
    if (deleteBtn) {
        deleteBtn.style.display = selectedIpIds.size > 0 ? 'inline-block' : 'none';
    }
}

function updateSelectAllCheckbox() {
    const selectAll = document.getElementById('selectAllIps');
    if (selectAll) {
        const checkboxes = document.querySelectorAll('.ip-checkbox');
        const allChecked = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
        selectAll.checked = allChecked;
    }
}

async function deleteSelectedIPs() {
    const selectedIds = Array.from(selectedIpIds);
    if (selectedIds.length === 0) {
        showToast('Warning', 'Please select at least one IP to delete', 'warning');
        return;
    }
    
    const count = selectedIds.length;
    const message = count === 1
        ? 'Are you sure you want to delete this IP address?'
        : `Are you sure you want to delete ${count} IP addresses?`;

    const confirmed = await showConfirm({
        title: 'Delete IPs',
        message,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmBtnClass: 'btn-danger'
    });
    if (!confirmed) {
        return;
    }
    
    try {
        // Send in batches to the backend bulk endpoint to avoid one-by-one deletes
        const batchSize = 1000;
        let totalDeleted = 0;
        let totalSkipped = 0;
        let totalMissing = 0;

        for (let i = 0; i < selectedIds.length; i += batchSize) {
            const chunk = selectedIds.slice(i, i + batchSize);
            const res = await apiRequest('/api/ips/bulk-delete', {
                method: 'POST',
                body: JSON.stringify({ ip_ids: chunk })
            });
            totalDeleted += res.deleted_count || 0;
            totalSkipped += res.skipped_assigned_count || 0;
            totalMissing += res.missing_count || 0;
        }

        const parts = [];
        parts.push(`Deleted ${totalDeleted}`);
        if (totalSkipped > 0) parts.push(`Skipped assigned ${totalSkipped}`);
        if (totalMissing > 0) parts.push(`Missing ${totalMissing}`);

        showToast('Success', parts.join(' | '), 'success');
        selectedIpIds.clear();
        currentPage = 1;
        loadIPs();
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
    loadIPs();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetAddIpForm() {
    document.getElementById('addIpForm').reset();
    const addMethodSelect = document.getElementById('addMethod');
    if (addMethodSelect) {
        addMethodSelect.value = 'single';
        addMethodSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    toggleAddMethod('single'); // Reset to single IP mode
    const omIpFields = document.getElementById('omIpFields');
    if (omIpFields) {
        omIpFields.style.display = 'none';
    }
    const omSubnetFields = document.getElementById('omSubnetFields');
    if (omSubnetFields) {
        omSubnetFields.style.display = 'none';
    }
    const omSubnettingFields = document.getElementById('omSubnettingFields');
    if (omSubnettingFields) {
        omSubnettingFields.style.display = 'none';
    }
    resetSelectById('ipTechnology');
    resetSelectById('ipVendor');
}

async function loadVendorsForSelect() {
    try {
        const data = await apiRequest('/api/vendors');
        const select = document.getElementById('ipVendor');
        select.innerHTML = '<option value="">Select Vendor</option>' + 
            data.vendors.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
        if (window.initSearchableDropdown) {
            window.initSearchableDropdown(select);
        }
        resetSelectById('ipVendor');
    } catch (error) {
        console.error('Error loading vendors:', error);
    }
}

async function addIP() {
    const addMethod = document.getElementById('addMethod').value;
    const technology = document.getElementById('ipTechnology').value;
    const vendorId = document.getElementById('ipVendor').value;
    
    if (!technology || !vendorId) {
        showToast('Error', 'Technology and vendor are required', 'error');
        return;
    }
    
    let requestData = {
        add_method: addMethod,
        technology: technology,
        vendor_id: parseInt(vendorId)
    };
    
    if (addMethod === 'subnet') {
        const subnet = document.getElementById('ipSubnet').value;
        const createPair = document.getElementById('createSubnetPair') ? document.getElementById('createSubnetPair').checked : false;
        const omSubnet = document.getElementById('omIpSubnet') ? document.getElementById('omIpSubnet').value : '';
        
        if (!subnet) {
            showToast('Error', 'Subnet (CIDR) is required', 'error');
            return;
        }
        
        if (createPair && !omSubnet) {
            showToast('Error', 'OM subnet (CIDR) is required when creating a pair', 'error');
            return;
        }
        
        requestData.subnet = subnet;
        requestData.create_pair = createPair;
        if (createPair) {
            requestData.om_subnet = omSubnet;
        }
    } else if (addMethod === 'subnetting') {
        const baseSubnet = document.getElementById('baseSubnet').value;
        const numSubnets = parseInt(document.getElementById('numSubnets').value);
        const createPair = document.getElementById('createSubnettingPair') ? document.getElementById('createSubnettingPair').checked : false;
        const omBaseSubnet = document.getElementById('omBaseSubnet') ? document.getElementById('omBaseSubnet').value : '';
        
        if (!baseSubnet || !numSubnets || numSubnets < 2) {
            showToast('Error', 'Base subnet and number of subnets (minimum 2) are required', 'error');
            return;
        }
        
        if (createPair && !omBaseSubnet) {
            showToast('Error', 'OM base subnet is required when creating a pair', 'error');
            return;
        }
        
        requestData.base_subnet = baseSubnet;
        requestData.num_subnets = numSubnets;
        requestData.create_pair = createPair;
        if (createPair) {
            requestData.om_base_subnet = omBaseSubnet;
        }
    } else {
        const ipAddress = document.getElementById('ipAddress').value;
        const subnetMask = document.getElementById('ipSubnetMask').value;
        const createPair = document.getElementById('createIpPair').checked;
        const omIpAddress = document.getElementById('omIpAddress').value;
        
        if (!ipAddress) {
            showToast('Error', 'Gateway is required', 'error');
            return;
        }
        
        if (createPair && !omIpAddress) {
            showToast('Error', 'OM gateway is required when creating a pair', 'error');
            return;
        }
        
        requestData.gateway = ipAddress;
        requestData.subnet_mask = subnetMask;
        requestData.create_pair = createPair;
        if (createPair) {
            requestData.om_gateway = omIpAddress;
        }
    }
    
    try {
        const response = await apiRequest('/api/ips', {
            method: 'POST',
            body: JSON.stringify(requestData)
        });
        
        if (addMethod === 'subnet' && response.count) {
            showToast('Success', `Successfully created ${response.count} IP addresses from subnet`, 'success');
        } else if (addMethod === 'subnetting' && response.count) {
            showToast('Success', `Successfully created ${response.count} IP addresses from ${response.num_subnets} subnets`, 'success');
        } else {
            showToast('Success', 'IP address added successfully', 'success');
        }
        
        bootstrap.Modal.getInstance(document.getElementById('addIpModal')).hide();
        loadIPs();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

// Individual delete function removed - use bulk delete instead
