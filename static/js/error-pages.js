/**
 * Error Pages JavaScript
 * Handles theme switching and animations for error pages
 */

(function() {
    'use strict';

    // Initialize theme toggle if button exists
    function initThemeToggle() {
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', function() {
                const currentTheme = document.documentElement.getAttribute('data-bs-theme');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-bs-theme', newTheme);
                try {
                    localStorage.setItem('theme', newTheme);
                } catch (e) {
                    console.warn('Could not save theme preference:', e);
                }
            });
        }
    }

    // Add entrance animation to error content
    function animateErrorContent() {
        const errorContent = document.querySelector('.error-content');
        if (errorContent) {
            errorContent.style.opacity = '0';
            errorContent.style.transform = 'translateY(20px)';
            errorContent.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            
            setTimeout(function() {
                errorContent.style.opacity = '1';
                errorContent.style.transform = 'translateY(0)';
            }, 100);
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initThemeToggle();
            animateErrorContent();
        });
    } else {
        initThemeToggle();
        animateErrorContent();
    }
})();
