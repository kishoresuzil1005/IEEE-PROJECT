// frontend/ec2/js/ec2-volumes.js

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://127.0.0.1:5000/api';
    const tableBody = document.querySelector('#volumesTable tbody');
    const loadingMessage = document.getElementById('loadingMessage');
    const errorMessageDiv = document.getElementById('errorMessage');
    const refreshButton = document.getElementById('refreshButton');

    async function fetchVolumes() {
        loadingMessage.style.display = 'block';
        errorMessageDiv.style.display = 'none';
        tableBody.innerHTML = ''; // Clear existing rows

        try {
            const volumes = await callApi(`${API_BASE_URL}/volumes`);
            displayVolumes(volumes);
        } catch (error) {
            console.error('Error fetching Volumes:', error);
            errorMessageDiv.textContent = `Failed to load Volumes: ${error.message}. Please ensure the backend is running and AWS credentials are set.`;
            errorMessageDiv.style.display = 'block';
        } finally {
            loadingMessage.style.display = 'none';
        }
    }

    function displayVolumes(volumes) {
        if (volumes.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="9">No Volumes found.</td></tr>';
            return;
        }

        volumes.forEach(volume => {
            const row = tableBody.insertRow();
            row.insertCell().textContent = volume.Name || 'N/A';
            row.insertCell().textContent = volume.VolumeId || 'N/A';
            row.insertCell().textContent = volume.Size !== undefined ? `${volume.Size} GiB` : 'N/A';
            row.insertCell().textContent = volume.AvailabilityZone || 'N/A';
            row.insertCell().textContent = volume.State || 'N/A';
            row.insertCell().textContent = volume.VolumeType || 'N/A';
            row.insertCell().textContent = volume.CreateTime ? new Date(volume.CreateTime).toLocaleString() : 'N/A';
            const attachments = volume.Attachments.map(att => `${att.InstanceId} (${att.Device})`).join(', ') || 'N/A';
            row.insertCell().textContent = attachments;
            // Add actions like detach/attach/delete if desired
            row.insertCell().textContent = 'No Actions'; // Placeholder
        });
    }

    fetchVolumes();
    refreshButton.addEventListener('click', fetchVolumes);
});

