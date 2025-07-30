// frontend/ec2/js/ec2-placement-groups.js

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://127.0.0.1:5000/api';
    const tableBody = document.querySelector('#placementGroupsTable tbody');
    const loadingMessage = document.getElementById('loadingMessage');
    const errorMessageDiv = document.getElementById('errorMessage');
    const refreshButton = document.getElementById('refreshButton');

    async function fetchPlacementGroups() {
        loadingMessage.style.display = 'block';
        errorMessageDiv.style.display = 'none';
        tableBody.innerHTML = '';

        try {
            const pgs = await callApi(`${API_BASE_URL}/placement-groups`);
            displayPlacementGroups(pgs);
        } catch (error) {
            console.error('Error fetching Placement Groups:', error);
            errorMessageDiv.textContent = `Failed to load Placement Groups: ${error.message}. Please ensure the backend is running and AWS credentials are set.`;
            errorMessageDiv.style.display = 'block';
        } finally {
            loadingMessage.style.display = 'none';
        }
    }

    function displayPlacementGroups(pgs) {
        if (pgs.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6">No Placement Groups found.</td></tr>';
            return;
        }

        pgs.forEach(pg => {
            const row = tableBody.insertRow();
            row.insertCell().textContent = pg.GroupName || 'N/A';
            row.insertCell().textContent = pg.GroupId || 'N/A';
            row.insertCell().textContent = pg.Strategy || 'N/A';
            row.insertCell().textContent = pg.State || 'N/A';
            row.insertCell().textContent = pg.InstanceCount !== undefined ? pg.InstanceCount : 'N/A';
            row.insertCell().textContent = 'No Actions'; // Placeholder
        });
    }

    fetchPlacementGroups();
    refreshButton.addEventListener('click', fetchPlacementGroups);
});

