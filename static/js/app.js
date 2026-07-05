// Loader Helpers
let loaderElement = null;
let loaderTextElement = null;
let loaderCounter = 0;
let loaderTimer = null;
let loaderProgressContainer = null;
let loaderProgressBar = null;
let loaderProgressText = null;

function ensureLoaderElements() {
    if (!loaderElement) {
        loaderElement = document.getElementById('globalLoader');
        loaderTextElement = document.getElementById('globalLoaderText');
        loaderProgressContainer = document.getElementById('globalLoaderProgressContainer');
        loaderProgressBar = document.getElementById('globalLoaderProgressBar');
        loaderProgressText = document.getElementById('globalLoaderProgressText');
    }
}

function activateLoader() {
    if (!loaderElement) return;
    loaderElement.classList.add('active');
}

function updateLoaderProgress(percentage, countStr) {
    ensureLoaderElements();
    if (loaderProgressContainer && loaderProgressBar && loaderProgressText) {
        if (percentage >= 0) {
            loaderProgressContainer.style.display = 'flex';
            loaderProgressText.style.display = 'block';
            loaderProgressBar.style.width = percentage + '%';
            loaderProgressBar.setAttribute('aria-valuenow', percentage);
            loaderProgressText.textContent = countStr ? `${percentage}% (${countStr})` : `${percentage}%`;
        } else {
            loaderProgressContainer.style.display = 'none';
            loaderProgressText.style.display = 'none';
        }
    }
}

function showLoader(message = 'Loading...', delay = 250) {
    ensureLoaderElements();
    if (!loaderElement) return;

    loaderCounter += 1;
    if (loaderTextElement) {
        loaderTextElement.textContent = message;
    }
    if (loaderCounter === 1) {
        if (loaderTimer) clearTimeout(loaderTimer);
        loaderTimer = setTimeout(() => {
            activateLoader();
            loaderTimer = null;
        }, Math.max(delay, 0));
    } else if (loaderElement.classList.contains('active')) {
        activateLoader();
    }
}

function hideLoader(force = false) {
    ensureLoaderElements();
    if (!loaderElement) return;

    loaderCounter = force ? 0 : Math.max(loaderCounter - 1, 0);
    if (loaderCounter === 0) {
        if (loaderTimer) {
            clearTimeout(loaderTimer);
            loaderTimer = null;
        }
        loaderElement.classList.remove('active');
        if (loaderTextElement) {
            loaderTextElement.textContent = 'Loading...';
        }
        updateLoaderProgress(-1);
    }
}

window.showLoader = showLoader;
window.hideLoader = hideLoader;
window.updateLoaderProgress = updateLoaderProgress;

// Global SSE Initialization
let globalEventSource = null;

function initSSE() {
    if (window.EventSource && !globalEventSource) {
        globalEventSource = new EventSource('/api/events');
        globalEventSource.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'update') {
                    document.dispatchEvent(new CustomEvent('app:data_updated', { detail: data }));
                } else if (data.type === 'progress') {
                    const percentage = Math.round((data.count / data.total) * 100);
                    const countStr = `${data.count}/${data.total}`;
                    updateLoaderProgress(percentage, countStr);
                } else if (data.type === 'ping') {
                    // Just a keep-alive ping, ignore
                }
            } catch (e) {
                console.error("Error parsing SSE data", e);
            }
        };
        globalEventSource.onerror = function(err) {
            console.error("SSE Error:", err);
            // Browser will automatically attempt to reconnect, but let's clear our ref if it completely fails
            if (globalEventSource && globalEventSource.readyState === EventSource.CLOSED) {
                globalEventSource = null;
            }
        };
    }
}

document.addEventListener('DOMContentLoaded', function() {
    initSSE();
});


// Theme Toggle & Layout Behaviour
document.addEventListener('DOMContentLoaded', function() {
    ensureLoaderElements();

    const themeToggle = document.getElementById('themeToggle');
    const html = document.documentElement;

    // Check for saved theme preference or default to light mode
    const currentTheme = localStorage.getItem('theme') || 'light';
    if (currentTheme === 'dark') {
        html.setAttribute('data-bs-theme', 'dark');
    }
    updateThemeIcon(currentTheme === 'dark');

    if (themeToggle) {
        themeToggle.addEventListener('click', function() {
            const isDark = html.getAttribute('data-bs-theme') === 'dark';
            if (isDark) {
                html.setAttribute('data-bs-theme', 'light');
                localStorage.setItem('theme', 'light');
                updateThemeIcon(false);
            } else {
                html.setAttribute('data-bs-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                updateThemeIcon(true);
            }
        });
    }

    function updateThemeIcon(isDark) {
        const icon = themeToggle ? themeToggle.querySelector('i') : null;
        if (icon) {
            icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
        }
        if (themeToggle) {
            themeToggle.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
        }
    }

    // Sidebar Toggle for Mobile
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');

    if (sidebarToggleBtn && sidebar) {
        sidebarToggleBtn.addEventListener('click', function() {
            sidebar.classList.add('show');
        });
    }

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.remove('show');
        });
    }

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function(event) {
        if (window.innerWidth <= 767.98 && sidebar && sidebarToggleBtn) {
            if (sidebar.classList.contains('show') &&
                !sidebar.contains(event.target) &&
                !sidebarToggleBtn.contains(event.target)) {
                sidebar.classList.remove('show');
            }
        }
    });
});

// Toast Notification Helper
function showToast(title, message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastTitle = document.getElementById('toastTitle');
    const toastBody = document.getElementById('toastBody');
    
    // Set toast type
    const bgClass = type === 'success' ? 'bg-success' : 
                   type === 'error' ? 'bg-danger' : 
                   type === 'warning' ? 'bg-warning' : 'bg-info';
    
    toast.className = `toast ${bgClass} text-white`;
    toastTitle.textContent = title;
    toastBody.textContent = message;
    
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

// Modern Confirm Modal Helper (returns Promise<boolean>)
function showConfirm(options = {}) {
    const {
        title = 'Please Confirm',
        message = 'Are you sure?',
        confirmText = 'Confirm',
        cancelText = 'Cancel',
        confirmBtnClass = 'btn-primary'
    } = options;

    return new Promise((resolve) => {
        // Create modal container if not exists
        let modalEl = document.getElementById('globalConfirmModal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'globalConfirmModal';
            modalEl.className = 'modal fade';
            modalEl.tabIndex = -1;
            modalEl.innerHTML = `
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title"></h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <p class="mb-0"></p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"></button>
                            <button type="button" class="btn"></button>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(modalEl);
        }

        const titleEl = modalEl.querySelector('.modal-title');
        const bodyEl = modalEl.querySelector('.modal-body p');
        const cancelBtn = modalEl.querySelector('.modal-footer .btn-secondary');
        const confirmBtn = modalEl.querySelector('.modal-footer .btn:last-child');

        titleEl.textContent = title;
        bodyEl.textContent = message;
        cancelBtn.textContent = cancelText;
        confirmBtn.textContent = confirmText;

        // Reset classes on confirm button
        confirmBtn.className = 'btn ' + confirmBtnClass;

        const bsModal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });

        const cleanup = () => {
            modalEl.removeEventListener('hidden.bs.modal', onHidden);
            cancelBtn.removeEventListener('click', onCancel);
            confirmBtn.removeEventListener('click', onConfirm);
        };

        const onHidden = () => {
            cleanup();
            resolve(false);
        };
        const onCancel = () => {
            cleanup();
            bsModal.hide();
            resolve(false);
        };
        const onConfirm = () => {
            cleanup();
            bsModal.hide();
            resolve(true);
        };

        modalEl.addEventListener('hidden.bs.modal', onHidden, { once: true });
        cancelBtn.addEventListener('click', onCancel, { once: true });
        confirmBtn.addEventListener('click', onConfirm, { once: true });

        bsModal.show();
    });
}
window.showConfirm = showConfirm;

// CSV/Excel export helpers
function exportToCsv(filename, headers, rows) {
    const escapeCsv = (value) => {
        if (value == null) return '';
        const str = String(value);
        if (/[",\n]/.test(str)) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };
    const headerLine = headers.map(escapeCsv).join(',');
    const dataLines = rows.map(r => r.map(escapeCsv).join(','));
    const csv = [headerLine, ...dataLines].join('\r\n');
    const blob = new Blob(
        ['\uFEFF' + csv],
        { type: 'text/csv;charset=utf-8;' }
    );
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
window.exportToCsv = exportToCsv;

// API Helper Functions
async function apiRequest(url, options = {}) {
    const {
        showLoading = true,
        loadingMessage = 'Loading...',
        loadingDelay = 250,
        headers,
        ...fetchOptions
    } = options;

    try {
        if (showLoading) {
            showLoader(loadingMessage, loadingDelay);
        }

        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...(headers || {})
            },
            ...fetchOptions
        });

        let data = {};
        if (response.status !== 204) {
            const contentType = response.headers.get('Content-Type') || '';

            if (contentType.includes('application/json')) {
                data = await response.json();
            } else {
                const textPayload = await response.text();
                if (textPayload) {
                    try {
                        data = JSON.parse(textPayload);
                    } catch (parseError) {
                        console.warn('Non-JSON response received', { url, textPayload });
                        data = { message: textPayload };
                    }
                }
            }
        }

        if (!response.ok) {
            const errorMessage = data?.error || data?.message || `Request failed with status ${response.status}`;
            throw new Error(errorMessage);
        }

        return data;
    } catch (error) {
        console.error('API Error', { url, options, error });
        throw error;
    } finally {
        if (showLoading) {
            hideLoader();
        }
    }
}

// Format Date Helper
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
}

// Debounce Helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

