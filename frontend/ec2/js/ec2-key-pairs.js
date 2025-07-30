// frontend/ec2/js/ec2-key-pairs.js

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://127.0.0.1:5000/api'; // Ensure correct API base URL
    const keyNameInput = document.getElementById('keyNameInput');
    const createKeyPairButton = document.getElementById('createKeyPairButton');
    const refreshKeyPairsButton = document.getElementById('refreshKeyPairsButton');
    const keyPairsTableBody = document.querySelector('#keyPairsTable tbody');
    const loadingMessage = document.getElementById('loadingMessage');
    const errorMessageDiv = document.getElementById('errorMessage');

    async function fetchKeyPairs() {
        loadingMessage.style.display = 'block';
        errorMessageDiv.style.display = 'none';
        keyPairsTableBody.innerHTML = ''; // Clear existing rows

        try {
            const keys = await callApi(`${API_BASE_URL}/key-pairs`); // Use new endpoint
            displayKeyPairs(keys);
        } catch (error) {
            console.error('Error fetching Key Pairs:', error);
            errorMessageDiv.textContent = `Failed to load Key Pairs: ${error.message}. Please ensure the backend is running and the correct API path is configured.`;
            errorMessageDiv.style.display = 'block';
        } finally {
            loadingMessage.style.display = 'none';
        }
    }

    function displayKeyPairs(keyPairs) {
        if (keyPairs.length === 0) {
            keyPairsTableBody.innerHTML = '<tr><td colspan="3">No Key Pairs found.</td></tr>';
            return;
        }

        keyPairs.forEach(keyPair => {
            const row = keyPairsTableBody.insertRow();
            row.insertCell().textContent = keyPair.KeyName;
            row.insertCell().textContent = keyPair.KeyFingerprint;
            const actionsCell = row.insertCell();

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'action-button delete-button';
            deleteBtn.onclick = () => handleDeleteKeyPair(keyPair.KeyName);
            actionsCell.appendChild(deleteBtn);
        });
    }

    async function handleCreateKeyPair() {
        const keyName = prompt("Enter a name for the new Key Pair:");
        if (!keyName) return; // User cancelled or entered empty

        try {
            const response = await callApi(`${API_BASE_URL}/key-pair/create`, { // Use new endpoint
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ key_name: keyName })
            });
            alert(response.message);
            fetchKeyPairs(); // Refresh the list
        } catch (error) {
            console.error('Error creating Key Pair:', error);
            alert(`Error creating Key Pair: ${error.message}`);
        }
    }

    async function handleDeleteKeyPair(keyName) {
        if (confirm(`Are you sure you want to delete key pair "${keyName}"?`)) {
            try {
                const response = await callApi(`${API_BASE_URL}/key-pair/${keyName}/delete`, { // Use new endpoint
                    method: 'POST'
                });
                alert(response.message);
                fetchKeyPairs(); // Refresh the list
            } catch (error) {
                console.error('Error deleting Key Pair:', error);
                alert(`Error deleting Key Pair: ${error.message}`);
            }
        }
    }

    // Event Listeners
    createKeyPairButton.addEventListener('click', handleCreateKeyPair);
    refreshKeyPairsButton.addEventListener('click', fetchKeyPairs);

    // Initial fetch
    fetchKeyPairs();
});

