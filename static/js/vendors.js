let selectedVendorIds = new Set();
let currentPage = 1;
const perPage = 50;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    loadVendors();
    setupEventListeners();
});

function setupEventListeners() {
    const addVendorBtn = document.getElementById('addVendorBtn');
    if (addVendorBtn) {
        addVendorBtn.addEventListener('click', function() {
            const modal = new bootstrap.Modal(document.getElementById('addVendorModal'));
            modal.show();
            resetAddVendorForm();
        });
    }
    
    if (document.getElementById('confirmAddVendor')) {
        document.getElementById('confirmAddVendor').addEventListener('click', addVendor);
    }
    
    
    // Delete selected button
    const deleteBtn = document.getElementById('deleteVendorsBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteSelectedVendors);
    }

    // Export selected
    const exportBtn = document.getElementById('exportVendorsBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportSelectedVendors);
    }
    
    // Select all checkbox
    const selectAll = document.getElementById('selectAllVendors');
    if (selectAll) {
        selectAll.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.vendor-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = this.checked;
                if (this.checked) {
                    selectedVendorIds.add(parseInt(cb.value));
                } else {
                    selectedVendorIds.delete(parseInt(cb.value));
                }
            });
            updateActionButtons();
        });
    }
}

async function loadVendors() {
    const params = new URLSearchParams({
        page: currentPage,
        per_page: perPage
    });
    
    try {
        const data = await apiRequest(`${window.API_URLS.vendors}?${params}`);
        window._vendorsPage = data.vendors || [];
        renderVendorsTable(data.vendors);
        renderPagination(data.total, data.pages, data.current_page);
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

function renderVendorsTable(vendors) {
    const tbody = document.getElementById('vendorTableBody');
    
    // Check if user has delete or export permission (not add permission)
    const hasDeleteOrExport = document.getElementById('deleteVendorsBtn') !== null || document.getElementById('exportVendorsBtn') !== null;
    const hasCheckbox = document.getElementById('selectAllVendors') !== null;
    const colspan = hasCheckbox ? 4 : 3;
    
    if (vendors.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center text-muted">No vendors found</td></tr>`;
        return;
    }
    
    tbody.innerHTML = vendors.map(vendor => {
        const isChecked = selectedVendorIds.has(vendor.id) ? 'checked' : '';
        const checkbox = hasCheckbox ? `<td><input type="checkbox" class="vendor-checkbox" value="${vendor.id}" ${isChecked} onchange="toggleVendorSelection(${vendor.id}, this.checked)"></td>` : '';
        return `
        <tr>
            ${checkbox}
            <td>${vendor.id}</td>
            <td><strong>${vendor.name}</strong></td>
            <td>${vendor.created_at ? new Date(vendor.created_at).toLocaleString() : 'N/A'}</td>
        </tr>
        `;
    }).join('');
    
    updateActionButtons();
    updateSelectAllCheckbox();
}

function exportSelectedVendors() {
    const selectedIds = Array.from(selectedVendorIds);
    if (selectedIds.length === 0) {
        showToast('Error', 'Please select at least one vendor to export', 'error');
        return;
    }
    const list = (window._vendorsPage || []).filter(v => selectedIds.includes(v.id));
    if (list.length === 0) {
        showToast('Error', 'Selected vendors are not in the current view. Change page or reload.', 'error');
        return;
    }
    const headers = ['ID', 'Vendor Name', 'Created At'];
    const rows = list.map(v => [
        v.id,
        v.name,
        v.created_at || ''
    ]);
    exportToCsv(`vendors_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'')}`, headers, rows);
}

function toggleVendorSelection(vendorId, isChecked) {
    if (isChecked) {
        selectedVendorIds.add(vendorId);
    } else {
        selectedVendorIds.delete(vendorId);
    }
    updateActionButtons();
    updateSelectAllCheckbox();
}

function updateActionButtons() {
    const deleteBtn = document.getElementById('deleteVendorsBtn');
    const hasSelection = selectedVendorIds.size > 0;
    
    if (deleteBtn) {
        deleteBtn.style.display = hasSelection ? 'inline-block' : 'none';
    }
}

function updateSelectAllCheckbox() {
    const selectAll = document.getElementById('selectAllVendors');
    if (selectAll) {
        const checkboxes = document.querySelectorAll('.vendor-checkbox');
        const allChecked = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
        selectAll.checked = allChecked;
    }
}

async function deleteSelectedVendors() {
    const selectedIds = Array.from(selectedVendorIds);
    if (selectedIds.length === 0) {
        showToast('Error', 'Please select at least one vendor to delete', 'error');
        return;
    }
    
    const count = selectedIds.length;
    const message = count === 1
        ? 'Are you sure you want to delete this vendor? This action cannot be undone.'
        : `Are you sure you want to delete ${count} vendors? This action cannot be undone.`;

    const confirmed = await showConfirm({
        title: 'Delete Vendors',
        message,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmBtnClass: 'btn-danger'
    });
    if (!confirmed) {
        return;
    }
    
    try {
        for (const vendorId of selectedIds) {
            await apiRequest(window.API_URLS.deleteVendor(vendorId), {
                method: 'DELETE'
            });
        }
        
        showToast('Success', `Successfully deleted ${count} vendor(s)`, 'success');
        selectedVendorIds.clear();
        currentPage = 1;
        loadVendors();
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
    loadVendors();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetAddVendorForm() {
    document.getElementById('addVendorForm').reset();
}

async function addVendor() {
    const name = document.getElementById('vendorName').value;
    
    if (!name) {
        showToast('Error', 'Vendor name is required', 'error');
        return;
    }
    
    try {
        await apiRequest(window.API_URLS.addVendor, {
            method: 'POST',
            body: JSON.stringify({
                name: name
            })
        });
        
        showToast('Success', 'Vendor created successfully', 'success');
        bootstrap.Modal.getInstance(document.getElementById('addVendorModal')).hide();
        loadVendors();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

// Individual delete function removed - use bulk delete instead

// Individual delete function removed - use bulk delete instead

