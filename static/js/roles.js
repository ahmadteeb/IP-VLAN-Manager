let roles = [];
let permissions = [];
let permissionsByCategory = {};
let editingRoleId = null;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    loadRoles();
    loadPermissions();
    setupEventListeners();
});

function setupEventListeners() {
    // Add Role Button
    document.getElementById('addRoleBtn').addEventListener('click', function() {
        editingRoleId = null;
        document.getElementById('roleModalTitle').textContent = 'Add Role';
        resetRoleForm();
        const modal = new bootstrap.Modal(document.getElementById('roleModal'));
        modal.show();
    });
    
    // Save Role Button
    document.getElementById('saveRoleBtn').addEventListener('click', saveRole);
}

async function loadRoles() {
    try {
        const data = await apiRequest('/api/roles');
        roles = data.roles;
        renderRolesTable();
    } catch (error) {
        console.error('Error loading roles:', error);
        showToast('Error', error.message || 'Failed to load roles', 'error');
    }
}

async function loadPermissions() {
    try {
        const data = await apiRequest('/api/permissions');
        permissions = data.permissions;
        permissionsByCategory = data.permissions_by_category;
        renderPermissions();
    } catch (error) {
        console.error('Error loading permissions:', error);
        showToast('Error', error.message || 'Failed to load permissions', 'error');
    }
}

function renderRolesTable() {
    const tbody = document.getElementById('rolesTableBody');
    
    if (roles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No roles found</td></tr>';
        return;
    }
    
    tbody.innerHTML = roles.map(role => {
        const permissionCount = role.permissions ? role.permissions.length : 0;
        const userCount = role.user_count || 0;
        const isSystem = role.is_system;
        const badgeClass = isSystem ? 'bg-primary' : 'bg-secondary';
        
        return `
            <tr>
                <td>
                    <strong>${escapeHtml(role.name)}</strong>
                    ${isSystem ? '<span class="badge ' + badgeClass + ' ms-2">System</span>' : ''}
                </td>
                <td>${escapeHtml(role.description || 'No description')}</td>
                <td>
                    <span class="badge bg-info">${permissionCount} permission${permissionCount !== 1 ? 's' : ''}</span>
                </td>
                <td>
                    <span class="badge bg-success">${userCount} user${userCount !== 1 ? 's' : ''}</span>
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        ${role.name !== 'Admin' ? `
                            <button class="btn btn-outline-primary" onclick="editRole(${role.id})" title="Edit Role">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}
                        ${role.name !== 'Admin' ? `
                            <button class="btn btn-outline-danger" onclick="deleteRole(${role.id})" title="Delete Role">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderPermissions() {
    const container = document.getElementById('permissionsContainer');
    
    if (Object.keys(permissionsByCategory).length === 0) {
        container.innerHTML = '<div class="text-center text-muted">No permissions available</div>';
        return;
    }
    
    let html = '';
    for (const [category, perms] of Object.entries(permissionsByCategory)) {
        const categoryTitle = category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ');
        html += `
            <div class="mb-3">
                <h6 class="fw-semibold text-primary mb-2">
                    <i class="fas fa-folder me-1"></i> ${escapeHtml(categoryTitle)}
                </h6>
                <div class="ms-3">
                    ${perms.map(perm => `
                        <div class="form-check mb-2">
                            <input class="form-check-input permission-checkbox" 
                                   type="checkbox" 
                                   value="${perm.id}" 
                                   id="perm-${perm.id}"
                                   data-code="${escapeHtml(perm.code)}">
                            <label class="form-check-label" for="perm-${perm.id}">
                                <strong>${escapeHtml(perm.name)}</strong>
                                <br>
                                <small class="text-muted">${escapeHtml(perm.description || 'No description')}</small>
                            </label>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function resetRoleForm() {
    document.getElementById('roleForm').reset();
    document.getElementById('roleId').value = '';
    // Uncheck all permission checkboxes
    document.querySelectorAll('.permission-checkbox').forEach(cb => {
        cb.checked = false;
    });
}

function editRole(roleId) {
    const role = roles.find(r => r.id === roleId);
    if (!role) {
        showToast('Error', 'Role not found', 'error');
        return;
    }
    
    editingRoleId = roleId;
    document.getElementById('roleModalTitle').textContent = 'Edit Role';
    document.getElementById('roleId').value = role.id;
    document.getElementById('roleName').value = role.name;
    document.getElementById('roleDescription').value = role.description || '';
    
    // Check the permissions for this role
    const permissionIds = role.permission_ids || [];
    document.querySelectorAll('.permission-checkbox').forEach(cb => {
        cb.checked = permissionIds.includes(parseInt(cb.value));
    });
    
    const modal = new bootstrap.Modal(document.getElementById('roleModal'));
    modal.show();
}

async function saveRole() {
    const roleId = document.getElementById('roleId').value;
    const name = document.getElementById('roleName').value.trim();
    const description = document.getElementById('roleDescription').value.trim();
    
    // Get selected permission IDs
    const selectedPermissions = Array.from(document.querySelectorAll('.permission-checkbox:checked'))
        .map(cb => parseInt(cb.value));
    
    if (!name) {
        showToast('Error', 'Role name is required', 'error');
        return;
    }
    
    if (selectedPermissions.length === 0) {
        showToast('Error', 'Please select at least one permission', 'error');
        return;
    }
    
    const url = roleId ? `/api/roles/${roleId}` : '/api/roles';
    const method = roleId ? 'PUT' : 'POST';
    
    try {
        const data = await apiRequest(url, {
            method: method,
            body: JSON.stringify({
                name: name,
                description: description,
                permission_ids: selectedPermissions
            })
        });
        
        showToast('Success', data.message || 'Role saved successfully', 'success');
        bootstrap.Modal.getInstance(document.getElementById('roleModal')).hide();
        loadRoles();
    } catch (error) {
        console.error('Error saving role:', error);
        showToast('Error', error.message || 'Failed to save role', 'error');
    }
}

async function deleteRole(roleId) {
    const role = roles.find(r => r.id === roleId);
    if (!role) {
        showToast('Error', 'Role not found', 'error');
        return;
    }
    
    if (role.name === 'Admin') {
        showToast('Error', 'Cannot delete the Admin role', 'error');
        return;
    }
    
    const confirmed = await showConfirm({
        title: 'Delete Role',
        message: `Are you sure you want to delete the role "${role.name}"?\nThis action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmBtnClass: 'btn-danger'
    });

    if (!confirmed) {
        return;
    }

    try {
        const data = await apiRequest(`/api/roles/${roleId}`, {
            method: 'DELETE'
        });
        
        showToast('Success', data.message || 'Role deleted successfully', 'success');
        loadRoles();
    } catch (error) {
        console.error('Error deleting role:', error);
        showToast('Error', error.message || 'Failed to delete role', 'error');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

