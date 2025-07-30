// frontend/ec2/js/ec2-dedicated-hosts.js

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://127.0.0.1:5000/api';
    const tableBody = document.querySelector('#dedicatedHostsTable tbody');
    const loadingMessage = document.getElementById('loadingMessage');
    const errorMessageDiv = document.getElementById('errorMessage');
    const refreshButton = document.getElementById('refreshButton');

    async function fetchDedicatedHosts() {
        loadingMessage.style.display = 'block';
        errorMessageDiv.style.display = 'none';
        tableBody.innerHTML = '';

        try {
            const hosts = await callApi(`${API_BASE_URL}/dedicated-hosts`);
            displayDedicatedHosts(hosts);
        } catch (error) {
            console.error('Error fetching Dedicated Hosts:', error);
            errorMessageDiv.textContent = `Failed to load Dedicated Hosts: ${error.message}. Please ensure the backend is running and AWS credentials are set.`;
            errorMessageDiv.style.display = 'block';
        } finally {
            loadingMessage.style.display = 'none';
        }
    }

    function displayDedicatedHosts(hosts) {
        if (hosts.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7">No Dedicated Hosts found.</td></tr>';
            return;
        }

        hosts.forEach(host => {
            const row = tableBody.insertRow();
            row.insertCell().textContent = host.HostId || 'N/A';
            row.insertCell().textContent = host.InstanceType || 'N/A';
            row.insertCell().textContent = host.AvailabilityZone || 'N/A';
            row.insertCell().textContent = host.AllocationState || 'N/A';
            const availableCapacity = host.AvailableCapacity ? `${host.AvailableCapacity.TotalInstanceCount} total, ${host.AvailableCapacity.AvailableInstanceCount} available` : 'N/A';
            row.insertCell().textContent = availableCapacity;
            row.insertCell().textContent = host.AllocationTime ? new Date(host.AllocationTime).toLocaleString() : 'N/A';
            row.insertCell().textContent = 'No Actions';
        });
    }

    fetchDedicatedHosts();
    refreshButton.addEventListener('click', fetchDedicatedHosts);
});

