// Searchable Dropdown Enhancement
// Converts regular select elements into searchable dropdowns with modern design

(function() {
    'use strict';

    function createSearchableDropdown(selectElement) {
        // Skip if already enhanced or if it's a multi-select (handled differently)
        if (selectElement.dataset.searchable === 'true' || selectElement.multiple) {
            return;
        }

        selectElement.dataset.searchable = 'true';
        const originalId = selectElement.id;
        const wrapper = document.createElement('div');
        wrapper.className = 'searchable-dropdown-wrapper';
        wrapper.style.position = 'relative';
        wrapper.style.width = '100%';

        // Create search input
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'form-control searchable-dropdown-search';
        searchInput.placeholder = 'Search...';
        searchInput.style.display = 'none';
        searchInput.style.width = '100%';
        searchInput.style.marginBottom = '4px';
        searchInput.style.paddingLeft = '2.5rem';

        // Search icon
        const searchIcon = document.createElement('i');
        searchIcon.className = 'fas fa-search';
        searchIcon.style.position = 'absolute';
        searchIcon.style.left = '0.75rem';
        searchIcon.style.top = '50%';
        searchIcon.style.transform = 'translateY(-50%)';
        searchIcon.style.color = '#6c757d';
        searchIcon.style.pointerEvents = 'none';
        searchIcon.style.zIndex = '10';
        searchIcon.style.display = 'none';

        const iconWrapper = document.createElement('div');
        iconWrapper.style.position = 'relative';
        iconWrapper.style.width = '100%';
        iconWrapper.appendChild(searchInput);
        iconWrapper.appendChild(searchIcon);

        // Wrap the select
        selectElement.parentNode.insertBefore(wrapper, selectElement);
        wrapper.appendChild(iconWrapper);
        wrapper.appendChild(selectElement);

        // Hide original select
        selectElement.style.display = 'none';

        // Create custom dropdown
        const customSelect = document.createElement('div');
        customSelect.className = 'form-select searchable-dropdown-custom';
        customSelect.style.cursor = 'pointer';
        customSelect.style.position = 'relative';
        customSelect.setAttribute('tabindex', '0');
        customSelect.setAttribute('role', 'combobox');
        customSelect.setAttribute('aria-expanded', 'false');
        customSelect.setAttribute('aria-haspopup', 'listbox');

        const displayText = document.createElement('span');
        displayText.className = 'searchable-dropdown-display';
        displayText.style.flex = '1';
        displayText.style.overflow = 'hidden';
        displayText.style.textOverflow = 'ellipsis';
        displayText.style.whiteSpace = 'nowrap';

        const arrowIcon = document.createElement('i');
        arrowIcon.className = 'fas fa-chevron-down';
        arrowIcon.style.transition = 'transform 0.2s';
        arrowIcon.style.marginLeft = 'auto';

        customSelect.appendChild(displayText);
        customSelect.appendChild(arrowIcon);
        wrapper.insertBefore(customSelect, selectElement);

        // Create dropdown menu
        const dropdownMenu = document.createElement('div');
        dropdownMenu.className = 'searchable-dropdown-menu';
        dropdownMenu.style.display = 'none';
        dropdownMenu.style.position = 'absolute';
        dropdownMenu.style.top = '100%';
        dropdownMenu.style.left = '0';
        dropdownMenu.style.right = '0';
        dropdownMenu.style.zIndex = '1000';
        dropdownMenu.style.maxHeight = '300px';
        dropdownMenu.style.overflowY = 'auto';
        dropdownMenu.style.overflowX = 'hidden';
        dropdownMenu.setAttribute('role', 'listbox');
        wrapper.appendChild(dropdownMenu);

        let isOpen = false;
        let filteredOptions = [];
        let fetchTimeout = null;
        let isFetching = false;

        // Map select IDs to API endpoints
        function getApiEndpoint(selectId) {
            if (!window.API_URLS) {
                return null;
            }
            const idLower = selectId.toLowerCase();
            if (idLower.includes('vendor')) {
                return window.API_URLS.vendors;
            } else if (idLower.includes('router')) {
                return window.API_URLS.routers;
            } else if (idLower.includes('interface')) {
                return window.API_URLS.interfaces;
            } else if (idLower.includes('technology')) {
                return window.API_URLS.technologies;
            }
            return null;
        }

        // Get the property name for the data array in API response
        function getDataPropertyName(selectId) {
            const idLower = selectId.toLowerCase();
            if (idLower.includes('vendor')) {
                return 'vendors';
            } else if (idLower.includes('router')) {
                return 'routers';
            } else if (idLower.includes('interface')) {
                return 'interfaces';
            } else if (idLower.includes('technology')) {
                return 'technologies';
            }
            return null;
        }

        // Get the display field name for the option text
        function getDisplayField(selectId) {
            const idLower = selectId.toLowerCase();
            if (idLower.includes('vendor') || idLower.includes('router') || idLower.includes('interface') || idLower.includes('technology')) {
                return 'name';
            }
            return 'name';
        }

        function updateDisplay() {
            const selectedOption = selectElement.options[selectElement.selectedIndex];
            if (selectedOption && selectedOption.value) {
                displayText.textContent = selectedOption.text;
                displayText.style.color = '';
            } else {
                displayText.textContent = selectElement.options[0]?.text || 'Select...';
                displayText.style.color = '#6c757d';
            }
        }

        function buildOptions() {
            dropdownMenu.innerHTML = '';
            filteredOptions = [];

            Array.from(selectElement.options).forEach((option, index) => {
                if (option.value === '' && option.text.includes('Select')) {
                    return; // Skip placeholder options
                }

                const optionDiv = document.createElement('div');
                optionDiv.className = 'searchable-dropdown-option';
                optionDiv.textContent = option.text;
                optionDiv.setAttribute('role', 'option');
                optionDiv.setAttribute('data-value', option.value);
                optionDiv.setAttribute('data-index', index);

                if (option.value === selectElement.value) {
                    optionDiv.classList.add('selected');
                }

                optionDiv.addEventListener('click', function(e) {
                    e.stopPropagation();
                    selectElement.selectedIndex = index;
                    selectElement.dispatchEvent(new Event('change', { bubbles: true }));
                    updateDisplay();
                    closeDropdown();
                });

                optionDiv.addEventListener('mouseenter', function() {
                    dropdownMenu.querySelectorAll('.searchable-dropdown-option').forEach(opt => {
                        opt.classList.remove('hover');
                    });
                    this.classList.add('hover');
                });

                filteredOptions.push(optionDiv);
                dropdownMenu.appendChild(optionDiv);
            });
        }

        async function fetchDataFromApi(searchTerm) {
            const apiEndpoint = getApiEndpoint(selectElement.id);
            const dataProperty = getDataPropertyName(selectElement.id);
            const displayField = getDisplayField(selectElement.id);

            if (!apiEndpoint || !dataProperty || isFetching) {
                return;
            }

            isFetching = true;
            try {
                console.log(`[SearchableDropdown] Fetching data from ${apiEndpoint} with search term: "${searchTerm}"`);
                
                const url = `${apiEndpoint}?search=${encodeURIComponent(searchTerm)}&per_page=100`;
                const response = await fetch(url, {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`API request failed with status ${response.status}`);
                }

                const data = await response.json();
                const items = data[dataProperty] || [];

                console.log(`[SearchableDropdown] Received ${items.length} items from API`);

                if (items.length > 0) {
                    // Store current selected value
                    const currentValue = selectElement.value;
                    
                    // Clear existing options except placeholder
                    const placeholderOption = selectElement.options[0];
                    const placeholderText = placeholderOption && placeholderOption.value === '' ? placeholderOption.text : 'Select...';
                    
                    selectElement.innerHTML = '';
                    if (placeholderText !== 'Select...' || placeholderOption) {
                        const placeholder = document.createElement('option');
                        placeholder.value = '';
                        placeholder.textContent = placeholderText;
                        selectElement.appendChild(placeholder);
                    }

                    // Add new options from API
                    items.forEach(item => {
                        const option = document.createElement('option');
                        option.value = item.id;
                        option.textContent = item[displayField] || item.name || String(item.id);
                        selectElement.appendChild(option);
                    });

                    // Restore selected value if it still exists
                    if (currentValue) {
                        const optionExists = Array.from(selectElement.options).some(opt => opt.value === currentValue);
                        if (optionExists) {
                            selectElement.value = currentValue;
                        }
                    }

                    // Rebuild dropdown options
                    buildOptions();
                    
                    // Re-filter with current search term
                    filterOptions(searchTerm);
                } else {
                    console.log(`[SearchableDropdown] No items found for search term: "${searchTerm}"`);
                    // Show "No results" message
                    dropdownMenu.innerHTML = '<div class="searchable-dropdown-option" style="padding: 0.5rem 0.75rem; color: #6c757d; text-align: center;">No results found</div>';
                }
            } catch (error) {
                console.error(`[SearchableDropdown] Error fetching data from API:`, error);
            } finally {
                isFetching = false;
            }
        }

        function filterOptions(searchTerm) {
            const term = searchTerm.toLowerCase().trim();
            let visibleCount = 0;

            filteredOptions.forEach(option => {
                const text = option.textContent.toLowerCase();
                if (text.includes(term)) {
                    option.style.display = '';
                    visibleCount++;
                } else {
                    option.style.display = 'none';
                }
            });

            // If no visible options and search term is not empty, fetch from API
            if (visibleCount === 0 && term.length > 0) {
                // Clear existing timeout
                if (fetchTimeout) {
                    clearTimeout(fetchTimeout);
                }

                // Debounce API call to avoid too many requests
                fetchTimeout = setTimeout(() => {
                    fetchDataFromApi(searchTerm);
                }, 500); // Wait 500ms after user stops typing
            } else {
                // Clear timeout if we have matches
                if (fetchTimeout) {
                    clearTimeout(fetchTimeout);
                    fetchTimeout = null;
                }
            }

            // Highlight first visible option
            const firstVisible = Array.from(filteredOptions).find(opt => opt.style.display !== 'none');
            if (firstVisible) {
                filteredOptions.forEach(opt => opt.classList.remove('hover'));
                firstVisible.classList.add('hover');
            } else if (visibleCount === 0 && term.length > 0) {
                // Show loading message while fetching
                dropdownMenu.innerHTML = '<div class="searchable-dropdown-option" style="padding: 0.5rem 0.75rem; color: #6c757d; text-align: center;">Searching...</div>';
            }
        }

        function openDropdown() {
            if (isOpen) return;
            isOpen = true;
            customSelect.setAttribute('aria-expanded', 'true');
            dropdownMenu.style.display = 'block';
            searchInput.style.display = 'block';
            searchIcon.style.display = 'block';
            arrowIcon.style.transform = 'rotate(180deg)';
            customSelect.classList.add('active');
            buildOptions();
            searchInput.focus();
            searchInput.value = '';
        }

        function closeDropdown() {
            if (!isOpen) return;
            isOpen = false;
            customSelect.setAttribute('aria-expanded', 'false');
            dropdownMenu.style.display = 'none';
            searchInput.style.display = 'none';
            searchIcon.style.display = 'none';
            arrowIcon.style.transform = 'rotate(0deg)';
            customSelect.classList.remove('active');
            searchInput.value = '';
            filteredOptions = [];
            
            // Clear any pending fetch timeout
            if (fetchTimeout) {
                clearTimeout(fetchTimeout);
                fetchTimeout = null;
            }
        }

        // Event listeners
        customSelect.addEventListener('click', function(e) {
            e.stopPropagation();
            if (isOpen) {
                closeDropdown();
            } else {
                openDropdown();
            }
        });

        searchInput.addEventListener('input', function(e) {
            e.stopPropagation();
            filterOptions(this.value);
        });

        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const hovered = dropdownMenu.querySelector('.searchable-dropdown-option.hover');
                if (hovered) {
                    hovered.click();
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const options = Array.from(dropdownMenu.querySelectorAll('.searchable-dropdown-option:not([style*="display: none"])'));
                const currentHover = dropdownMenu.querySelector('.searchable-dropdown-option.hover');
                let nextIndex = 0;
                if (currentHover) {
                    const currentIndex = options.indexOf(currentHover);
                    nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
                }
                options.forEach(opt => opt.classList.remove('hover'));
                if (options[nextIndex]) {
                    options[nextIndex].classList.add('hover');
                    options[nextIndex].scrollIntoView({ block: 'nearest' });
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const options = Array.from(dropdownMenu.querySelectorAll('.searchable-dropdown-option:not([style*="display: none"])'));
                const currentHover = dropdownMenu.querySelector('.searchable-dropdown-option.hover');
                let prevIndex = options.length - 1;
                if (currentHover) {
                    const currentIndex = options.indexOf(currentHover);
                    prevIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
                }
                options.forEach(opt => opt.classList.remove('hover'));
                if (options[prevIndex]) {
                    options[prevIndex].classList.add('hover');
                    options[prevIndex].scrollIntoView({ block: 'nearest' });
                }
            } else if (e.key === 'Escape') {
                closeDropdown();
                customSelect.focus();
            }
        });

        customSelect.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openDropdown();
            }
        });

        // Close when clicking outside
        document.addEventListener('click', function(e) {
            if (!wrapper.contains(e.target)) {
                closeDropdown();
            }
        });

        // Update display when select changes
        selectElement.addEventListener('change', updateDisplay);

        // Initial display update
        updateDisplay();
    }

    // Initialize all searchable dropdowns
    function initSearchableDropdowns() {
        document.querySelectorAll('select.form-select:not([multiple])').forEach(select => {
            // Skip if it has very few options (like role select with 3 options)
            if (select.options.length <= 5 && !select.id.includes('Vendor') && !select.id.includes('Router') && !select.id.includes('Interface') && !select.id.includes('Technology')) {
                return;
            }
            createSearchableDropdown(select);
        });
    }

    // Auto-initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSearchableDropdowns);
    } else {
        initSearchableDropdowns();
    }

    // Re-initialize after dynamic content loads (for modals)
    const originalShow = bootstrap.Modal.prototype.show;
    bootstrap.Modal.prototype.show = function() {
        const result = originalShow.apply(this, arguments);
        setTimeout(() => {
            const modal = this._element;
            if (modal) {
                modal.querySelectorAll('select.form-select:not([multiple])').forEach(select => {
                    if (select.options.length > 5 || select.id.includes('Vendor') || select.id.includes('Router') || select.id.includes('Interface') || select.id.includes('Technology')) {
                        if (select.dataset.searchable !== 'true') {
                            createSearchableDropdown(select);
                        }
                    }
                });
            }
        }, 100);
        return result;
    };

    // Export function for manual initialization
    window.initSearchableDropdown = function(selectElement) {
        if (selectElement) {
            createSearchableDropdown(selectElement);
        } else {
            initSearchableDropdowns();
        }
    };

    window.resetSelectElement = function(selectElement) {
        if (!selectElement) {
            return;
        }
        if (selectElement.multiple) {
            Array.from(selectElement.options).forEach(option => {
                option.selected = false;
            });
        } else if (selectElement.options.length > 0) {
            selectElement.selectedIndex = 0;
        } else {
            selectElement.selectedIndex = -1;
        }
        selectElement.dispatchEvent(new Event('change', { bubbles: true }));
    };
})();

