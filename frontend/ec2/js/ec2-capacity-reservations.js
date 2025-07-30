// frontend/ec2/js/ec2-capacity-reservations.js

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://127.0.0.1:5000/api';
    const tableBody = document.querySelector('#capacityReservationsTable tbody');
    const loadingMessage = document.getElementById('loadingMessage');
    const errorMessageDiv = document.getElementById('errorMessage');
    const refreshButton = document.getElementById('refreshButton');

    async function fetchCapacityReservations() {
        loadingMessage.style.display = 'block';
        errorMessageDiv.style.display = 'none';
        tableBody.innerHTML = '';

        try {
            const crs = await callApi(`${API_BASE_URL}/capacity-reservations`);
            displayCapacityReservations(crs);
        } catch (error) {
            console.error('Error fetching Capacity Reservations:', error);
            errorMessageDiv.textContent = `Failed to load Capacity Reservations: ${error.message}. Please ensure the backend is running and AWS credentials are set.`;
            errorMessageDiv.style.display = 'block';
        } finally {
            loadingMessage.style.display = 'none';
        }
    }

    function displayCapacityReservations(crs) {
        if (crs.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="9">No Capacity Reservations found.</td></tr>';
            return;
        }

        crs.forEach(cr => {
            const row = tableBody.insertRow();
            row.insertCell().textContent = cr.CapacityReservationId || 'N/A';
            row.insertCell().textContent = cr.InstanceType || 'N/A';
            row.insertCell().textContent = cr.InstancePlatform || 'N/A';
            row.insertCell().textContent = cr.AvailabilityZone || 'N/A';
            row.insertCell().textContent = cr.TotalInstanceCount !== undefined ? cr.TotalInstanceCount : 'N/A';
            row.insertCell().textContent = cr.AvailableInstanceCount !== undefined ? cr.AvailableInstanceCount : 'N/A';
            row.insertCell().textContent = cr.State || 'N/A';
            row.insertCell().textContent = cr.CreateDate ? new Date(cr.CreateDate).toLocaleString() : 'N/A';
            row.insertCell().textContent = cr.EndDate ? new Date(cr.EndDate).toLocaleString() : 'N/A';
            row.insertCell().textContent = 'No Actions';
        });
    }

    fetchCapacityReservations();
    refreshButton.addEventListener('click', fetchCapacityReservations);
});

