let currentPage = 1;
const perPage = 50;
let roles = [];

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
document.addEventListener('DOMContentLoaded', async function() {
    setupEventListeners();
    await loadRoles();
    await loadUsers();
});

function setupEventListeners() {
    // Add User Button
    document.getElementById('addUserBtn').addEventListener('click', function() {
        const modal = new bootstrap.Modal(document.getElementById('addUserModal'));
        modal.show();
        resetAddUserForm();
    });
    
    // Confirm Add User
    document.getElementById('confirmAddUser').addEventListener('click', addUser);
}

async function loadUsers() {
    const params = new URLSearchParams({
        page: currentPage,
        per_page: perPage
    });
    
    try {
        const data = await apiRequest(`${window.API_URLS.users}?${params}`);
        renderUsersTable(data.users);
        renderPagination(data.total, data.pages, data.current_page);
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

async function loadRoles() {
    try {
        const data = await apiRequest(window.API_URLS.roles);
        roles = data.roles || [];
        // Populate the Add User modal role select
        const roleSelect = document.getElementById('role');
        if (roleSelect && roles.length > 0) {
            roleSelect.innerHTML = roles.map(r => `
                <option value="${r.id}">${escapeHtml(r.name)}</option>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading roles:', error);
        showToast('Error', 'Failed to load roles list', 'error');
        roles = [];
    }
}

function renderUsersTable(users) {
    const tbody = document.getElementById('userTableBody');
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No users found</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td><strong>${user.username}</strong></td>
            <td>
                <div class="d-flex align-items-center gap-2">
                    <select class="form-select form-select-sm" style="width:auto" id="roleSelect-${user.id}">
                        ${renderRoleOptions(user)}
                    </select>
                    <button class="btn btn-sm btn-outline-primary" onclick="updateUserRole(${user.id})">
                        <i class="fas fa-save"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-warning" onclick="openResetPasswordModal(${user.id}, '${user.username}')">
                        <i class="fas fa-key"></i>
                    </button>
                </div>
            </td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id})">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </td>
        </tr>
    `).join('');
}

function resetAddUserForm() {
    document.getElementById('addUserForm').reset();
    resetSelectById('role');
}

async function addUser() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const roleValue = document.getElementById('role').value;
    
    if (!username || !password) {
        showToast('Error', 'Please fill all required fields', 'error');
        return;
    }
    
    // Validate password strength
    if (password.length < 6) {
        showToast('Error', 'Password must be at least 6 characters long', 'error');
        return;
    }
    
    try {
        await apiRequest(window.API_URLS.addUser, {
            method: 'POST',
            body: JSON.stringify({
                username: username,
                password: password,
                role_id: parseRoleValue(roleValue)
            })
        });
        
        showToast('Success', 'User created successfully', 'success');
        bootstrap.Modal.getInstance(document.getElementById('addUserModal')).hide();
        loadUsers();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

async function updateUserRole(userId) {
    const select = document.getElementById(`roleSelect-${userId}`);
    if (!select) {
        showToast('Error', 'Role selector not found', 'error');
        return;
    }
    const newRole = select.value;
    try {
        await apiRequest(window.API_URLS.updateUser(userId), {
            method: 'PUT',
            body: JSON.stringify({
                role_id: parseRoleValue(newRole)
            })
        });
        showToast('Success', 'User role updated', 'success');
        loadUsers();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

// Admin reset password (sets must_change on next login)
function openResetPasswordModal(userId, username) {
    // Use the global confirm modal as a simple prompt-like flow: show info and then ask for new password via prompt
    // For a better UX, we construct a small temporary modal for password entry.
    let modalEl = document.getElementById('resetPwdModal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'resetPwdModal';
        modalEl.className = 'modal fade';
        modalEl.tabIndex = -1;
        modalEl.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="fas fa-key me-1"></i> Reset Password</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label class="form-label">New password for <strong id="resetPwdUser"></strong></label>
                            <input type="password" class="form-control" id="resetPwdInput" placeholder="At least 6 characters">
                            <small class="text-muted">User will be forced to change the password on next login.</small>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-warning" id="confirmResetPwdBtn">
                            <i class="fas fa-save"></i> Reset
                        </button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modalEl);
    }
    modalEl.querySelector('#resetPwdUser').textContent = username;
    const input = modalEl.querySelector('#resetPwdInput');
    input.value = '';
    const btn = modalEl.querySelector('#confirmResetPwdBtn');
    const bsModal = new bootstrap.Modal(modalEl);

    const handler = async () => {
        const newPwd = input.value.trim();
        if (!newPwd || newPwd.length < 6) {
            showToast('Error', 'Password must be at least 6 characters long', 'error');
            return;
        }
        try {
            await apiRequest(window.API_URLS.resetPassword(userId), {
                method: 'PUT',
                body: JSON.stringify({ new_password: newPwd })
            });
            showToast('Success', 'Password reset. User must change it on next login.', 'success');
            bsModal.hide();
        } catch (e) {
            showToast('Error', e.message, 'error');
        } finally {
            btn.removeEventListener('click', handler);
        }
    };

    btn.addEventListener('click', handler);
    modalEl.addEventListener('hidden.bs.modal', () => {
        btn.removeEventListener('click', handler);
    }, { once: true });

    bsModal.show();
}

async function deleteUser(userId) {
    const confirmed = await showConfirm({
        title: 'Delete User',
        message: 'Are you sure you want to delete this user?',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmBtnClass: 'btn-danger'
    });

    if (!confirmed) {
        return;
    }

    try {
        await apiRequest(window.API_URLS.deleteUser(userId), {
            method: 'DELETE'
        });

        showToast('Success', 'User deleted successfully', 'success');
        currentPage = 1;
        loadUsers();
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

function renderRoleOptions(user) {
    // If we have dynamic roles, render them
    if (roles && roles.length > 0) {
        const selectedId = user.role_id || null;
        return roles.map(r => `
            <option value="${r.id}" ${selectedId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>
        `).join('');
    }
    // Fallback: no roles loaded yet
    return '<option value="">Loading roles...</option>';
}

function parseRoleValue(val) {
    if (!val) return null;
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

function changePage(page) {
    currentPage = page;
    loadUsers();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

