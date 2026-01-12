// Initialize
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('calculateBtn').addEventListener('click', calculateSubnets);
    document.getElementById('clearBtn').addEventListener('click', clearForm);
    document.getElementById('exportBtn').addEventListener('click', exportToCSV);
    
    // Allow Enter key to trigger calculation
    document.getElementById('baseSubnet').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            calculateSubnets();
        }
    });
    document.getElementById('numSubnets').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            calculateSubnets();
        }
    });
}

let currentResults = [];

async function calculateSubnets() {
    const baseSubnet = document.getElementById('baseSubnet').value.trim();
    const numSubnets = parseInt(document.getElementById('numSubnets').value);
    
    if (!baseSubnet || !numSubnets || numSubnets < 2) {
        showToast('Error', 'Please enter a valid base subnet and number of subnets (minimum 2)', 'error');
        return;
    }
    
    try {
        const response = await apiRequest(window.API_URLS.subnetCalculator, {
            method: 'POST',
            body: JSON.stringify({
                base_subnet: baseSubnet,
                num_subnets: numSubnets
            })
        });
        
        currentResults = response.subnets;
        displayResults(response);
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

function displayResults(data) {
    const resultsSection = document.getElementById('resultsSection');
    const summaryAlert = document.getElementById('summaryAlert');
    const tableBody = document.getElementById('resultsTableBody');
    
    // Show results section
    resultsSection.style.display = 'block';
    
    // Update summary
    summaryAlert.innerHTML = `
        <strong>Calculation Summary:</strong><br>
        Base Subnet: <code>${data.base_subnet}</code><br>
        Number of Subnets: <strong>${data.num_subnets}</strong><br>
        Subnet Mask: <code>${data.subnet_mask}</code> (/${data.cidr_prefix})<br>
        Hosts per Subnet: <strong>${data.hosts_per_subnet}</strong>
    `;
    
    // Populate table
    tableBody.innerHTML = data.subnets.map((subnet, index) => `
        <tr>
            <td>${index + 1}</td>
            <td><code>${subnet.network_address}</code></td>
            <td><code>${subnet.subnet_mask}</code></td>
            <td><code>${subnet.cidr_notation}</code></td>
            <td><span class="badge bg-info">${subnet.usable_hosts}</span></td>
            <td><code>${subnet.first_host}</code></td>
            <td><code>${subnet.last_host}</code></td>
            <td><code>${subnet.broadcast_address}</code></td>
        </tr>
    `).join('');
    
    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearForm() {
    document.getElementById('subnetCalculatorForm').reset();
    document.getElementById('resultsSection').style.display = 'none';
    currentResults = [];
}

function exportToCSV() {
    if (currentResults.length === 0) {
        showToast('Error', 'No results to export', 'error');
        return;
    }
    
    // Create CSV content
    const headers = ['#', 'Subnet Address', 'Subnet Mask', 'CIDR Notation', 'Usable Hosts', 'First Host', 'Last Host', 'Broadcast'];
    const rows = currentResults.map((subnet, index) => [
        index + 1,
        subnet.network_address,
        subnet.subnet_mask,
        subnet.cidr_notation,
        subnet.usable_hosts,
        subnet.first_host,
        subnet.last_host,
        subnet.broadcast_address
    ]);
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subnets_${new Date().getTime()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showToast('Success', 'CSV file downloaded successfully', 'success');
}

