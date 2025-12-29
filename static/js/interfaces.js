let selectedInterfaceIds = new Set();
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
    loadRouters();
    loadInterfaces();
    setupEventListeners();
});

function setupEventListeners() {
    const addInterfaceBtn = document.getElementById('addInterfaceBtn');
    if (addInterfaceBtn) {
        addInterfaceBtn.addEventListener('click', function() {
            const modal = new bootstrap.Modal(document.getElementById('addInterfaceModal'));
            modal.show();
            resetAddInterfaceForm();
            loadRoutersForSelect();
        });
    }
    
    document.getElementById('confirmAddInterface').addEventListener('click', addInterface);
    document.getElementById('routerFilter').addEventListener('change', function() {
        currentPage = 1;
        loadInterfaces();
    });
    
    // Delete selected button
    const deleteBtn = document.getElementById('deleteInterfacesBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteSelectedInterfaces);
    }

    // Export selected button
    const exportBtn = document.getElementById('exportInterfacesBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportSelectedInterfaces);
    }
    
    // Select all checkbox
    const selectAll = document.getElementById('selectAllInterfaces');
    if (selectAll) {
        selectAll.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.interface-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = this.checked;
                if (this.checked) {
                    selectedInterfaceIds.add(parseInt(cb.value));
                } else {
                    selectedInterfaceIds.delete(parseInt(cb.value));
                }
            });
            updateDeleteButton();
        });
    }
}

async function loadRouters() {
    try {
        const data = await apiRequest('/api/routers');
        const filterSelect = document.getElementById('routerFilter');
        filterSelect.innerHTML = '<option value="">All Routers</option>' + 
            data.routers.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

async function loadRoutersForSelect() {
    try {
        const data = await apiRequest('/api/routers');
        const select = document.getElementById('interfaceRouter');
        select.innerHTML = '<option value="">Select Router</option>' + 
            data.routers.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
        if (window.initSearchableDropdown) {
            window.initSearchableDropdown(select);
        }
        resetSelectById('interfaceRouter');
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

async function loadInterfaces() {
    const routerId = document.getElementById('routerFilter').value;
    const params = new URLSearchParams({
        page: currentPage,
        per_page: perPage
    });
    if (routerId) params.append('router_id', routerId);
    
    try {
        const data = await apiRequest(`/api/interfaces?${params}`);
        window._interfacesPage = data.interfaces || [];
        renderInterfacesTable(data.interfaces);
        renderPagination(data.total, data.pages, data.current_page);
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

function renderInterfacesTable(interfaces) {
    const tbody = document.getElementById('interfaceTableBody');
    
    const isAdmin = document.getElementById('addInterfaceBtn') !== null;
    const colspan = isAdmin ? 3 : 2;
    if (interfaces.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center text-muted">No interfaces found</td></tr>`;
        return;
    }
    tbody.innerHTML = interfaces.map(iface => {
        const isChecked = selectedInterfaceIds.has(iface.id) ? 'checked' : '';
        const checkbox = isAdmin ? `<td><input type="checkbox" class="interface-checkbox" value="${iface.id}" ${isChecked} onchange="toggleInterfaceSelection(${iface.id}, this.checked)"></td>` : '';
        return `
        <tr>
            ${checkbox}
            <td><strong>${iface.router_name || 'N/A'}</strong></td>
            <td>${iface.name}</td>
        </tr>
        `;
    }).join('');
    
    updateDeleteButton();
    updateSelectAllCheckbox();
}

function exportSelectedInterfaces() {
    const selectedIds = Array.from(selectedInterfaceIds);
    if (selectedIds.length === 0) {
        showToast('Warning', 'Please select at least one interface to export', 'warning');
        return;
    }
    const list = (window._interfacesPage || []).filter(i => selectedIds.includes(i.id));
    if (list.length === 0) {
        showToast('Error', 'Selected interfaces are not in the current view. Change page or reload.', 'error');
        return;
    }
    const headers = ['Router', 'Interface Name', 'Created At'];
    const rows = list.map(i => [
        i.router_name || 'N/A',
        i.name,
        i.created_at || ''
    ]);
    exportToCsv(`interfaces_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'')}`, headers, rows);
}

function toggleInterfaceSelection(interfaceId, isChecked) {
    if (isChecked) {
        selectedInterfaceIds.add(interfaceId);
    } else {
        selectedInterfaceIds.delete(interfaceId);
    }
    updateDeleteButton();
    updateSelectAllCheckbox();
}

function updateDeleteButton() {
    const deleteBtn = document.getElementById('deleteInterfacesBtn');
    if (deleteBtn) {
        deleteBtn.style.display = selectedInterfaceIds.size > 0 ? 'inline-block' : 'none';
    }
}

function updateSelectAllCheckbox() {
    const selectAll = document.getElementById('selectAllInterfaces');
    if (selectAll) {
        const checkboxes = document.querySelectorAll('.interface-checkbox');
        const allChecked = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
        selectAll.checked = allChecked;
    }
}

async function deleteSelectedInterfaces() {
    const selectedIds = Array.from(selectedInterfaceIds);
    if (selectedIds.length === 0) {
        showToast('Warning', 'Please select at least one interface to delete', 'warning');
        return;
    }
    
    const count = selectedIds.length;
    const message = count === 1
        ? 'Are you sure you want to delete this interface?'
        : `Are you sure you want to delete ${count} interfaces?`;

    const confirmed = await showConfirm({
        title: 'Delete Interfaces',
        message,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmBtnClass: 'btn-danger'
    });
    if (!confirmed) {
        return;
    }
    
    try {
        for (const interfaceId of selectedIds) {
            await apiRequest(`/api/interfaces/${interfaceId}`, {
                method: 'DELETE'
            });
        }
        
        showToast('Success', `Successfully deleted ${count} interface(s)`, 'success');
        selectedInterfaceIds.clear();
        currentPage = 1;
        loadInterfaces();
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
    loadInterfaces();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetAddInterfaceForm() {
    document.getElementById('addInterfaceForm').reset();
    resetSelectById('interfaceRouter');
}

async function addInterface() {
    const routerId = document.getElementById('interfaceRouter').value;
    const name = document.getElementById('interfaceName').value;
    
    if (!routerId || !name) {
        showToast('Error', 'Router and Interface Name are required', 'error');
        return;
    }
    
    try {
        await apiRequest('/api/interfaces', {
            method: 'POST',
            body: JSON.stringify({
                router_id: parseInt(routerId),
                name: name
            })
        });
        
        showToast('Success', 'Interface created successfully', 'success');
        bootstrap.Modal.getInstance(document.getElementById('addInterfaceModal')).hide();
        loadInterfaces();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

// Individual delete function removed - use bulk delete instead

