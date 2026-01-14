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
        const data = await apiRequest(`${window.API_URLS.roles}`);
        roles = data.roles;
        renderRolesTable();
    } catch (error) {
        console.error('Error loading roles:', error);
        showToast('Error', error.message || 'Failed to load roles', 'error');
    }
}

async function loadPermissions() {
    try {
        const data = await apiRequest(`${window.API_URLS.permissions}`);
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
    
    // Create a map of permission codes to permission objects for quick lookup
    const permMap = {};
    permissions.forEach(p => {
        permMap[p.code] = p;
    });
    
    let html = '';
    for (const [category, perms] of Object.entries(permissionsByCategory)) {
        const categoryTitle = category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ');
        html += `
            <div class="mb-3">
                <h6 class="fw-semibold text-primary mb-2">
                    <i class="fas fa-folder me-1"></i> ${escapeHtml(categoryTitle)}
                </h6>
                <div class="ms-3">
                    ${perms.map(perm => {
                        const warning = getPermissionWarning(perm.code, permMap);
                        return `
                        <div class="form-check mb-2">
                            <input class="form-check-input permission-checkbox" 
                                   type="checkbox" 
                                   value="${perm.id}" 
                                   id="perm-${perm.id}"
                                   data-code="${escapeHtml(perm.code)}"
                                   onchange="checkPermissionDependencies('${escapeHtml(perm.code)}', ${perm.id})">
                            <label class="form-check-label" for="perm-${perm.id}">
                                <strong>${escapeHtml(perm.name)}</strong>
                                <br>
                                <small class="text-muted">${escapeHtml(perm.description || 'No description')}</small>
                                ${warning ? `<div id="warning-${perm.id}" class="text-warning small mt-1" style="display: none;"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(warning)}</div>` : ''}
                            </label>
                        </div>
                    `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function getPermissionWarning(permCode, permMap) {
    // Get required permissions from the permission object
    const perm = permMap[permCode];
    if (!perm || !perm.required_permissions || perm.required_permissions.length === 0) {
        return null;
    }
    
    // Build warning message from required permissions
    const requiredPerms = perm.required_permissions;
    const permNames = requiredPerms.map(code => {
        const reqPerm = permMap[code];
        return reqPerm ? reqPerm.name : code;
    });
    
    if (permNames.length === 1) {
        return `${permNames[0]} permission must also be selected`;
    } else if (permNames.length === 2) {
        return `${permNames.join(' and ')} permissions must also be selected`;
    } else {
        return `${permNames.slice(0, -1).join(', ')}, and ${permNames[permNames.length - 1]} permissions must also be selected`;
    }
}

// Track visited permissions to prevent infinite recursion
let checkingPermissions = new Set();

function checkPermissionDependencies(permCode, permId, skipRecursion = false) {
    // Prevent infinite recursion
    const permKey = `${permCode}_${permId}`;
    if (checkingPermissions.has(permKey)) {
        return;
    }
    
    checkingPermissions.add(permKey);
    
    try {
        const checkbox = document.getElementById(`perm-${permId}`);
        if (!checkbox) {
            return;
        }
        
        const warningDiv = document.getElementById(`warning-${permId}`);
        const isChecked = checkbox.checked;
        
        if (!isChecked) {
            if (warningDiv) warningDiv.style.display = 'none';
            return;
        }
        
        // Create permission map
        const permMap = {};
        permissions.forEach(p => {
            permMap[p.code] = p;
        });
        
        // Get all checked permissions
        const checkedPerms = Array.from(document.querySelectorAll('.permission-checkbox:checked'))
            .map(cb => cb.getAttribute('data-code'));
        
        let warnings = [];
        
        // Get required permissions from the permission object
        const perm = permMap[permCode];
        if (perm && perm.required_permissions && perm.required_permissions.length > 0) {
            const missing = [];
            perm.required_permissions.forEach(reqCode => {
                if (!checkedPerms.includes(reqCode)) {
                    const reqPerm = permMap[reqCode];
                    missing.push(reqPerm ? reqPerm.name : reqCode);
                }
            });
            
            if (missing.length > 0) {
                if (missing.length === 1) {
                    warnings.push(`${missing[0]} permission must also be selected`);
                } else if (missing.length === 2) {
                    warnings.push(`${missing.join(' and ')} permissions must also be selected`);
                } else {
                    warnings.push(`${missing.slice(0, -1).join(', ')}, and ${missing[missing.length - 1]} permissions must also be selected`);
                }
            }
        }
        
        const showWarning = warnings.length > 0;
        const warningText = warnings.join(' | ');
        
        if (warningDiv) {
            if (showWarning) {
                warningDiv.textContent = `⚠ ${warningText}`;
                warningDiv.style.display = 'block';
            } else {
                warningDiv.style.display = 'none';
            }
        }
        
        // Re-check all other checked permissions to update their warnings (only if recursion is allowed)
        if (!skipRecursion) {
            // Collect all other checked permissions first
            const otherPermissions = [];
            document.querySelectorAll('.permission-checkbox').forEach(cb => {
                const otherPermId = cb.value;
                const otherPermCode = cb.getAttribute('data-code');
                if (otherPermId != permId && cb.checked) {
                    otherPermissions.push({ code: otherPermCode, id: otherPermId });
                }
            });
            
            // Check each one without recursion
            otherPermissions.forEach(perm => {
                checkPermissionDependencies(perm.code, perm.id, true);
            });
        }
    } finally {
        checkingPermissions.delete(permKey);
    }
}

function resetRoleForm() {
    document.getElementById('roleForm').reset();
    document.getElementById('roleId').value = '';
    // Uncheck all permission checkboxes and hide warnings
    document.querySelectorAll('.permission-checkbox').forEach(cb => {
        cb.checked = false;
        const permId = cb.value;
        const warningDiv = document.getElementById(`warning-${permId}`);
        if (warningDiv) warningDiv.style.display = 'none';
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
        const isChecked = permissionIds.includes(parseInt(cb.value));
        cb.checked = isChecked;
        // Trigger dependency checks for checked permissions
        if (isChecked) {
            const permCode = cb.getAttribute('data-code');
            checkPermissionDependencies(permCode, parseInt(cb.value));
        }
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
    
    const url = roleId ? `${window.API_URLS.updateRole(roleId)}` : `${window.API_URLS.addRole}`;
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
        const url = `${window.API_URLS.deleteRole(roleId)}`;
        const data = await apiRequest(url, {
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

