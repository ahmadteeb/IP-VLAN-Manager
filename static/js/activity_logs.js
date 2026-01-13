let activityCurrentPage = 1;
const activityPerPage = 50;

document.addEventListener('DOMContentLoaded', function() {
    loadActivityLogs();
});

async function loadActivityLogs() {
    const params = new URLSearchParams({
        page: activityCurrentPage,
        per_page: activityPerPage
    });

    try {
        const data = await apiRequest(`${window.API_URLS.activityLogs}?${params}`);
        renderActivityLogsTable(data.logs || []);
        renderActivityPagination(data.total, data.pages, data.current_page);
    } catch (error) {
        showToast('Error', error.message || 'Failed to load activity logs', 'error');
        console.error('Error loading activity logs:', error);
    }
}

function renderActivityLogsTable(logs) {
    const tbody = document.getElementById('activityLogsBody');
    if (!tbody) return;

    if (!logs.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted py-4">No activities found</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = logs.map(log => {
        const ts = log.timestamp || '';
        const tsDisplay = ts ? ts.replace('T', ' ').substring(0, 19) : 'N/A';
        const action = (log.action || '').replace(/_/g, ' ');
        const isPositive = action.includes('assign') || action.includes('create') || action.includes('import');
        const actionBadgeClass = isPositive ? 'success' : 'warning';

        return `
        <tr>
            <td>${tsDisplay}</td>
            <td>${escapeHtml(log.user_username || '')}</td>
            <td>
                <span class="badge bg-${actionBadgeClass}">
                    ${escapeHtml(action.charAt(0).toUpperCase() + action.slice(1))}
                </span>
            </td>
            <td>
                <span class="badge bg-info text-dark">${escapeHtml((log.resource_type || '').toUpperCase())}</span>
                ${escapeHtml(log.resource_value || '')}
            </td>
            <td>${escapeHtml(log.site_name || 'N/A')}</td>
            <td>${escapeHtml(log.router || 'N/A')}</td>
            <td>${escapeHtml(log.interface || 'N/A')}</td>
        </tr>
        `;
    }).join('');
}

function renderActivityPagination(total, pages, current) {
    const pagination = document.getElementById('activityLogsPagination');
    if (!pagination) return;

    if (!pages || pages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';

    const makePageItem = (page, label, disabled = false, active = false) => {
        const cls = [
            'page-item',
            disabled ? 'disabled' : '',
            active ? 'active' : ''
        ].join(' ').trim();
        const safeLabel = label;
        if (disabled || active) {
            return `<li class="${cls}"><span class="page-link">${safeLabel}</span></li>`;
        }
        return `<li class="${cls}"><button type="button" class="page-link" onclick="goToActivityPage(${page})">${safeLabel}</button></li>`;
    };

    html += makePageItem(current - 1, '&laquo;', current === 1);

    const maxPagesToShow = 7;
    let start = Math.max(1, current - 3);
    let end = Math.min(pages, start + maxPagesToShow - 1);
    if (end - start < maxPagesToShow - 1) {
        start = Math.max(1, end - maxPagesToShow + 1);
    }

    for (let p = start; p <= end; p++) {
        html += makePageItem(p, p, false, p === current);
    }

    html += makePageItem(current + 1, '&raquo;', current === pages);

    pagination.innerHTML = html;
}

function goToActivityPage(page) {
    if (page < 1 || page === activityCurrentPage) return;
    activityCurrentPage = page;
    loadActivityLogs();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

