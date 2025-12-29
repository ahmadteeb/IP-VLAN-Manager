let selectedRouterIds = new Set();
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
    setupEventListeners();
});

function setupEventListeners() {
    const addRouterBtn = document.getElementById('addRouterBtn');
    if (addRouterBtn) {
        addRouterBtn.addEventListener('click', function() {
            const modal = new bootstrap.Modal(document.getElementById('addRouterModal'));
            modal.show();
            resetAddRouterForm();
        });
    }
    
    document.getElementById('confirmAddRouter').addEventListener('click', addRouter);

    // Export selected button
    const exportBtn = document.getElementById('exportRoutersBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportSelectedRouters);
    }
    
    // Delete selected button
    const deleteBtn = document.getElementById('deleteRoutersBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteSelectedRouters);
    }

    document.getElementById('searchInput').addEventListener('input', debounce(function() {
        currentPage = 1;
        loadRouters();
    }, 500));
    
    // Select all checkbox
    const selectAll = document.getElementById('selectAllRouters');
    if (selectAll) {
        selectAll.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.router-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = this.checked;
                if (this.checked) {
                    selectedRouterIds.add(parseInt(cb.value));
                } else {
                    selectedRouterIds.delete(parseInt(cb.value));
                }
            });
            updateDeleteButton();
        });
    }
}

async function loadRouters() {
    const params = new URLSearchParams({
        page: currentPage,
        per_page: perPage
    });
    
    const search = document.getElementById('searchInput').value;
    
    if (search) params.append('search', search);
    
    try {
        const data = await apiRequest(`/api/routers?${params}`);
        window._routersPage = data.routers || [];
        renderRoutersTable(data.routers);
        renderPagination(data.total, data.pages, data.current_page);
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

function renderRoutersTable(routers) {
    const tbody = document.getElementById('routerTableBody');
    
    const isAdmin = document.getElementById('addRouterBtn') !== null;
    const colspan = isAdmin ? 5 : 4;
    if (routers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center text-muted">No routers found</td></tr>`;
        return;
    }
    tbody.innerHTML = routers.map(router => {
        const isChecked = selectedRouterIds.has(router.id) ? 'checked' : '';
        const checkbox = isAdmin ? `<td><input type="checkbox" class="router-checkbox" value="${router.id}" ${isChecked} onchange="toggleRouterSelection(${router.id}, this.checked)"></td>` : '';
        return `
        <tr>
            ${checkbox}
            <td><strong>${router.name}</strong></td>
            <td><code>${router.router_ip}</code></td>
            <td>${router.router_type}</td>
            <td><span class="badge bg-info">${router.interface_count || 0}</span></td>
        </tr>
        `;
    }).join('');
    
    updateDeleteButton();
    updateSelectAllCheckbox();
}

function exportSelectedRouters() {
    const selectedIds = Array.from(selectedRouterIds);
    if (selectedIds.length === 0) {
        showToast('Error', 'Please select at least one router to export', 'error');
        return;
    }
    const list = (window._routersPage || []).filter(r => selectedIds.includes(r.id));
    if (list.length === 0) {
        showToast('Error', 'Selected routers are not in the current view. Change page or reload.', 'error');
        return;
    }
    const headers = ['Name', 'Router IP', 'Type', 'Description', 'Interface Count'];
    const rows = list.map(r => [
        r.name,
        r.router_ip,
        r.router_type,
        r.description || '',
        r.interface_count || 0
    ]);
    exportToCsv(`routers_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'')}`, headers, rows);
}

function toggleRouterSelection(routerId, isChecked) {
    if (isChecked) {
        selectedRouterIds.add(routerId);
    } else {
        selectedRouterIds.delete(routerId);
    }
    updateDeleteButton();
    updateSelectAllCheckbox();
}

function updateDeleteButton() {
    const deleteBtn = document.getElementById('deleteRoutersBtn');
    if (deleteBtn) {
        deleteBtn.style.display = selectedRouterIds.size > 0 ? 'inline-block' : 'none';
    }
}

function updateSelectAllCheckbox() {
    const selectAll = document.getElementById('selectAllRouters');
    if (selectAll) {
        const checkboxes = document.querySelectorAll('.router-checkbox');
        const allChecked = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
        selectAll.checked = allChecked;
    }
}

async function deleteSelectedRouters() {
    const selectedIds = Array.from(selectedRouterIds);
    if (selectedIds.length === 0) {
        showToast('Error', 'Please select at least one router to delete', 'error');
        return;
    }
    
    const count = selectedIds.length;
    const message = count === 1
        ? 'Are you sure you want to delete this router? This will also delete all associated interfaces.'
        : `Are you sure you want to delete ${count} routers? This will also delete all associated interfaces.`;

    const confirmed = await showConfirm({
        title: 'Delete Routers',
        message,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmBtnClass: 'btn-danger'
    });
    if (!confirmed) {
        return;
    }
    
    try {
        for (const routerId of selectedIds) {
            await apiRequest(`/api/routers/${routerId}`, {
                method: 'DELETE'
            });
        }
        
        showToast('Success', `Successfully deleted ${count} router(s)`, 'success');
        selectedRouterIds.clear();
        currentPage = 1;
        loadRouters();
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
    loadRouters();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetAddRouterForm() {
    document.getElementById('addRouterForm').reset();
    resetSelectById('routerType');
}

async function addRouter() {
    const name = document.getElementById('routerName').value;
    const routerIp = document.getElementById('routerIp').value;
    const routerType = document.getElementById('routerType').value;
    const description = document.getElementById('routerDescription').value;
    
    if (!name || !routerIp || !routerType) {
        showToast('Error', 'Router name, IP, and type are required', 'error');
        return;
    }
    
    try {
        await apiRequest('/api/routers', {
            method: 'POST',
            body: JSON.stringify({
                name: name,
                router_ip: routerIp,
                router_type: routerType,
                description: description
            })
        });
        
        showToast('Success', 'Router created successfully', 'success');
        bootstrap.Modal.getInstance(document.getElementById('addRouterModal')).hide();
        loadRouters();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

// Individual delete function removed - use bulk delete instead

