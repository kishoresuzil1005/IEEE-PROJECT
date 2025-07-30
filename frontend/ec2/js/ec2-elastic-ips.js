// frontend/ec2/js/ec2-elastic-ips.js

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://127.0.0.1:5000/api';
    const tableBody = document.querySelector('#elasticIpsTable tbody');
    const loadingMessage = document.getElementById('loadingMessage');
    const errorMessageDiv = document.getElementById('errorMessage');
    const refreshButton = document.getElementById('refreshButton');

    async function fetchElasticIPs() {
        loadingMessage.style.display = 'block';
        errorMessageDiv.style.display = 'none';
        tableBody.innerHTML = ''; // Clear existing rows

        try {
            const eips = await callApi(`${API_BASE_URL}/elastic-ips`);
            displayElasticIPs(eips);
        } catch (error) {
            console.error('Error fetching Elastic IPs:', error);
            errorMessageDiv.textContent = `Failed to load Elastic IPs: ${error.message}. Please ensure the backend is running and AWS credentials are set.`;
            errorMessageDiv.style.display = 'block';
        } finally {
            loadingMessage.style.display = 'none';
        }
    }

    function displayElasticIPs(eips) {
        if (eips.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7">No Elastic IPs found.</td></tr>';
            return;
        }

        eips.forEach(eip => {
            const row = tableBody.insertRow();
            row.insertCell().textContent = eip.PublicIp || 'N/A';
            row.insertCell().textContent = eip.AllocationId || 'N/A';
            row.insertCell().textContent = eip.AssociationId || 'N/A';
            row.insertCell().textContent = eip.InstanceId || 'N/A';
            row.insertCell().textContent = eip.PrivateIpAddress || 'N/A';
            row.insertCell().textContent = eip.Domain || 'N/A';
            // Add actions like release/associate if desired
            row.insertCell().textContent = 'No Actions'; // Placeholder
        });
    }

    fetchElasticIPs();
    refreshButton.addEventListener('click', fetchElasticIPs);
});

