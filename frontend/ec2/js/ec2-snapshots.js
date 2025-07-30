// frontend/ec2/js/ec2-snapshots.js

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://127.0.0.1:5000/api';
    const tableBody = document.querySelector('#snapshotsTable tbody');
    const loadingMessage = document.getElementById('loadingMessage');
    const errorMessageDiv = document.getElementById('errorMessage');
    const refreshButton = document.getElementById('refreshButton');

    async function fetchSnapshots() {
        loadingMessage.style.display = 'block';
        errorMessageDiv.style.display = 'none';
        tableBody.innerHTML = ''; // Clear existing rows

        try {
            const snapshots = await callApi(`${API_BASE_URL}/snapshots`);
            displaySnapshots(snapshots);
        } catch (error) {
            console.error('Error fetching Snapshots:', error);
            errorMessageDiv.textContent = `Failed to load Snapshots: ${error.message}. Please ensure the backend is running and AWS credentials are set.`;
            errorMessageDiv.style.display = 'block';
        } finally {
            loadingMessage.style.display = 'none';
        }
    }

    function displaySnapshots(snapshots) {
        if (snapshots.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8">No Snapshots found.</td></tr>';
            return;
        }

        snapshots.forEach(snapshot => {
            const row = tableBody.insertRow();
            row.insertCell().textContent = snapshot.Name || 'N/A'; // Display name if available
            row.insertCell().textContent = snapshot.SnapshotId || 'N/A';
            row.insertCell().textContent = snapshot.VolumeId || 'N/A';
            row.insertCell().textContent = snapshot.State || 'N/A';
            row.insertCell().textContent = snapshot.StartTime ? new Date(snapshot.StartTime).toLocaleString() : 'N/A';
            row.insertCell().textContent = snapshot.VolumeSize !== undefined ? `${snapshot.VolumeSize} GiB` : 'N/A';
            row.insertCell().textContent = snapshot.Description || 'N/A';
            // Add actions here if you want to implement delete/create volume from snapshot
            row.insertCell().textContent = 'No Actions'; // Placeholder
        });
    }

    fetchSnapshots();
    refreshButton.addEventListener('click', fetchSnapshots);
});

