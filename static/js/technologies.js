let selectedTechIds = new Set();

document.addEventListener('DOMContentLoaded', function() {
    loadTechnologies();
    setupTechEvents();
});

function setupTechEvents() {
    const addBtn = document.getElementById('addTechBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => openTechModal());
    }
    const saveBtn = document.getElementById('saveTechBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveTechnology);
    }
    const selectAll = document.getElementById('selectAllTechs');
    if (selectAll) {
        selectAll.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.tech-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = this.checked;
                if (this.checked) {
                    selectedTechIds.add(parseInt(cb.value));
                } else {
                    selectedTechIds.delete(parseInt(cb.value));
                }
            });
            updateDeleteTechsBtn();
        });
    }
    const deleteBtn = document.getElementById('deleteTechsBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteSelectedTechnologies);
    }
}

async function loadTechnologies() {
    try {
        const data = await apiRequest(window.API_URLS.technologies);
        renderTechTable(data.technologies || []);
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

function renderTechTable(items) {
    const tbody = document.getElementById('techTableBody');
    if (!tbody) return;
    const isAdmin = document.getElementById('selectAllTechs') !== null;
    const colspan = isAdmin ? 4 : 3;
    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center text-muted">No technologies defined</td></tr>`;
        return;
    }
    tbody.innerHTML = items.map(t => {
        const checked = selectedTechIds.has(t.id) ? 'checked' : '';
        const checkbox = isAdmin ? `<td><input type="checkbox" class="tech-checkbox" value="${t.id}" ${checked} onchange="toggleTechSelection(${t.id}, this.checked)"></td>` : '';
        return `
        <tr>
            ${checkbox}
            <td>${t.id}</td>
            <td>${t.name}</td>
            <td><span class="text-muted small">${t.created_at ? new Date(t.created_at).toLocaleString() : ''}</span></td>
        </tr>`;
    }).join('');
    updateDeleteTechsBtn();
    updateSelectAllTechsCheckbox();
}

function toggleTechSelection(id, isChecked) {
    if (isChecked) selectedTechIds.add(id); else selectedTechIds.delete(id);
    updateDeleteTechsBtn();
    updateSelectAllTechsCheckbox();
}

function updateDeleteTechsBtn() {
    const btn = document.getElementById('deleteTechsBtn');
    if (btn) btn.style.display = selectedTechIds.size > 0 ? 'inline-block' : 'none';
}

function updateSelectAllTechsCheckbox() {
    const selectAll = document.getElementById('selectAllTechs');
    if (!selectAll) return;
    const checkboxes = document.querySelectorAll('.tech-checkbox');
    selectAll.checked = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
}

function openTechModal() {
    document.getElementById('techId').value = '';
    document.getElementById('techLabel').value = '';
    document.getElementById('techModalTitle').textContent = 'Add Technology';
    const modal = new bootstrap.Modal(document.getElementById('techModal'));
    modal.show();
}

async function saveTechnology() {
    const name = document.getElementById('techLabel').value.trim();

    if (!name) {
        showToast('Error', 'Name is required', 'error');
        return;
    }

    try {
        await apiRequest(window.API_URLS.addTechnology, {
            method: 'POST',
            body: JSON.stringify({ name })
        });
        showToast('Success', 'Technology created', 'success');
        bootstrap.Modal.getInstance(document.getElementById('techModal')).hide();
        loadTechnologies();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

async function deleteTechnology(id) {
    const confirmed = await showConfirm({
        title: 'Delete Technology',
        message: 'Are you sure you want to delete this technology?',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmBtnClass: 'btn-danger'
    });
    if (!confirmed) return;
    try {
        await apiRequest(window.API_URLS.deleteTechnology(id), { method: 'DELETE' });
        showToast('Success', 'Technology deleted', 'success');
        loadTechnologies();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

async function deleteSelectedTechnologies() {
    const ids = Array.from(selectedTechIds);
    if (ids.length === 0) return;
    const confirmed = await showConfirm({
        title: 'Delete Technologies',
        message: `Delete ${ids.length} selected item(s)?`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmBtnClass: 'btn-danger'
    });
    if (!confirmed) return;
    try {
        // No bulk endpoint; delete sequentially
        for (const id of ids) {
            await apiRequest(window.API_URLS.deleteTechnology(id), { method: 'DELETE' });
        }
        selectedTechIds.clear();
        showToast('Success', `Deleted ${ids.length} item(s)`, 'success');
        loadTechnologies();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}


